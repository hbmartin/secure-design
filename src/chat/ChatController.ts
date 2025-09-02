import * as vscode from 'vscode';
import type { AgentService } from '../types/agent';
import type { WorkspaceStateService } from '../services/workspaceStateService';
import type { ProviderService } from '../providers/ProviderService';
import type ChatMessagesRepository from './ChatMessagesRepository';
import type { ChatMessage } from '../types/chatMessage';
import { getLogger, Logger } from '../services/logger';
import type { VsCodeConfiguration, ProviderId } from '../providers/types';
import type { ViewEvents, ViewAPI } from '../api/viewApi';
import { handleStreamMessage } from './ChatMiddleware';
import type { TextPart, ImagePart, FilePart } from '@ai-sdk/provider-utils';

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
        private readonly eventTrigger: EventTrigger,
        private readonly chatMessagesRepository: ChatMessagesRepository
    ) {}

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

    async sendChatMessage(prompt: string | Array<TextPart | ImagePart | FilePart>): Promise<void> {
        await this.chatMessagesRepository.appendMessage({
            role: 'user',
            content: prompt,
            metadata: {
                timestamp: Date.now(),
            },
        });
        const history = this.chatMessagesRepository.getChatHistory();
        if (history === undefined) {
            throw new Error('Failed to retrieve chat history after appending user message');
        }
        try {
            this.currentRequestController = new AbortController();
            this.eventTrigger.triggerEvent('chatStreamStart');

            const updatedChatHistory = await this.agentService.query(
                history,
                this.currentRequestController,
                (prev: ChatMessage[], streamMessage: ChatMessage) => {
                    const newHistory = handleStreamMessage(prev, streamMessage);
                    void (async () => {
                        try {
                            await this.chatMessagesRepository.saveChatHistory(newHistory);
                        } catch (error) {
                            this.logger.error('Failed to save intermediate chat history', {
                                error,
                            });
                        }
                    })();
                    return newHistory;
                }
            );
            await this.chatMessagesRepository.saveChatHistory(updatedChatHistory);

            // Check if request was aborted
            if (this.currentRequestController.signal.aborted) {
                this.logger.warn('Request was aborted');
                return;
            }

            // Trigger stream end event
            this.eventTrigger.triggerEvent('chatStreamEnd');
        } catch (error) {
            // Check if the error is due to abort
            if (this.currentRequestController?.signal.aborted === true) {
                this.logger.info('Request was stopped by user');
                this.eventTrigger.triggerEvent('chatStopped');
                return;
            }

            this.logger.error(`Chat message failed:`, { error });

            const errorMessage = error instanceof Error ? error.message : String(error);

            // Check if this is an API key authentication error
            if (this.agentService.isApiKeyAuthError?.(errorMessage)) {
                // TODO: open the correct config for the given AI provider
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
