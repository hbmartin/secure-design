import type { ProviderId } from '../providers';
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
    provider: [ProviderId, string] | undefined;
}

export interface ChatSidebarActions {
    loadChats(): ChatMessage[];
    clearChats(): Promise<void>;
    getCssFileContent(
        filePath: string
    ): Promise<{ filePath: string; content?: string; error?: string }>;
    getCurrentProvider(): [ProviderId, string];
    setProvider(providerId: ProviderId, modelId: string): [ProviderId, string];
}
