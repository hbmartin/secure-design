import type { ModelConfigWithProvider, ProviderId } from '../providers';
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
    provider: [ProviderId, string] | undefined;
    availableModels: Array<ModelConfigWithProvider>;
}

export interface ChatSidebarActions {
    loadChats(): ChatMessage[] | undefined;
    clearChats(): Promise<void>;
    getCssFileContent(
        filePath: string
    ): Promise<{ filePath: string; content?: string; error?: string }>;
    getCurrentProvider(): [ProviderId, string];
    setProvider(providerId: ProviderId, modelId: string): Promise<[ProviderId, string]>;
    sendChatMessage(prompt: string | Array<TextPart | ImagePart | FilePart>): void;
}
