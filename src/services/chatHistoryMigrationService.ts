import type * as vscode from 'vscode';
import { WorkspaceStateService } from './workspaceStateService';
import { Logger } from './logger';
import type { ChatMessage } from '../types';

/**
 * Service to handle migration of chat history from localStorage to workspace state
 */
export class ChatHistoryMigrationService {
    private static readonly MIGRATION_KEY = 'securedesign.chatHistoryMigrated';
    private static readonly OLD_STORAGE_KEY = 'superdesign-chat-history';

    /**
     * Check if migration is needed and perform it if necessary
     * This should be called when the webview first loads
     */
    public static async performMigrationIfNeeded(
        context: vscode.ExtensionContext,
        oldChatHistory?: ChatMessage[]
    ): Promise<ChatMessage[]> {
        const workspaceStateService = WorkspaceStateService.getInstance();

        // Check if we've already migrated for this workspace
        const hasMigrated = context.workspaceState.get<boolean>(this.MIGRATION_KEY, false);

        if (hasMigrated) {
            // Already migrated, just return existing workspace chat history
            return workspaceStateService.getChatHistory();
        }

        // Check if there's existing workspace state data
        const existingWorkspaceHistory = workspaceStateService.getChatHistory();
        if (existingWorkspaceHistory.length > 0) {
            // Already has workspace history, mark as migrated
            await context.workspaceState.update(this.MIGRATION_KEY, true);
            return existingWorkspaceHistory;
        }

        // Perform migration if we have old data
        if (oldChatHistory && oldChatHistory.length > 0) {
            try {
                Logger.info(
                    `Migrating ${oldChatHistory.length} chat messages from localStorage to workspace state`
                );

                // Validate and sanitize the old chat history
                const sanitizedHistory = this.sanitizeChatHistory(oldChatHistory);

                // Save to workspace state
                await workspaceStateService.saveChatHistory(sanitizedHistory);

                // Mark as migrated
                await context.workspaceState.update(this.MIGRATION_KEY, true);

                Logger.info('Chat history migration completed successfully');

                // Return the migrated history
                return sanitizedHistory;
            } catch (error) {
                Logger.error(`Failed to migrate chat history: ${error}`);
                // Return empty array on failure
                return [];
            }
        }

        // No migration needed, mark as complete
        await context.workspaceState.update(this.MIGRATION_KEY, true);
        return [];
    }

    /**
     * Sanitize and validate chat history data
     * Limits to last 100 messages to prevent storage overflow
     */
    private static sanitizeChatHistory(chatHistory: any[]): ChatMessage[] {
        const MAX_MESSAGES = 100;
        const sanitized: ChatMessage[] = [];

        // Take only the most recent messages
        const messagesToProcess = chatHistory.slice(-MAX_MESSAGES);

        for (const msg of messagesToProcess) {
            try {
                // Validate message structure
                if (typeof msg === 'object' && msg !== null && 'role' in msg) {
                    // Ensure required fields
                    const sanitizedMsg: ChatMessage = {
                        role:
                            msg.role === 'user' || msg.role === 'assistant' || msg.role === 'tool'
                                ? msg.role
                                : 'assistant',
                        content: msg.content ?? '',
                        metadata: {
                            timestamp: msg.metadata?.timestamp ?? Date.now(),
                            ...msg.metadata,
                        },
                    };
                    sanitized.push(sanitizedMsg);
                }
            } catch (error) {
                Logger.warn(`Skipping invalid message during migration: ${error}`);
            }
        }

        return sanitized;
    }

    /**
     * Clear migration flag (useful for testing or reset)
     */
    public static async resetMigration(context: vscode.ExtensionContext): Promise<void> {
        await context.workspaceState.update(this.MIGRATION_KEY, undefined);
        Logger.info('Chat history migration flag reset');
    }
}
