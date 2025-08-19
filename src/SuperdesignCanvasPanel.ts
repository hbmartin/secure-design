import * as vscode from 'vscode';
import { Logger } from './services/logger';
import type { ChatSidebarProvider } from './providers/chatSidebarProvider';
import { FileWatcherService, type FileChangeEvent } from './services/fileWatcherService';
import { generateCanvasHtml, getNonce } from './helpers/htmlTemplate';
import type { DesignFile } from './types/designFile';

export class SuperdesignCanvasPanel {
    public static currentPanel: SuperdesignCanvasPanel | undefined;
    public static readonly viewType = 'superdesignCanvasPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _sidebarProvider: ChatSidebarProvider;
    private readonly _disposables: vscode.Disposable[] = [];
    private readonly _fileWatcherService: FileWatcherService;
    private _workspaceChangeListener: vscode.Disposable | undefined;

    public static createOrShow(extensionUri: vscode.Uri, sidebarProvider: ChatSidebarProvider) {
        const column = vscode.window.activeTextEditor?.viewColumn;

        // Check if current panel is still valid and not disposed
        if (SuperdesignCanvasPanel.currentPanel) {
            try {
                // Try to reveal the panel - this will throw if panel is disposed
                SuperdesignCanvasPanel.currentPanel._panel.reveal(column);
                return SuperdesignCanvasPanel.currentPanel;
            } catch {
                // Panel was disposed but static reference wasn't cleared
                Logger.debug('Current panel was disposed, will create new one');
                SuperdesignCanvasPanel.currentPanel = undefined;
                // Fall through to create new panel
            }
        }

        Logger.debug('Creating new SuperdesignCanvasPanel');
        const panel = vscode.window.createWebviewPanel(
            SuperdesignCanvasPanel.viewType,
            'SecureDesign Canvas',
            column ?? vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'dist'),
                    vscode.Uri.joinPath(extensionUri, 'src', 'assets'),
                ],
                retainContextWhenHidden: true, // Better webview lifecycle management
            }
        );

        SuperdesignCanvasPanel.currentPanel = new SuperdesignCanvasPanel(
            panel,
            extensionUri,
            sidebarProvider
        );

        return SuperdesignCanvasPanel.currentPanel;
    }

    public static getWorkspaceInfo(): { folderCount: number; folderNames: string[] } {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        return {
            folderCount: workspaceFolders?.length ?? 0,
            folderNames: workspaceFolders?.map(folder => folder.name) ?? [],
        };
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        sidebarProvider: ChatSidebarProvider
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._sidebarProvider = sidebarProvider;
        this._fileWatcherService = new FileWatcherService();

        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._disposables.push(this._fileWatcherService);
        this._setupFileWatcher();
        this._setupWorkspaceChangeListener();

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'loadDesignFiles':
                        void this._loadDesignFiles();
                        break;
                    case 'selectFrame':
                        Logger.debug(`Frame selected: ${message.data?.fileName}`);
                        break;
                    case 'setContextFromCanvas':
                        // Forward context to chat sidebar
                        this._sidebarProvider.sendMessage({
                            command: 'contextFromCanvas',
                            data: message.data,
                        });
                        break;
                    case 'setChatPrompt':
                        // Forward prompt to chat sidebar
                        this._sidebarProvider.sendMessage({
                            command: 'setChatPrompt',
                            data: message.data,
                        });
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public dispose() {
        // Clear static reference first to prevent race conditions
        if (SuperdesignCanvasPanel.currentPanel === this) {
            SuperdesignCanvasPanel.currentPanel = undefined;
        }

        // Dispose workspace change listener
        if (this._workspaceChangeListener) {
            this._workspaceChangeListener.dispose();
            this._workspaceChangeListener = undefined;
        }

        // Dispose panel (this will trigger onDidDispose event)
        try {
            this._panel.dispose();
        } catch (error) {
            Logger.warn(`Error disposing webview panel: ${error}`);
        }

        // Dispose all other resources
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                try {
                    disposable.dispose();
                } catch (error) {
                    Logger.warn(`Error disposing resource: ${error}`);
                }
            }
        }
    }

    private _setupFileWatcher() {
        this._fileWatcherService.setupWatcher({
            pattern: '.superdesign/design_iterations/**/*.{html,svg,css}',
            onFileChange: (event: FileChangeEvent) => {
                this._panel.webview.postMessage({
                    command: 'fileChanged',
                    data: event,
                });
                void this._loadDesignFiles();
            },
        });
    }

    private _setupWorkspaceChangeListener() {
        // Only setup listener if not already setup
        if (!this._workspaceChangeListener) {
            this._workspaceChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
                Logger.debug('Workspace folders changed, reloading design files');
                void this._loadDesignFiles();
            });
            this._disposables.push(this._workspaceChangeListener);
        }
    }

    private _update() {
        const { webview } = this._panel;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
        );

        // Generate webview URIs for logo images
        const logoUris = {
            cursor: webview
                .asWebviewUri(
                    vscode.Uri.joinPath(this._extensionUri, 'src', 'assets', 'cursor_logo.png')
                )
                .toString(),
            windsurf: webview
                .asWebviewUri(
                    vscode.Uri.joinPath(this._extensionUri, 'src', 'assets', 'windsurf_logo.png')
                )
                .toString(),
            claudeCode: webview
                .asWebviewUri(
                    vscode.Uri.joinPath(this._extensionUri, 'src', 'assets', 'claude_code_logo.png')
                )
                .toString(),
            lovable: webview
                .asWebviewUri(
                    vscode.Uri.joinPath(this._extensionUri, 'src', 'assets', 'lovable_logo.png')
                )
                .toString(),
            bolt: webview
                .asWebviewUri(
                    vscode.Uri.joinPath(this._extensionUri, 'src', 'assets', 'bolt_logo.jpg')
                )
                .toString(),
        };

        // Debug logging
        Logger.debug(`Canvas Panel - Extension URI: ${this._extensionUri.toString()}`);
        Logger.debug(`Canvas Panel - Generated logo URIs: ${JSON.stringify(logoUris)}`);

        const nonce = getNonce();

        return generateCanvasHtml({
            scriptUri,
            logoUris,
            nonce,
            extensionUri: this._extensionUri,
            webviewCspSource: webview.cspSource,
        });
    }

    private async _loadDesignFilesPerWorkspace(
        workspaceFolder: vscode.WorkspaceFolder,
        workspaceName: string | undefined
    ): Promise<DesignFile[]> {
        try {
            const designFolder = vscode.Uri.joinPath(
                workspaceFolder.uri,
                '.superdesign',
                'design_iterations'
            );
            try {
                // Check if the design_iterations folder exists in this workspace
                await vscode.workspace.fs.stat(designFolder);
            } catch {
                // Folder doesn't exist, create it
                try {
                    await vscode.workspace.fs.createDirectory(designFolder);
                    Logger.info(
                        `Created .superdesign/design_iterations directory in workspace: ${workspaceFolder.name}`
                    );
                } catch (createError) {
                    this._panel.webview.postMessage({
                        command: 'error',
                        data: {
                            error: `Failed to create design_iterations directory: ${createError}`,
                        },
                    });
                    Logger.warn(
                        `Failed to create design_iterations directory in workspace ${workspaceFolder.name}: ${createError}`
                    );
                    // Skip this workspace folder and try the next one
                    return [];
                }
            }

            // Read all files in the directory
            const files = await vscode.workspace.fs.readDirectory(designFolder);
            const designFiles = files.filter(
                ([name, type]) =>
                    type === vscode.FileType.File &&
                    (name.toLowerCase().endsWith('.html') || name.toLowerCase().endsWith('.svg'))
            );

            const loadedFiles = await Promise.all(
                designFiles.map(async ([fileName, _]): Promise<DesignFile | null> => {
                    const filePath = vscode.Uri.joinPath(designFolder, fileName);

                    try {
                        // Read file stats and content
                        const [stat, content] = await Promise.all([
                            vscode.workspace.fs.stat(filePath),
                            vscode.workspace.fs.readFile(filePath),
                        ]);

                        const fileType = fileName.toLowerCase().endsWith('.svg') ? 'svg' : 'html';
                        let htmlContent = Buffer.from(content).toString('utf8');

                        // For HTML files, inline any external CSS files
                        if (fileType === 'html') {
                            htmlContent = await this._inlineExternalCSS(htmlContent, designFolder);
                        }

                        // Get workspace-relative path for better UX
                        const relativePath = vscode.workspace.asRelativePath(filePath, false);

                        return {
                            name: fileName,
                            path: filePath.fsPath,
                            relativePath: relativePath,
                            workspaceName: workspaceName,
                            content: htmlContent,
                            size: stat.size,
                            modified: new Date(stat.mtime),
                            fileType,
                        } satisfies DesignFile;
                    } catch (fileError) {
                        Logger.error(
                            `Failed to read file ${fileName} in workspace ${workspaceFolder.name}: ${fileError}`
                        );
                        return null;
                    }
                })
            );

            // Filter out any failed file reads and add to all files
            const validFiles = loadedFiles.filter((file): file is DesignFile => file !== null);
            Logger.info(
                `Loaded ${validFiles.length} design files from workspace: ${workspaceFolder.name}`
            );
            return validFiles;
        } catch (readError) {
            Logger.warn(
                `Failed to read design files from workspace ${workspaceFolder.name}: ${readError}`
            );
            return [];
        }
    }

    private async _loadDesignFiles() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this._panel.webview.postMessage({
                command: 'error',
                data: { error: 'No workspace folder found. Please open a workspace first.' },
            });
            return;
        }

        try {
            const allValidFiles: DesignFile[] = [];

            // Process each workspace folder
            for (const workspaceFolder of workspaceFolders) {
                const validFiles = await this._loadDesignFilesPerWorkspace(
                    workspaceFolder,
                    workspaceFolders.length > 1 ? workspaceFolder.name : undefined
                );
                allValidFiles.push(...validFiles);
            }

            Logger.info(
                `Total loaded design files: ${allValidFiles.length} from ${workspaceFolders.length} workspace(s)`
            );

            this._panel.webview.postMessage({
                command: 'designFilesLoaded',
                data: { files: allValidFiles },
            });
        } catch (error) {
            Logger.error(`Error loading design files: ${error}`);
            this._panel.webview.postMessage({
                command: 'error',
                data: { error: `Failed to load design files: ${error}` },
            });
        }
    }

    private async _inlineExternalCSS(
        htmlContent: string,
        designFolder: vscode.Uri
    ): Promise<string> {
        // Match link tags that reference CSS files
        const linkRegex = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
        let modifiedContent = htmlContent;
        const matches = Array.from(htmlContent.matchAll(linkRegex));

        for (const match of matches) {
            const fullLinkTag = match[0];
            const cssFileName = match[1];

            try {
                // Only process relative paths (not absolute URLs)
                if (!cssFileName.startsWith('http') && !cssFileName.startsWith('//')) {
                    const cssFilePath = vscode.Uri.joinPath(designFolder, cssFileName);

                    // Check if CSS file exists
                    try {
                        const cssContent = await vscode.workspace.fs.readFile(cssFilePath);
                        const cssText = Buffer.from(cssContent).toString('utf8');

                        // Replace the link tag with a style tag containing the CSS content
                        const styleTag = `<style>\n${cssText}\n</style>`;
                        modifiedContent = modifiedContent.replace(fullLinkTag, styleTag);

                        Logger.debug(`Inlined CSS file: ${cssFileName}`);
                    } catch (cssError) {
                        Logger.warn(`Could not read CSS file ${cssFileName}: ${cssError}`);
                        // Leave the original link tag in place if CSS file can't be read
                    }
                }
            } catch (error) {
                Logger.warn(`Error processing CSS link ${cssFileName}: ${error}`);
            }
        }

        return modifiedContent;
    }
}
