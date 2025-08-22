import * as vscode from 'vscode';
import type { AgentService } from '../types/agent';
import type { WorkspaceStateService } from '../services/workspaceStateService';
import type { ProviderService } from '../providers/ProviderService';
// Removed WebviewApiProvider import to avoid circular dependency
import type { ChatMessage } from '../types/chatMessage';
import type { ModelMessage } from 'ai';
import { getModel } from '../providers/VsCodeConfiguration';
import { getLogger, Logger } from '../services/logger';
import type { VsCodeConfiguration, ProviderId } from '../providers/types';
import type { ViewEvents, ChatChunkMetadata, ViewAPI } from '../api/viewApi';
import type { LanguageModelV2ToolResultOutput } from '@ai-sdk/provider';
import { LogLevel } from '../services/ILogger';

/**
 * Interface for event triggering capability to avoid circular dependencies
 */
export interface EventTrigger {
    triggerEvent<E extends keyof ViewEvents>(key: E, ...params: Parameters<ViewEvents[E]>): void;
}

/**
 * ChatController handles all chat-related business logic and coordinates between services.
 * This separates business logic from the API provider and makes the system more testable.
 */
export class ChatController implements ViewAPI {
    private currentRequestController?: AbortController;
    private readonly logger = getLogger('ChatController');

    constructor(
        private readonly agentService: AgentService,
        private readonly workspaceState: WorkspaceStateService,
        private readonly providerService: ProviderService,
        private readonly eventTrigger: EventTrigger
    ) {}

    clearChatHistory = async (): Promise<void> => {
        this.logger.debug('API: clearChatHistory called');
        await this.workspaceState.clearChatHistory();
    };
    saveChatHistory = async (history: ChatMessage[]): Promise<void> => {
        this.logger.debug(`API: saveChatHistory called with ${history.length} messages`);
        await this.workspaceState.saveChatHistory(history);
    };

    // eslint-disable-next-line @typescript-eslint/require-await
    loadChatHistory = async (): Promise<ChatMessage[]> => {
        this.logger.debug('Loading chat history');
        return this.workspaceState.getChatHistory();
    };

    selectFile = async (): Promise<string | null> => {
        this.logger.info('API: selectFile called');
        const files = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'All Files': ['*'],
                'Code Files': [
                    'js',
                    'ts',
                    'jsx',
                    'tsx',
                    'py',
                    'java',
                    'cpp',
                    'c',
                    'cs',
                    'go',
                    'rs',
                    'php',
                ],
                'Text Files': ['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'toml'],
                'Config Files': ['config', 'conf', 'env', 'ini'],
            },
        });
        return files?.[0]?.fsPath ?? null;
    };
    selectFolder = async (): Promise<string | null> => {
        this.logger.info('API: selectFolder called');
        const folders = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
        });
        return folders?.[0]?.fsPath ?? null;
    };

    selectImages = async (): Promise<string[] | null> => {
        this.logger.info('API: selectImages called');
        const images = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            filters: {
                Images: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'],
            },
        });
        return images?.map(img => img.fsPath) ?? null;
    };

    showInformationMessage = (message: string): void => {
        this.logger.info(`API: showInformationMessage called: ${message}`);
        vscode.window.showInformationMessage(message);
    };

    showErrorMessage = (message: string): void => {
        this.logger.info(`API: showErrorMessage called: ${message}`);
        vscode.window.showErrorMessage(message);
    };

    executeCommand = async (command: string, args?: any): Promise<void> => {
        this.logger.info(`API: executeCommand called: ${command}`);
        if (args) {
            await vscode.commands.executeCommand(command, args);
        } else {
            await vscode.commands.executeCommand(command);
        }
    };

    getBase64Image = async (filePath: string): Promise<string> => {
        this.logger.debug(`API: getBase64Image called for: ${filePath}`);
        try {
            const fileUri = vscode.Uri.file(filePath);
            const fileData = await vscode.workspace.fs.readFile(fileUri);

            // Determine MIME type from file extension
            const extension = filePath.toLowerCase().split('.').pop();
            let mimeType: string;
            // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
            switch (extension) {
                case 'jpg':
                case 'jpeg':
                    mimeType = 'image/jpeg';
                    break;
                case 'png':
                    mimeType = 'image/png';
                    break;
                case 'gif':
                    mimeType = 'image/gif';
                    break;
                case 'bmp':
                    mimeType = 'image/bmp';
                    break;
                case 'webp':
                    mimeType = 'image/webp';
                    break;
                case 'svg':
                    mimeType = 'image/svg+xml';
                    break;
                default:
                    mimeType = 'application/octet-stream';
            }

            const base64Data = Buffer.from(fileData).toString('base64');
            return `data:${mimeType};base64,${base64Data}`;
        } catch (error) {
            this.logger.error(`Failed to convert image to base64: ${error}`);
            throw new Error(
                `Failed to read image file: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    };

    saveImageToMoodboard = async (data: {
        fileName: string;
        originalName: string;
        base64Data: string;
        mimeType: string;
        size: number;
    }): Promise<string | Error> => {
        this.logger.debug('Saving image to moodboard', {
            fileName: data.fileName,
            originalName: data.originalName,
            mimeType: data.mimeType,
            size: data.size,
        });

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        try {
            // Create .superdesign/moodboard directory if it doesn't exist
            const moodboardDir = vscode.Uri.joinPath(
                workspaceFolder.uri,
                '.superdesign',
                'moodboard'
            );

            try {
                await vscode.workspace.fs.stat(moodboardDir);
            } catch {
                await vscode.workspace.fs.createDirectory(moodboardDir);
            }

            // Convert base64 to buffer and save file
            const base64Content = data.base64Data.split(',')[1];
            const buffer = Buffer.from(base64Content, 'base64');
            const filePath = vscode.Uri.joinPath(moodboardDir, data.fileName);

            await vscode.workspace.fs.writeFile(filePath, buffer);

            return filePath.toString();
        } catch (error) {
            return error instanceof Error ? error : new Error(String(error));
        }
    };

    log = (level: LogLevel, message: string, data?: Record<any, any>): void => {
        // Use the logger static methods based on level
        switch (level) {
            case LogLevel.DEBUG:
                Logger.debug(message, data);
                break;
            case LogLevel.INFO:
                Logger.info(message, data);
                break;
            case LogLevel.WARN:
                Logger.warn(message, data);
                break;
            case LogLevel.ERROR:
                Logger.error(message, data);
                break;
        }
    };

    checkCanvasStatus = (): Promise<boolean> => {
        this.logger.info('API: checkCanvasStatus called');
        // Check if SuperdesignCanvasPanel is currently open
        const panels = vscode.window.tabGroups.all.flatMap(group => group.tabs);
        const canvasPanel = panels.find(
            tab =>
                tab.label === 'Securedesign Canvas' ||
                (tab.input as any)?.viewType === 'securedesign.canvas'
        );
        return Promise.resolve(!!canvasPanel);
    };

    openCanvas = async (): Promise<void> => {
        this.logger.debug('Opening canvas');
        await vscode.commands.executeCommand('securedesign.openCanvas');
    };

    initializeSecuredesign = async (): Promise<void> => {
        this.logger.debug('Initializing Securedesign project');
        await vscode.commands.executeCommand('securedesign.initializeProject');
    };

    async sendChatMessage(message: string, chatHistory: ChatMessage[]): Promise<void> {
        try {
            this.logger.debug('sendChatMessage', {
                messageLength: message.length,
                historyLength: chatHistory.length,
            });

            this.currentRequestController = new AbortController();
            this.eventTrigger.triggerEvent('chatStreamStart');
            const modelMessages: ModelMessage[] = chatHistory;

            let response: ModelMessage[];

            if (modelMessages.length > 0) {
                Logger.info('Using conversation history for context');
                response = await this.agentService.query(
                    message,
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
                    message,
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
    getCurrentProvider(): Promise<{ providerId: ProviderId; model: string }> {
        const modelToUse = getModel();
        return Promise.resolve({
            providerId: modelToUse?.providerId ?? 'anthropic',
            model: modelToUse?.id ?? 'claude-3-5-sonnet-20241022',
        });
    }

    /**
     * Change provider configuration
     */
    async changeProvider(
        providerId: string,
        model: string
    ): Promise<{ success: boolean; provider: string; model: string }> {
        Logger.info(`[ChatController] Starting changeProvider: ${providerId}, ${model}`);

        try {
            const config = vscode.workspace.getConfiguration('securedesign');

            // Update configuration
            Logger.debug('[ChatController] Updating aiModelProvider configuration');
            await config.update('aiModelProvider', providerId, vscode.ConfigurationTarget.Global);

            Logger.debug('[ChatController] Updating aiModel configuration');
            await config.update('aiModel', model, vscode.ConfigurationTarget.Global);

            // Validate credentials
            Logger.debug('[ChatController] Validating provider credentials');
            const providerConfig: VsCodeConfiguration = {
                config: config,
                logger: Logger,
            };

            const validation = this.providerService.validateCredentialsForProvider(
                providerId as ProviderId,
                providerConfig
            );

            if (!validation.isValid) {
                Logger.warn(
                    '[ChatController] Provider credentials not valid, showing warning dialog'
                );
                const providerMetadata = this.providerService.getProviderMetadata(
                    providerId as ProviderId
                );
                const displayName = `${providerMetadata.name} (${this.providerService.getModelDisplayName(model, providerId as ProviderId)})`;

                const result = await vscode.window.showWarningMessage(
                    `${displayName} selected, but credentials are not configured. Would you like to configure them now?`,
                    'Configure Credentials',
                    'Later'
                );

                if (result === 'Configure Credentials') {
                    Logger.debug('[ChatController] User chose to configure credentials');
                    await vscode.commands.executeCommand(providerMetadata.configureCommand);
                }
            } else {
                Logger.debug('[ChatController] Provider credentials are valid');
            }

            // Trigger provider changed event
            Logger.debug('[ChatController] Triggering providerChanged event');
            this.eventTrigger.triggerEvent('providerChanged', providerId, model);

            Logger.info(
                `[ChatController] Successfully changed provider to: ${providerId}, ${model}`
            );

            // Return success response
            return {
                success: true,
                provider: providerId,
                model: model,
            };
        } catch (error) {
            Logger.error('[ChatController] changeProvider failed:', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error; // Re-throw to propagate the error
        }
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
