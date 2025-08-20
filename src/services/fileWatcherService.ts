import * as vscode from 'vscode';
import { Logger } from './logger';
import * as path from 'path';

export interface FileChangeEvent {
    fileName: string;
    relativePath: string;
    absolutePath: string;
    workspaceName?: string;
    changeType: 'created' | 'modified' | 'deleted';
}

export interface FileWatcherConfig {
    pattern: string;
    onFileChange: (event: FileChangeEvent) => void;
}

interface WatcherInfo {
    watcher: vscode.FileSystemWatcher;
    subscriptions: vscode.Disposable[];
}

export class FileWatcherService implements vscode.Disposable {
    private readonly _fileWatchers: Map<string, WatcherInfo> = new Map();
    private readonly _disposables: vscode.Disposable[] = [];
    private _currentConfig: FileWatcherConfig | undefined;
    private _workspaceChangeListener: vscode.Disposable | undefined;

    public setupWatcher(config: FileWatcherConfig): void {
        // Store config for workspace changes
        this._currentConfig = config;

        // Setup watchers for all workspace folders
        this._setupWatchersForWorkspace();

        // Setup workspace change listener only if not already setup
        if (!this._workspaceChangeListener) {
            this._workspaceChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
                Logger.debug('Workspace folders changed, updating file watchers');
                this._setupWatchersForWorkspace();
            });
            this._disposables.push(this._workspaceChangeListener);
        }
    }

    public dispose(): void {
        // Dispose all file watchers
        this._disposeWatchers();

        // Dispose workspace change listener and remove from disposables
        if (this._workspaceChangeListener) {
            // Remove from disposables array to prevent double disposal
            const index = this._disposables.indexOf(this._workspaceChangeListener);
            if (index > -1) {
                this._disposables.splice(index, 1);
            }
            this._workspaceChangeListener.dispose();
            this._workspaceChangeListener = undefined;
        }

        // Dispose all remaining event subscriptions
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }

        // Clear config
        this._currentConfig = undefined;
    }
    private _setupWatchersForWorkspace(): void {
        const { workspaceFolders } = vscode.workspace;
        if (!this._currentConfig) {
            return;
        }

        // Dispose existing watchers first
        this._disposeWatchers();

        if (!workspaceFolders || workspaceFolders.length === 0) {
            Logger.debug('No workspace folders; clearing watcher config until folders are added.');
            return;
        }

        // Create watchers for each workspace folder
        for (const workspaceFolder of workspaceFolders) {
            this._createWatcherForFolder(workspaceFolder, this._currentConfig);
        }
    }

    private _createWatcherForFolder(
        workspaceFolder: vscode.WorkspaceFolder,
        config: FileWatcherConfig
    ): void {
        const pattern = new vscode.RelativePattern(workspaceFolder, config.pattern);
        const watcherKey = workspaceFolder.uri.toString();

        const fileWatcher = vscode.workspace.createFileSystemWatcher(
            pattern,
            false, // Don't ignore create events
            false, // Don't ignore change events
            false // Don't ignore delete events
        );

        // Helper function to create event handler
        const createEventHandler = (changeType: FileChangeEvent['changeType']) => {
            return (uri: vscode.Uri) => {
                const absolutePath = uri.fsPath;
                const fileName = path.basename(absolutePath);

                // Get workspace-relative path
                const relativePath = vscode.workspace.asRelativePath(uri, false);

                // Include workspace name for multi-root workspaces
                const workspaceName =
                    vscode.workspace.workspaceFolders &&
                    vscode.workspace.workspaceFolders.length > 1
                        ? workspaceFolder.name
                        : undefined;

                Logger.debug(
                    `Design file ${changeType}: ${relativePath} (workspace: ${workspaceFolder.name})`
                );

                config.onFileChange({
                    fileName,
                    relativePath,
                    absolutePath,
                    workspaceName,
                    changeType,
                });
            };
        };

        // Setup all event handlers and track their subscriptions
        const subscriptions = [
            fileWatcher.onDidCreate(createEventHandler('created')),
            fileWatcher.onDidChange(createEventHandler('modified')),
            fileWatcher.onDidDelete(createEventHandler('deleted')),
        ];

        // Store the watcher and its associated subscriptions
        this._fileWatchers.set(watcherKey, {
            watcher: fileWatcher,
            subscriptions: subscriptions,
        });
    }

    private _disposeWatchers(): void {
        // Dispose all existing file watchers and their event subscriptions
        for (const [key, watcherInfo] of this._fileWatchers) {
            try {
                // Dispose all event subscriptions for this watcher
                for (const subscription of watcherInfo.subscriptions) {
                    subscription.dispose();
                }

                // Dispose the watcher itself
                watcherInfo.watcher.dispose();

                Logger.debug(
                    `Disposed file watcher and ${watcherInfo.subscriptions.length} subscriptions for: ${key}`
                );
            } catch (error) {
                Logger.warn(`Error disposing file watcher for ${key}: ${error}`);
            }
        }
        this._fileWatchers.clear();
    }
}
