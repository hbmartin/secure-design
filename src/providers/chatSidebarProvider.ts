import * as vscode from 'vscode';
import { generateWebviewHtml as _generateWebviewHtml } from '../templates/webviewTemplate';
import {
    BaseWebviewViewProvider,
    isViewApiRequest,
    type ActionDelegate,
    type ViewApiError,
    type ViewApiResponse,
    type WebviewApiProvider,
} from 'react-vscode-webview-ipc/host';
import type { ChatController } from '../chat/ChatController';
import type ChatMessagesRepository from '../chat/ChatMessagesRepository';
import { type ChatSidebarActions, ChatSidebarKey } from '../types/chatSidebarTypes';
import type { ChatMessage } from '../types';
import getCssFileContent from '../chat/getCssFileContent';
import type { TextPart, ImagePart, FilePart } from '@ai-sdk/provider-utils';
import type { ChatViewAPI, ChatViewEvents } from '../api/viewApi';

function createActionDelegate(
    chatMessagesRepository: ChatMessagesRepository,
    chatController: ChatController
): ActionDelegate<ChatSidebarActions> {
    return {
        loadChats: function (): ChatMessage[] {
            return chatMessagesRepository.getChatHistory();
        },
        clearChats: async function (): Promise<void> {
            await chatMessagesRepository.clearChatHistory();
        },
        getCssFileContent: async function (
            filePath: string
        ): Promise<{ filePath: string; content?: string; error?: string }> {
            try {
                const content = await getCssFileContent(filePath);
                return { filePath, content };
            } catch (e) {
                return { filePath, error: e instanceof Error ? e.message : String(e) };
            }
        },
        sendChatMessage: function (prompt: string | (TextPart | ImagePart | FilePart)[]) {
            void chatController.sendChatMessage(prompt);
        },
    };
}

export class ChatSidebarProvider extends BaseWebviewViewProvider<ChatSidebarActions> {
    static readonly providerId: string = ChatSidebarKey;
    protected readonly webviewActionDelegate: ActionDelegate<ChatSidebarActions>;
    private customMessageHandler?: (message: any) => void;
    private repositoryUnsubscribe?: () => void;

    constructor(
        _extensionUri: vscode.Uri,
        apiProvider: WebviewApiProvider<ChatViewEvents>,
        private readonly chatController: ChatController,
        private readonly chatMessagesRepository: ChatMessagesRepository
    ) {
        super(ChatSidebarKey, _extensionUri, apiProvider);
        this.webviewActionDelegate = createActionDelegate(chatMessagesRepository, chatController);

        // Subscribe to repository changes and send patches to webview
        this.repositoryUnsubscribe = this.chatMessagesRepository.subscribe(messages => {
            this.postPatch('loadChats', messages ?? []);
        });
    }

    generateWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
        return _generateWebviewHtml(webview, extensionUri);
    }

    public setMessageHandler(handler: (message: any) => void) {
        this.logger.debug('Setting custom message handler');
        this.customMessageHandler = handler;
    }

    public sendMessage(message: any) {
        this.logger.debug('Sending message to webview', {
            hasView: !!this._view,
            command: message.command,
        });
        if (this._view) {
            this._view.webview.postMessage(message);
            this.logger.debug('Message sent successfully');
        } else {
            this.logger.debug('No view available to send message');
        }
    }

    /**
     * Handle incoming messages from webview with full type safety
     */
    protected async handleMessage(message: unknown, webview: vscode.Webview): Promise<void> {
        if (message === null || typeof message !== 'object') {
            return Promise.resolve();
        }
        if (!('key' in message) || message.key !== 'log') {
            this.logger.debug('Calling custom message handler', { message });
        }
        // First try custom message handler for auto-canvas functionality
        if (this.customMessageHandler) {
            this.customMessageHandler(message);
        }

        // Check if this is a new API message format
        if (isViewApiRequest<ChatViewAPI>(message)) {
            try {
                // Call the API method with type safety
                const result = await Promise.resolve(
                    this.chatController.viewApiDelegate[message.key](...message.params)
                );

                if (message.key === 'saveImageToMoodboard') {
                    const imageData = message.params[0];
                    if (
                        imageData &&
                        typeof imageData === 'object' &&
                        'fileName' in imageData &&
                        'originalName' in imageData
                    ) {
                        if (typeof result === 'string') {
                            webview.postMessage({
                                type: 'event',
                                key: 'imageSavedToMoodboard',
                                value: {
                                    fileName: imageData.fileName,
                                    originalName: imageData.originalName,
                                    fullPath: result,
                                },
                            });
                        } else {
                            webview.postMessage({
                                type: 'event',
                                key: 'imageSaveError',
                                value: {
                                    fileName: imageData.fileName,
                                    originalName: imageData.originalName,
                                    error:
                                        typeof result === 'object' && 'message' in result
                                            ? result.message
                                            : String(result),
                                },
                            });
                        }
                    }
                }

                // Send typed response
                const response: ViewApiResponse<ChatViewAPI> = {
                    type: 'response',
                    id: message.id,
                    value: result,
                };

                try {
                    await webview.postMessage(response);
                } catch (postError) {
                    this.logger.error(
                        `Failed to send response for ${String(message.key)}: ${String(postError)}`
                    );

                    throw postError; // Re-throw to ensure caller knows the operation failed
                }
            } catch (error) {
                this.logger.error(`API call failed for ${String(message.key)}: ${String(error)}`, {
                    error,
                });

                // Send typed error
                const errorResponse: ViewApiError = {
                    type: 'error',
                    id: message.id,
                    value: error instanceof Error ? error.message : 'An unexpected error occurred',
                };

                try {
                    await webview.postMessage(errorResponse);
                } catch (postError) {
                    this.logger.error(
                        `Failed to send error response for ${String(message.key)}: ${String(postError)}`
                    );
                }
            }
            return;
        }

        // Handle special legacy messages that aren't yet migrated to the new API
        switch ('command' in message && message.command) {
            case 'showContextPicker':
                // Keep this until we have a proper UI component replacement
                await this.handleShowContextPicker(webview);
                break;
            case 'log':
                break;
            default:
                // All other commands should now use the new API
                this.logger.warn(`Received unmigrated legacy command`, { message });
                break;
        }
    }

    private async handleShowContextPicker(webview: vscode.Webview) {
        this.logger.debug('Handling show context picker');
        try {
            // Show quick pick with context options
            const options = [
                {
                    label: '📄 Select File',
                    description: 'Choose a file from your workspace',
                    action: 'selectFile',
                },
                {
                    label: '📁 Select Folder',
                    description: 'Choose a folder from your workspace',
                    action: 'selectFolder',
                },
                {
                    label: '🖼️ Select Images',
                    description: 'Choose image files for analysis',
                    action: 'selectImages',
                },
                {
                    label: '📋 Canvas Content',
                    description: 'Use current canvas as context',
                    action: 'canvasContent',
                },
            ];

            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: 'What would you like to add as context?',
                matchOnDescription: true,
            });

            if (!selected) {
                return; // User cancelled
            }

            switch (selected.action) {
                case 'selectFile':
                    await this.handleSelectFile(webview);
                    break;
                case 'selectFolder':
                    await this.handleSelectFolder(webview);
                    break;
                case 'selectImages':
                    await this.handleSelectImages(webview);
                    break;
                case 'canvasContent':
                    await this.handleCanvasContent(webview);
                    break;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show context picker: ${error}`);
        }
    }

    private async handleSelectFile(webview: vscode.Webview) {
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

        if (files && files.length > 0) {
            const filePath = files[0].fsPath;
            webview.postMessage({
                command: 'contextFromCanvas',
                data: {
                    fileName: filePath,
                    type: 'file',
                },
            });
        }
    }

    private async handleSelectFolder(webview: vscode.Webview) {
        const folders = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
        });

        if (folders && folders.length > 0) {
            const folderPath = folders[0].fsPath;
            webview.postMessage({
                command: 'contextFromCanvas',
                data: {
                    fileName: folderPath,
                    type: 'folder',
                },
            });
        }
    }

    private async handleSelectImages(webview: vscode.Webview) {
        const images = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            filters: {
                Images: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'],
            },
        });

        if (images && images.length > 0) {
            if (images.length === 1) {
                webview.postMessage({
                    command: 'contextFromCanvas',
                    data: {
                        fileName: images[0].fsPath,
                        type: 'image',
                    },
                });
            } else {
                const imagePaths = images.map(img => img.fsPath).join(', ');
                webview.postMessage({
                    command: 'contextFromCanvas',
                    data: {
                        fileName: imagePaths,
                        type: 'images',
                    },
                });
            }
        }
    }

    private async handleCanvasContent(webview: vscode.Webview) {
        // Request canvas content from extension
        await webview.postMessage({
            command: 'contextFromCanvas',
            data: {
                fileName: 'Canvas Content',
                type: 'canvas',
            },
        });
        vscode.window.showInformationMessage('Canvas content added as context');
    }

    protected onWebviewDispose(): void {
        // Unsubscribe from repository
        if (this.repositoryUnsubscribe) {
            this.repositoryUnsubscribe();
            this.repositoryUnsubscribe = undefined;
        }
    }
}
