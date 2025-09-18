import type { StorageAdapter } from 'ai-sdk-react-model-picker';
import type { ChatMessage } from '../types/chatMessage';
import type { ClientCalls, HostCalls } from 'react-vscode-webview-ipc/client';

export interface ChatViewAPI extends StorageAdapter, ClientCalls {
    stopChat: () => Promise<void>;

    // Context operations
    selectFile: () => Promise<string | null>;
    selectFolder: () => Promise<string | null>;
    selectImages: () => Promise<string[] | null>;

    // Utility operations
    showInformationMessage: (message: string) => Promise<void>;
    showErrorMessage: (message: string) => Promise<void>;
    executeCommand: (command: string, args?: any) => Promise<void>;

    // Extension operations
    initializeSecuredesign: () => Promise<void>;

    // Image operations
    getBase64Image: (filePath: string) => Promise<string>;
    saveImageToMoodboard: (data: {
        fileName: string;
        originalName: string;
        base64Data: string;
        mimeType: string;
        size: number;
    }) => Promise<string | Error>;
}

/**
 * Events that can be triggered by the host and listened to by webviews
 * These represent notifications/updates flowing from host to webview
 */
export interface ChatViewEvents extends HostCalls {
    // Chat events
    chatStreamStart: () => void;
    chatStreamEnd: () => void;
    chatError: (error: string, actions?: any[]) => void;
    chatStopped: () => void;

    // State events
    workspaceChanged: (workspaceId?: string) => void;
    providerChanged: (providerId: string, model: string) => void;
    historyLoaded: (history: ChatMessage[], workspaceId?: string) => void;

    // Context events
    contextFromCanvas: (data: { fileName: string; type: string }) => void;

    // Image events
    imageSavedToMoodboard: (data: {
        fileName: string;
        originalName: string;
        fullPath: string;
    }) => void;
    imageSaveError: (data: { fileName: string; originalName: string; error: string }) => void;
    uploadFailed: (error: string) => void;
    base64ImageResult: (data: { filePath: string; base64Data: string; mimeType: string }) => void;
}
