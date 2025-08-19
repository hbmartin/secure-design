import * as vscode from 'vscode';
import type { ChatMessage } from '../types';

export class WorkspaceStateService {
    private static instance: WorkspaceStateService;
    private context?: vscode.ExtensionContext;

    private constructor() {}

    public static getInstance(): WorkspaceStateService {
        if (!WorkspaceStateService.instance) {
            WorkspaceStateService.instance = new WorkspaceStateService();
        }
        return WorkspaceStateService.instance;
    }

    public initialize(context: vscode.ExtensionContext): void {
        this.context = context;
    }

    private ensureContext(): vscode.ExtensionContext {
        if (!this.context) {
            throw new Error('WorkspaceStateService not initialized. Call initialize() first.');
        }
        return this.context;
    }

    /**
     * Save chat history for the current workspace
     */
    public async saveChatHistory(chatHistory: ChatMessage[]): Promise<void> {
        const context = this.ensureContext();
        await context.workspaceState.update('securedesign.chatHistory', chatHistory);
    }

    /**
     * Load chat history for the current workspace
     */
    public getChatHistory(): ChatMessage[] {
        const context = this.ensureContext();
        return context.workspaceState.get('securedesign.chatHistory', []);
    }

    /**
     * Clear chat history for the current workspace
     */
    public async clearChatHistory(): Promise<void> {
        const context = this.ensureContext();
        await context.workspaceState.update('securedesign.chatHistory', undefined);
    }

    /**
     * Get a unique identifier for the current workspace
     */
    public getWorkspaceId(): string | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return undefined;
        }

        // For single workspace, use the folder URI
        if (workspaceFolders.length === 1) {
            return workspaceFolders[0].uri.toString();
        }

        // For multi-root workspace, create a combined identifier
        const sortedUris = workspaceFolders.map(folder => folder.uri.toString()).sort();
        return sortedUris.join('|');
    }

    /**
     * Check if workspace context has changed
     */
    public hasWorkspaceChanged(previousWorkspaceId?: string): boolean {
        const currentWorkspaceId = this.getWorkspaceId();
        return currentWorkspaceId !== previousWorkspaceId;
    }
}
