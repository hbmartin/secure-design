import type { ChatMessage } from './chatMessage';
import type { WebviewKey } from './ipcReducer';

export const ChatSidebarKey = 'securedesign.chatView' as WebviewKey;

export interface CssContent {
    filePath?: string;
    error?: string;
    content?: string;
}

export interface ChatSidebarState {
    css: Record<string, CssContent>;
    messages: ChatMessage[] | undefined;
}

export interface ChatSidebarActions {
    loadChats(): ChatMessage[];
    getCssFileContent(
        filePath: string
    ): Promise<{ filePath: string; content?: string; error?: string }>;
}
