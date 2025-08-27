import type { Patches, WebviewKey } from './ipcReducer';

export const ChatSidebarKey: WebviewKey = 'securedesign.chatView' as WebviewKey;

export interface CssContent {
    filePath?: string;
    error?: string;
    content?: string;
}

export interface ChatSidebarState {
    css: Record<string, CssContent>;
}

export interface ChatSidebarActions {
    dummyAction(): void;
    getCssFileContent(filePath: string): void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ChatSidebarPatches
    extends Patches<
        ChatSidebarActions,
        {
            dummyAction: object;
            getCssFileContent: { filePath: string; content?: string; error?: string };
        }
    > {}
