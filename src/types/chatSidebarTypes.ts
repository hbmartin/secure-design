import type { ChatMessage } from './chatMessage';
import type { WebviewKey } from './ipcReducer';
import type { TextPart, ImagePart, FilePart } from '@ai-sdk/provider-utils';

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
    clearChats(): Promise<void>;
    getCssFileContent(
        filePath: string
    ): Promise<{ filePath: string; content?: string; error?: string }>;
    sendChatMessage(prompt: string | Array<TextPart | ImagePart | FilePart>): void;
}
