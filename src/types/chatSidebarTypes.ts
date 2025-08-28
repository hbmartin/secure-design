import type { Actions, WebviewKey } from './ipcReducer';

export const ChatSidebarKey = 'securedesign.chatView' as WebviewKey;

export interface CssContent {
    filePath?: string;
    error?: string;
    content?: string;
}

export interface ChatSidebarState {
    css: Record<string, CssContent>;
}

export interface ChatSidebarActions extends Actions {
    dummyAction(): void;
    getCssFileContent(filePath: string): { filePath: string; content?: string; error?: string };
}
