import * as vscode from 'vscode';
import { generateWebviewHtml } from '../templates/webviewTemplate';
import type { WebviewContext } from '../types/context';
// Unused imports removed after legacy cleanup
import { Logger } from '../services/logger';
import type { WebviewApiProvider } from './WebviewApiProvider';

export class ChatSidebarProvider implements vscode.WebviewViewProvider {
    public static readonly VIEW_TYPE = 'securedesign.chatView';
    private _view?: vscode.WebviewView;
    private customMessageHandler?: (message: any) => void;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly apiProvider: WebviewApiProvider
    ) {}

    public setMessageHandler(handler: (message: any) => void) {
        this.customMessageHandler = handler;
    }

    public sendMessage(message: any) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'dist'),
                vscode.Uri.joinPath(this._extensionUri, 'src', 'assets'),
            ],
        };

        const webviewContext: WebviewContext = {
            layout: 'sidebar',
            extensionUri: this._extensionUri.toString(),
        };

        const html = await generateWebviewHtml(
            webviewView.webview,
            this._extensionUri,
            webviewContext
        );
        // eslint-disable-next-line require-atomic-updates
        webviewView.webview.html = html;

        // Initial chat history loading is now handled by the webview using the new API

        // Register this webview with the API provider
        this.apiProvider.registerView('chat-sidebar', webviewView, 'chat-sidebar');

        // Handle messages from the webview
        const messageListener = webviewView.webview.onDidReceiveMessage(async message => {
            // First try custom message handler for auto-canvas functionality
            if (this.customMessageHandler) {
                this.customMessageHandler(message);
            }

            // Check if this is a new API message format
            if (message.type === 'request') {
                // Delegate to WebviewApiProvider for new API calls
                await this.apiProvider.handleMessage(message, webviewView.webview);
                return;
            }

            // Handle special legacy messages that aren't yet migrated to the new API
            switch (message.command) {
                case 'showContextPicker':
                    // Keep this until we have a proper UI component replacement
                    await this.handleShowContextPicker(webviewView.webview);
                    break;

                default:
                    // All other commands should now use the new API
                    Logger.warn(`Received unmigrated legacy command: ${message.command}`, message);
                    break;
            }
        });

        // Dispose of the message listener when webview is disposed
        webviewView.onDidDispose(() => {
            messageListener.dispose();
        });
    }

    // handleGetCurrentProvider and handleChangeProvider have been migrated to WebviewApiProvider

    private async handleShowContextPicker(webview: vscode.Webview) {
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

    // handleSaveChatHistory, handleLoadChatHistory, and handleClearWorkspaceChatHistory
    // have been migrated to WebviewApiProvider
}
