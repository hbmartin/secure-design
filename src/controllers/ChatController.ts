import * as vscode from 'vscode';
import type { AgentService } from '../types/agent';
import type { WorkspaceStateService } from '../services/workspaceStateService';
import type { ProviderService } from '../providers/ProviderService';
// Removed WebviewApiProvider import to avoid circular dependency
import type { ChatMessage } from '../types/chatMessage';
import type { ModelMessage } from 'ai';
import { getModel } from '../providers/VsCodeConfiguration';
import { Logger } from '../services/logger';
import type { VsCodeConfiguration, ProviderId } from '../providers/types';
import type { ViewEvents, ChatChunkMetadata } from '../api/viewApi';
import type { LanguageModelV2ToolResultOutput } from '@ai-sdk/provider';

/**
 * Interface for event triggering capability to avoid circular dependencies
 */
interface EventTrigger {
    triggerEvent<E extends keyof ViewEvents>(key: E, ...params: Parameters<ViewEvents[E]>): void;
}

/**
 * ChatController handles all chat-related business logic and coordinates between services.
 * This separates business logic from the API provider and makes the system more testable.
 */
export class ChatController {
    private currentRequestController?: AbortController;

    constructor(
        private readonly agentService: AgentService,
        private readonly workspaceState: WorkspaceStateService,
        private readonly providerService: ProviderService,
        private readonly eventTrigger: EventTrigger,
        private readonly outputChannel: vscode.OutputChannel
    ) {}

    /**
     * Handle chat message with improved architecture and event-driven responses
     */
    async handleChatMessage(payload: {
        message: string;
        chatHistory: ChatMessage[];
    }): Promise<void> {
        try {
            Logger.info(
                `Chat message received with ${payload.chatHistory.length} history messages`
            );
            Logger.info(`Latest message: ${payload.message}`);

            // Create new AbortController for this request
            this.currentRequestController = new AbortController();

            // Trigger stream start event
            this.eventTrigger.triggerEvent('chatStreamStart');

            // Debug log chat history
            this.outputChannel.appendLine('=== CHAT HISTORY DEBUG ===');
            this.outputChannel.appendLine(
                `📥 Input: ${payload.chatHistory.length} ChatMessage messages`
            );

            // ChatMessage extends ModelMessage, so we can use them directly
            const modelMessages: ModelMessage[] = payload.chatHistory;

            let response: ModelMessage[];

            if (modelMessages.length > 0) {
                Logger.info('Using conversation history for context');
                response = await this.agentService.query(
                    payload.message,
                    modelMessages,
                    undefined,
                    this.currentRequestController,
                    (streamMessage: ModelMessage) => {
                        this.handleStreamMessage(streamMessage);
                    }
                );
            } else {
                Logger.info('No conversation history, using single prompt');
                response = await this.agentService.query(
                    payload.message,
                    undefined,
                    undefined,
                    this.currentRequestController,
                    (streamMessage: ModelMessage) => {
                        this.handleStreamMessage(streamMessage);
                    }
                );
            }

            // Check if request was aborted
            if (this.currentRequestController.signal.aborted) {
                Logger.warn('Request was aborted');
                return;
            }

            Logger.info(`Agent response completed with ${response.length} total messages`);

            // Trigger stream end event
            this.eventTrigger.triggerEvent('chatStreamEnd');
        } catch (error) {
            // Check if the error is due to abort
            if (this.currentRequestController?.signal.aborted) {
                Logger.info('Request was stopped by user');
                this.eventTrigger.triggerEvent('chatStopped');
                return;
            }

            Logger.error(`Chat message failed: ${error}`);

            const errorMessage = error instanceof Error ? error.message : String(error);

            // Check if this is an API key authentication error
            if (this.agentService.isApiKeyAuthError?.(errorMessage)) {
                Logger.error('API key authentication error detected');
                this.eventTrigger.triggerEvent('chatError', errorMessage, [
                    {
                        text: 'Open Settings',
                        command: 'workbench.action.openSettings',
                        args: '@ext:HaroldMartin.securedesign',
                    },
                ]);
            } else {
                // Regular error - show standard error message
                vscode.window.showErrorMessage(`Chat failed: ${error}`);
                this.eventTrigger.triggerEvent('chatError', errorMessage);
            }
        } finally {
            // Clear the controller when done
            this.currentRequestController = undefined;
        }
    }

    /**
     * Handle individual stream messages and trigger appropriate events
     */
    private handleStreamMessage(message: ModelMessage): void {
        Logger.debug(`Handling ModelMessage: ${JSON.stringify(message, null, 2)}`);

        // Handle assistant messages
        if (message.role === 'assistant') {
            if (typeof message.content === 'string') {
                // Simple text content
                if (message.content.trim()) {
                    this.eventTrigger.triggerEvent(
                        'chatResponseChunk',
                        message.content,
                        'assistant',
                        {}
                    );
                }
            } else if (Array.isArray(message.content)) {
                // Handle assistant content array (text parts, tool calls, etc.)
                for (const part of message.content) {
                    if (part.type === 'text' && (part as any).text) {
                        // Send text content
                        this.eventTrigger.triggerEvent(
                            'chatResponseChunk',
                            (part as any).text,
                            'assistant',
                            {}
                        );
                    } else if (part.type === 'tool-call') {
                        // Send tool call with standardized metadata schema
                        const metadata: ChatChunkMetadata = {
                            tool_id: (part as any).toolCallId,
                            tool_name: (part as any).toolName,
                            args: (part as any).args ?? (part as any).input, // Standardize on 'args' field
                        };
                        this.eventTrigger.triggerEvent(
                            'chatResponseChunk',
                            '',
                            'tool-call',
                            metadata
                        );
                    }
                }
            }
        } else if (message.role === 'tool') {
            // Handle tool results
            if (Array.isArray(message.content)) {
                for (const part of message.content) {
                    if (part.type === 'tool-result') {
                        const toolResultPart = part as any;
                        if (!('output' in toolResultPart)) {
                            Logger.warn(
                                `Tool result part missing output field: ${JSON.stringify(part)}`
                            );
                            continue;
                        }
                        const rawOutput = toolResultPart.output;

                        // Ensure the output conforms to LanguageModelV2ToolResultOutput interface
                        // The AI SDK should already provide this in the correct format
                        const aiSdkOutput: LanguageModelV2ToolResultOutput =
                            this.normalizeToolResultOutput(rawOutput);

                        const metadata: ChatChunkMetadata = {
                            tool_id: (part as any).toolCallId,
                            tool_name: (part as any).toolName,
                            output: aiSdkOutput,
                        };
                        // Pass empty string as chunk since the actual data is in metadata
                        this.eventTrigger.triggerEvent(
                            'chatResponseChunk',
                            '',
                            'tool-result',
                            metadata
                        );
                    }
                }
            }
        }
    }

    /**
     * Normalize tool result output to ensure AI SDK compliance
     * Handles various output formats and converts them to LanguageModelV2ToolResultOutput
     */
    private normalizeToolResultOutput(rawOutput: any): LanguageModelV2ToolResultOutput {
        // If it's already in the correct format, return as-is
        if (rawOutput && typeof rawOutput === 'object' && rawOutput.type) {
            // Validate it's a valid LanguageModelV2ToolResultOutput type
            const validTypes = ['text', 'json', 'error-text', 'error-json', 'content'];
            if (validTypes.includes(rawOutput.type)) {
                return rawOutput as LanguageModelV2ToolResultOutput;
            }
        }

        // Handle legacy or non-conformant outputs
        if (typeof rawOutput === 'string') {
            // String output -> text type
            return { type: 'text', value: rawOutput };
        }

        if (rawOutput === null || rawOutput === undefined) {
            // Null/undefined -> empty text
            return { type: 'text', value: '' };
        }

        if (typeof rawOutput === 'object') {
            // Complex object -> json type
            return { type: 'json', value: rawOutput };
        }

        // Fallback for primitives -> convert to string
        return { type: 'text', value: String(rawOutput) };
    }

    /**
     * Stop current chat request
     */
    stopChat(): void {
        if (this.currentRequestController) {
            Logger.info('Stopping current chat request');
            this.currentRequestController.abort();
            this.eventTrigger.triggerEvent('chatStopped');
        } else {
            Logger.info('No active chat request to stop');
        }
    }

    /**
     * Get current provider configuration
     */
    getCurrentProvider(): { providerId: string; model: string } {
        const modelToUse = getModel();
        return {
            providerId: modelToUse?.providerId ?? 'anthropic',
            model: modelToUse?.id ?? 'claude-3-5-sonnet-20241022',
        };
    }

    /**
     * Change provider configuration
     */
    async changeProvider(payload: { providerId: string; model: string }): Promise<void> {
        const config = vscode.workspace.getConfiguration('securedesign');

        // Update configuration
        await config.update(
            'aiModelProvider',
            payload.providerId,
            vscode.ConfigurationTarget.Global
        );
        await config.update('aiModel', payload.model, vscode.ConfigurationTarget.Global);

        // Validate credentials
        const providerConfig: VsCodeConfiguration = {
            config: config,
            outputChannel: this.outputChannel,
        };

        const validation = this.providerService.validateCredentialsForProvider(
            payload.providerId as ProviderId,
            providerConfig
        );

        if (!validation.isValid) {
            const providerMetadata = this.providerService.getProviderMetadata(
                payload.providerId as ProviderId
            );
            const displayName = `${providerMetadata.name} (${this.providerService.getModelDisplayName(payload.model, payload.providerId as ProviderId)})`;

            const result = await vscode.window.showWarningMessage(
                `${displayName} selected, but credentials are not configured. Would you like to configure them now?`,
                'Configure Credentials',
                'Later'
            );

            if (result === 'Configure Credentials') {
                await vscode.commands.executeCommand(providerMetadata.configureCommand);
            }
        }

        // Trigger provider changed event
        this.eventTrigger.triggerEvent('providerChanged', payload.providerId, payload.model);
    }

    /**
     * Get workspace state service for history operations
     */
    getWorkspaceState(): WorkspaceStateService {
        return this.workspaceState;
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        if (this.currentRequestController) {
            this.currentRequestController.abort();
            this.currentRequestController = undefined;
        }
    }
}
