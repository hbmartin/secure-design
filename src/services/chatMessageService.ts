import * as vscode from 'vscode';
import type { AgentService } from '../types/agent';
import type { ModelMessage } from 'ai';
import { ProviderService } from '../providers/ProviderService';
import { Logger } from './logger';
import { getProvider } from '../providers/VsCodeConfiguration';

export class ChatMessageService {
    private currentRequestController?: AbortController;
    private readonly providerService: ProviderService;

    constructor(
        private readonly agentService: AgentService,
        private readonly outputChannel: vscode.OutputChannel
    ) {
        this.providerService = ProviderService.getInstance();
    }

    async handleChatMessage(message: any, webview: vscode.Webview): Promise<void> {
        Logger.debug('[ChatMessageService] handleChatMessage called', {
            hasHistory: !!message.chatHistory,
            historyLength: message.chatHistory?.length ?? 0,
            hasMessage: !!message.message,
        });
        try {
            const chatHistory: ModelMessage[] = message.chatHistory ?? [];
            const latestMessage = message.message ?? '';

            Logger.debug(`chatHistory size=${chatHistory.length}`);
            Logger.debug('[ChatMessageService] Processing chat message', {
                historyLength: chatHistory.length,
                latestMessageLength: latestMessage.length,
            });

            Logger.info(`Chat message received with ${chatHistory.length} history messages`);
            Logger.info(`Latest message: ${latestMessage}`);

            // Create new AbortController for this request
            this.currentRequestController = new AbortController();

            // Send initial streaming start message
            Logger.debug('[ChatMessageService] Sending chatStreamStart command');
            webview.postMessage({
                command: 'chatStreamStart',
            });

            // Debug log chat history with VS Code output channel
            this.outputChannel.appendLine('=== CHAT HISTORY DEBUG ===');
            this.outputChannel.appendLine(`📥 Input: ${chatHistory.length} CoreMessage messages`);

            // Log each message
            this.outputChannel.appendLine('📋 Chat history:');
            chatHistory.forEach((msg, index) => {
                const content =
                    typeof msg.content === 'string'
                        ? msg.content
                        : Array.isArray(msg.content)
                          ? msg.content
                                .map(part =>
                                    part.type === 'text'
                                        ? part.text
                                        : part.type === 'tool-call'
                                          ? `[tool-call: ${part.toolName}]`
                                          : part.type === 'tool-result'
                                            ? `[tool-result: ${part.toolName}]`
                                            : `[${part.type}]`
                                )
                                .join(', ')
                          : '[complex content]';

                this.outputChannel.appendLine(`  [${index}] ${msg.role}: ${content}`);
            });

            this.outputChannel.appendLine('=== END CHAT HISTORY DEBUG ===');

            // Use conversation history or single prompt
            let response: any[];
            if (chatHistory.length > 0) {
                // Use conversation history - CoreMessage format is already compatible
                Logger.debug('[ChatMessageService] Using conversation history mode');
                this.outputChannel.appendLine(
                    `Using conversation history with ${chatHistory.length} messages`
                );
                response = await this.agentService.query(
                    undefined, // no prompt
                    chatHistory, // use CoreMessage array directly
                    undefined,
                    this.currentRequestController,
                    (streamMessage: any) => {
                        // Process and send each message as it arrives
                        this.handleStreamMessage(streamMessage, webview);
                    }
                );
            } else {
                // Fallback to single prompt for first message
                Logger.debug('[ChatMessageService] Using single prompt mode');
                this.outputChannel.appendLine('No conversation history, using single prompt');
                response = await this.agentService.query(
                    latestMessage, // use latest message as prompt
                    undefined, // no messages array
                    undefined,
                    this.currentRequestController,
                    (streamMessage: any) => {
                        // Process and send each message as it arrives
                        this.handleStreamMessage(streamMessage, webview);
                    }
                );
            }

            // Check if request was aborted
            if (this.currentRequestController.signal.aborted) {
                Logger.debug('[ChatMessageService] Request was aborted');
                Logger.warn('Request was aborted');
                return;
            }

            Logger.info(`Agent response completed with ${response.length} total messages`);

            // Send stream end message
            webview.postMessage({
                command: 'chatStreamEnd',
            });
        } catch (error) {
            // Check if the error is due to abort
            if (this.currentRequestController?.signal.aborted) {
                Logger.info('Request was stopped by user');
                webview.postMessage({
                    command: 'chatStopped',
                });
                return;
            }

            Logger.error(`Chat message failed: ${error}`);
            Logger.error(`Error type: ${typeof error}, constructor: ${error?.constructor?.name}`);

            // Check if this is an API key authentication error or process failure
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error(`Processing error message: "${errorMessage}"`);
            if (
                this.agentService.isApiKeyAuthError(errorMessage) ||
                !this.agentService.hasApiKey()
            ) {
                // Get current provider information
                const provider = getProvider();

                // Get provider metadata
                const providerMetadata = this.providerService.getProviderMetadata(provider);

                const hasApiKey = this.agentService.hasApiKey();
                const displayMessage = hasApiKey
                    ? `Invalid ${providerMetadata.name} API key. Please check your configuration.`
                    : `${providerMetadata.name} API key not configured. Please set up your API key to use this AI model.`;

                webview.postMessage({
                    command: 'chatErrorWithActions',
                    error: displayMessage,
                    actions: [
                        {
                            text: `Configure ${providerMetadata.name} API Key`,
                            command: providerMetadata.configureCommand,
                        },
                        {
                            text: 'Open Settings',
                            command: 'workbench.action.openSettings',
                            args: '@ext:HaroldMartin.securedesign',
                        },
                    ],
                });
            } else {
                // Regular error - show standard error message
                vscode.window.showErrorMessage(`Chat failed: ${error}`);
                webview.postMessage({
                    command: 'chatError',
                    error: errorMessage,
                });
            }
        } finally {
            // Clear the controller when done
            this.currentRequestController = undefined;
        }
    }

    private handleStreamMessage(message: ModelMessage, webview: vscode.Webview): void {
        Logger.debug(`Handling ModelMessage: ${JSON.stringify(message, null, 2)}`);

        // Check if this is an update to existing message
        const isUpdate = (message as any)._isUpdate;

        // Handle assistant messages
        if (message.role === 'assistant') {
            if (typeof message.content === 'string') {
                // Simple text content
                if (message.content.trim()) {
                    webview.postMessage({
                        command: 'chatResponseChunk',
                        messageType: 'assistant',
                        content: message.content,
                        metadata: {},
                    });
                }
            } else if (Array.isArray(message.content)) {
                // Handle assistant content array (text parts, tool calls, etc.)
                for (const part of message.content) {
                    if (part.type === 'text' && (part as any).text) {
                        // Send text content
                        webview.postMessage({
                            command: 'chatResponseChunk',
                            messageType: 'assistant',
                            content: (part as any).text,
                            metadata: {},
                        });
                    } else if (part.type === 'tool-call') {
                        // Send tool call or update
                        const toolPart = part as any;

                        const toolInput = toolPart.args ?? toolPart.input ?? toolPart.params;
                        if (isUpdate) {
                            // Send tool parameter update
                            webview.postMessage({
                                command: 'chatToolUpdate',
                                tool_use_id: toolPart.toolCallId,
                                tool_input: toolInput,
                            });
                        } else {
                            // Send new tool call message
                            webview.postMessage({
                                command: 'chatResponseChunk',
                                messageType: 'tool-call',
                                content: '',
                                metadata: {
                                    tool_name: toolPart.toolName,
                                    tool_id: toolPart.toolCallId,
                                    tool_input: toolInput,
                                },
                            });
                        }
                    }
                }
            }
        }

        // Handle tool messages (CoreToolMessage)
        if (message.role === 'tool' && Array.isArray(message.content)) {
            for (const toolResultPart of message.content) {
                if (toolResultPart.type === 'tool-result') {
                    const part = toolResultPart as any;
                    const content =
                        typeof part.result === 'string'
                            ? part.result
                            : JSON.stringify(part.result, null, 2);

                    Logger.debug(`Tool result for ${part.toolCallId}: ${content}`);

                    // Send tool result to frontend
                    webview.postMessage({
                        command: 'chatResponseChunk',
                        messageType: 'tool-result',
                        content: content,
                        metadata: {
                            tool_id: part.toolCallId,
                            tool_name: part.toolName,
                            is_error: part.isError ?? false,
                        },
                    });

                    // Also send completion signal
                    webview.postMessage({
                        command: 'chatToolResult',
                        tool_use_id: part.toolCallId,
                        content: content,
                        is_error: part.isError ?? false,
                    });
                }
            }
        }

        // Handle user messages
        if (message.role === 'user') {
            if (typeof message.content === 'string' && message.content.trim()) {
                webview.postMessage({
                    command: 'chatResponseChunk',
                    messageType: 'user',
                    content: message.content,
                    metadata: {},
                });
            }
        }

        // Skip other message types (system, etc.)
    }

    async stopCurrentChat(webview: vscode.Webview): Promise<void> {
        if (this.currentRequestController) {
            Logger.info('Stopping current chat request');
            this.currentRequestController.abort();

            // Send stopped message back to webview
            await webview.postMessage({
                command: 'chatStopped',
            });
        } else {
            Logger.info('No active chat request to stop');
        }
    }
}
