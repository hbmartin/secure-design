import * as vscode from 'vscode';

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

    public secrets(): vscode.SecretStorage {
        return this.ensureContext().secrets;
    }

    public get<T>(key: string): T | undefined {
        const context = this.ensureContext();
        const workspaceKey = this.getNamespacedKey(key);
        return context.workspaceState.get(workspaceKey);
    }

    public update<T>(key: string, value: T): Thenable<void> {
        const context = this.ensureContext();
        const workspaceKey = this.getNamespacedKey(key);
        return context.workspaceState.update(workspaceKey, value);
    }

    /**
     * Get a unique identifier for the current workspace
     * This ID is stable regardless of folder order in multi-root workspaces
     */
    public getWorkspaceId(): string | undefined {
        const { workspaceFolders } = vscode.workspace;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return undefined;
        }

        // For single workspace, use the folder URI
        if (workspaceFolders.length === 1) {
            return workspaceFolders[0].uri.toString();
        }

        // For multi-root workspace, create a stable identifier
        // Sort URIs to ensure consistent ID regardless of folder order
        const sortedUris = workspaceFolders
            .map(folder => folder.uri.toString())
            .sort() // Lexicographic sort ensures order stability
            .filter((uri, index, array) => array.indexOf(uri) === index); // Remove duplicates if any

        return sortedUris.join('|');
    }

    /**
     * Check if workspace context has changed
     */
    public hasWorkspaceChanged(previousWorkspaceId?: string): boolean {
        const currentWorkspaceId = this.getWorkspaceId();
        return currentWorkspaceId !== previousWorkspaceId;
    }

    private ensureContext(): vscode.ExtensionContext {
        if (!this.context) {
            throw new Error('WorkspaceStateService not initialized. Call initialize() first.');
        }
        return this.context;
    }

    /**
     * Get the namespaced key for storing workspace-specific data
     */
    private getNamespacedKey(baseKey: string): string {
        const workspaceId = this.getWorkspaceId();
        if (!workspaceId) {
            // Fallback to base key for no workspace scenario
            return baseKey;
        }
        // Create a hash or truncated version of workspace ID to keep key manageable
        const hashedId = this.hashWorkspaceId(workspaceId);
        return `${baseKey}::${hashedId}`;
    }

    /**
     * Create a stable hash from workspace ID to avoid overly long keys
     */
    private hashWorkspaceId(workspaceId: string): string {
        // Simple hash function for creating a shorter, stable identifier
        let hash = 0;
        for (let i = 0; i < workspaceId.length; i++) {
            const char = workspaceId.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash &= hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }
}
