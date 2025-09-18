import * as vscode from 'vscode';
import type { AgentService } from '../types/agent';
import type { WorkspaceStateService } from '../services/workspaceStateService';
import type ChatMessagesRepository from './ChatMessagesRepository';
import type { ChatMessage } from '../types/chatMessage';
import { getLogger } from 'react-vscode-webview-ipc/host';
import type { ChatViewEvents, ChatViewAPI } from '../api/viewApi';
import type { TextPart, ImagePart, FilePart } from '@ai-sdk/provider-utils';
import { SecureStorageService } from '../services/secureStorageService';

/**
 * Interface for event triggering capability to avoid circular dependencies
 */
export interface EventTrigger {
    triggerEvent<E extends keyof ChatViewEvents>(
        key: E,
        ...params: Parameters<ChatViewEvents[E]>
    ): void;
}

/**
 * ChatController handles all chat-related business logic and coordinates between services.
 * This separates business logic from the API provider and makes the system more testable.
 */
export class ChatController {
    private currentRequestController: AbortController | undefined = undefined;
    private readonly storage: SecureStorageService;
    private readonly logger = getLogger('ChatController');

    constructor(
        private readonly agentService: AgentService,
        private readonly eventTrigger: EventTrigger,
        private readonly chatMessagesRepository: ChatMessagesRepository,
        workspaceState: WorkspaceStateService
    ) {
        this.storage = new SecureStorageService(workspaceState.secrets());
    }

    // eslint-disable-next-line @typescript-eslint/member-ordering
    viewApiDelegate: ChatViewAPI = {
        selectFile: async (): Promise<string | null> => {
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
        },

        selectFolder: async (): Promise<string | null> => {
            this.logger.info('API: selectFolder called');
            const folders = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
            });
            return folders?.[0]?.fsPath ?? null;
        },

        selectImages: async (): Promise<string[] | null> => {
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
        },

        showInformationMessage: (message: string): Promise<void> => {
            this.logger.info(`API: showInformationMessage called: ${message}`);
            vscode.window.showInformationMessage(message);
            return Promise.resolve();
        },

        showErrorMessage: (message: string): Promise<void> => {
            this.logger.info(`API: showErrorMessage called: ${message}`);
            vscode.window.showErrorMessage(message);
            return Promise.resolve();
        },

        executeCommand: async (command: string, args?: any): Promise<void> => {
            this.logger.info(`API: executeCommand called: ${command}`);
            if (args) {
                await vscode.commands.executeCommand(command, args);
            } else {
                await vscode.commands.executeCommand(command);
            }
        },

        getBase64Image: async (filePath: string): Promise<string> => {
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
        },

        saveImageToMoodboard: async (data: {
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
        },

        initializeSecuredesign: async (): Promise<void> => {
            this.logger.debug('Initializing Securedesign project');
            await vscode.commands.executeCommand('securedesign.initializeProject');
        },
        stopChat(): Promise<void> {
            // TODO:
            // this.currentRequestController?.abort();
            // this.eventTrigger.triggerEvent('chatStopped');
            return Promise.resolve();
        },
        get: (key: string) => this.storage.get(key),
        set: (key: string, value: Record<string, string>) => this.storage.set(key, value),
        remove: (key: string) => this.storage.remove(key),
    };

    async sendChatMessage(prompt: string | Array<TextPart | ImagePart | FilePart>): Promise<void> {
        try {
            void vscode.commands.executeCommand('securedesign.openCanvas');
        } catch (error) {
            this.logger.error('Failed to auto-open canvas on sending message', { error });
        }
        await this.chatMessagesRepository.appendMessage({
            role: 'user',
            content: prompt,
            metadata: {
                timestamp: Date.now(),
            },
        });
        try {
            this.currentRequestController = new AbortController();
            this.eventTrigger.triggerEvent('chatStreamStart');

            const updatedChatHistory = await this.agentService.query(
                this.chatMessagesRepository.getChatHistory(),
                this.currentRequestController,
                (prev: ChatMessage[]) => {
                    void (async () => {
                        try {
                            await this.chatMessagesRepository.saveChatHistory(prev);
                        } catch (error) {
                            this.logger.error('Failed to save intermediate chat history', {
                                error,
                            });
                        }
                    })();
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

            // TODO: Check if this is an API key authentication error
            // if (this.agentService.isApiKeyAuthError?.(errorMessage)) {
            vscode.window.showErrorMessage(`Chat failed: ${errorMessage}`);
            this.eventTrigger.triggerEvent('chatError', errorMessage);
        } finally {
            // Clear the controller when done
            this.currentRequestController = undefined;
        }
    }

    dispose(): void {
        if (this.currentRequestController) {
            this.currentRequestController.abort();
            this.currentRequestController = undefined;
        }
    }
}
