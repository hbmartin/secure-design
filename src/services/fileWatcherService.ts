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

export class FileWatcherService {
    private _fileWatcher: vscode.FileSystemWatcher | undefined;
    private readonly _disposables: vscode.Disposable[] = [];

    public setupWatcher(config: FileWatcherConfig): void {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const pattern = new vscode.RelativePattern(workspaceFolder, config.pattern);

        this._fileWatcher = vscode.workspace.createFileSystemWatcher(
            pattern,
            false, // Don't ignore create events
            false, // Don't ignore change events
            false // Don't ignore delete events
        );

        // Helper function to create event handler
        const createEventHandler = (changeType: FileChangeEvent['changeType']) => {
            return (uri: vscode.Uri) => {
                const fileName = path.basename(uri.fsPath) ?? '';
                Logger.debug(`Design file ${changeType}: ${uri.fsPath}`);
                config.onFileChange({ fileName, changeType });
            };
        };

        // Setup all event handlers
        this._disposables.push(
            this._fileWatcher.onDidCreate(createEventHandler('created')),
            this._fileWatcher.onDidChange(createEventHandler('modified')),
            this._fileWatcher.onDidDelete(createEventHandler('deleted'))
        );
    }

    public dispose(): void {
        if (this._fileWatcher) {
            this._fileWatcher.dispose();
            this._fileWatcher = undefined;
        }

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
