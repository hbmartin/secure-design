import * as vscode from 'vscode';
import { Logger } from './logger';
import path from 'path';

export interface FileChangeEvent {
    fileName: string;
    changeType: 'created' | 'modified' | 'deleted';
}

export interface FileWatcherConfig {
    pattern: string;
    onFileChange: (event: FileChangeEvent) => void;
}

export class FileWatcherService implements vscode.Disposable {
    private readonly _fileWatchers: Map<string, vscode.FileSystemWatcher> = new Map();
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

        // Dispose workspace change listener
        if (this._workspaceChangeListener) {
            this._workspaceChangeListener.dispose();
            this._workspaceChangeListener = undefined;
        }

        // Dispose all event subscriptions
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
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || !this._currentConfig) {
            return;
        }

        // Dispose existing watchers first
        this._disposeWatchers();

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

        // Store the watcher
        this._fileWatchers.set(watcherKey, fileWatcher);

        // Helper function to create event handler
        const createEventHandler = (changeType: FileChangeEvent['changeType']) => {
            return (uri: vscode.Uri) => {
                const fileName = path.basename(uri.fsPath) ?? '';
                Logger.debug(
                    `Design file ${changeType}: ${uri.fsPath} (workspace: ${workspaceFolder.name})`
                );
                config.onFileChange({ fileName, changeType });
            };
        };

        // Setup all event handlers
        this._disposables.push(
            fileWatcher.onDidCreate(createEventHandler('created')),
            fileWatcher.onDidChange(createEventHandler('modified')),
            fileWatcher.onDidDelete(createEventHandler('deleted'))
        );
    }

    private _disposeWatchers(): void {
        // Dispose all existing file watchers
        for (const [_key, watcher] of this._fileWatchers) {
            watcher.dispose();
        }
        this._fileWatchers.clear();
    }
}
