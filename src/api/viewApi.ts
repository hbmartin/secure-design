import type { ChatMessage } from '../types/chatMessage';

export interface ViewAPI {
    stopChat: () => void;

    // Context operations
    selectFile: () => Promise<string | null>;
    selectFolder: () => Promise<string | null>;
    selectImages: () => Promise<string[] | null>;

    // Utility operations
    showInformationMessage: (message: string) => void;
    showErrorMessage: (message: string) => void;
    executeCommand: (command: string, arguments_?: any) => Promise<void>;

    // Canvas operations
    checkCanvasStatus: () => Promise<boolean>;
    openCanvas: () => Promise<void>;

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
export interface ViewEvents {
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

/**
 * Request context information for tracking and debugging
 */
export interface RequestContext {
    viewId: string;
    viewType: string;
    timestamp: number;
    sessionId?: string;
}

/**
 * Internal message types for request/response communication
 */
export interface ViewApiRequest<K extends keyof ViewAPI = keyof ViewAPI> {
    type: 'request';
    id: string;
    key: K;
    params: Parameters<ViewAPI[K]>;
    context?: RequestContext;
}

export interface ViewApiResponse<K extends keyof ViewAPI = keyof ViewAPI> {
    type: 'response';
    id: string;
    value: Awaited<ReturnType<ViewAPI[K]>>;
}

export interface ViewApiError {
    type: 'error';
    id: string;
    value: string;
}

export interface ViewApiEvent<E extends keyof ViewEvents = keyof ViewEvents> {
    type: 'event';
    key: E;
    value: Parameters<ViewEvents[E]>;
}

export type ViewApiMessage = ViewApiRequest | ViewApiResponse | ViewApiError | ViewApiEvent;

/**
 * Type guard to check if a message is a valid API request
 */
export function isViewApiRequest(message: any): message is ViewApiRequest {
    return (
        message &&
        typeof message === 'object' &&
        message.type === 'request' &&
        typeof message.id === 'string' &&
        typeof message.key === 'string' &&
        Array.isArray(message.params) &&
        (message.context === undefined ||
            (typeof message.context === 'object' &&
                typeof message.context.viewId === 'string' &&
                typeof message.context.viewType === 'string' &&
                typeof message.context.timestamp === 'number'))
    );
}

/**
 * Type guard to check if a message is a valid API response
 */
export function isViewApiResponse(message: any): message is ViewApiResponse {
    return (
        message &&
        typeof message === 'object' &&
        message.type === 'response' &&
        typeof message.id === 'string' &&
        message.hasOwnProperty('value')
    );
}

/**
 * Type guard to check if a message is a valid API error
 */
export function isViewApiError(message: any): message is ViewApiError {
    return (
        message &&
        typeof message === 'object' &&
        message.type === 'error' &&
        typeof message.id === 'string' &&
        typeof message.value === 'string'
    );
}

/**
 * Type guard to check if a message is a valid API event
 */
export function isViewApiEvent(message: any): message is ViewApiEvent {
    return (
        message &&
        typeof message === 'object' &&
        message.type === 'event' &&
        typeof message.key === 'string' &&
        Array.isArray(message.value)
    );
}
