/**
 * WebView Message Contract Documentation
 *
 * This file documents all message types exchanged between the extension host and webviews.
 * It serves as the single source of truth for message communication to prevent
 * silent failures and race conditions.
 */

import type { ChatMessage } from './chatMessage';
import type { DesignFile } from './designFile';

/**
 * Messages sent FROM webview TO extension host
 */
export interface WebviewToExtensionMessages {
    // Chat History Management
    saveChatHistory: {
        command: 'saveChatHistory';
        chatHistory: ChatMessage[];
    };

    loadChatHistory: {
        command: 'loadChatHistory';
    };

    migrateLocalStorage: {
        command: 'migrateLocalStorage';
        oldChatHistory: ChatMessage[];
    };

    // Chat Operations
    chatMessage: {
        command: 'chatMessage';
        message: string;
        chatHistory: ChatMessage[];
    };

    stopChat: {
        command: 'stopChat';
    };

    // Canvas Operations
    loadDesignFiles: {
        command: 'loadDesignFiles';
    };

    selectFrame: {
        command: 'selectFrame';
        data?: {
            fileName: string;
        };
    };

    setContextFromCanvas: {
        command: 'setContextFromCanvas';
        data: any;
    };

    setChatPrompt: {
        command: 'setChatPrompt';
        data: any;
    };

    // Provider Management
    getCurrentProvider: {
        command: 'getCurrentProvider';
    };

    changeProvider: {
        command: 'changeProvider';
        providerId: string;
        model: string;
    };

    // Context Management
    showContextPicker: {
        command: 'showContextPicker';
    };

    // Action Execution
    executeAction: {
        command: 'executeAction';
        actionCommand: string;
        actionArgs?: string;
    };

    // Canvas Status
    checkCanvasStatus: {
        command: 'checkCanvasStatus';
    };

    autoOpenCanvas: {
        command: 'autoOpenCanvas';
    };
}

/**
 * Messages sent FROM extension host TO webview
 */
export interface ExtensionToWebviewMessages {
    // Chat History Responses
    chatHistoryLoaded: {
        command: 'chatHistoryLoaded';
        chatHistory: ChatMessage[];
        workspaceId?: string;
    };

    migrationComplete: {
        command: 'migrationComplete';
        chatHistory: ChatMessage[];
        workspaceId?: string;
    };

    workspaceChanged: {
        command: 'workspaceChanged';
        workspaceId?: string;
    };

    // Chat Stream Messages
    chatResponseChunk: {
        command: 'chatResponseChunk';
        messageType: 'assistant' | 'tool-call' | 'tool-result';
        content?: string;
        metadata?: any;
    };

    chatToolUpdate: {
        command: 'chatToolUpdate';
        tool_use_id: string;
        tool_input: any;
    };

    chatToolResult: {
        command: 'chatToolResult';
        tool_use_id: string;
        result: any;
    };

    chatStreamEnd: {
        command: 'chatStreamEnd';
    };

    chatError: {
        command: 'chatError';
        error: string;
    };

    chatErrorWithActions: {
        command: 'chatErrorWithActions';
        error: string;
        actions?: Array<{
            text: string;
            command: string;
            args?: string;
        }>;
    };

    chatStopped: {
        command: 'chatStopped';
    };

    // Canvas Messages
    designFilesLoaded: {
        command: 'designFilesLoaded';
        data: {
            files: DesignFile[];
            workspaceInfo: {
                folderCount: number;
                folderNames: string[];
            };
        };
    };

    fileChanged: {
        command: 'fileChanged';
        data: any;
    };

    error: {
        command: 'error';
        data: {
            error: string;
        };
    };

    setState: {
        command: 'setState';
        state: any;
    };

    restoreSelection: {
        command: 'restoreSelection';
        fileName: string;
    };

    // Provider Messages
    currentProviderResponse: {
        command: 'currentProviderResponse';
        provider?: string;
        model?: string;
    };

    providerChanged: {
        command: 'providerChanged';
        provider: string;
        model: string;
    };

    // Context Messages
    contextFromCanvas: {
        command: 'contextFromCanvas';
        data: {
            fileName: string;
            type: 'file' | 'folder' | 'image' | 'images' | 'canvas';
        };
    };

    // Canvas Status
    canvasStatusResponse: {
        command: 'canvasStatusResponse';
        isOpen: boolean;
    };
}

/**
 * Message flow guarantees and race condition prevention:
 *
 * 1. INITIALIZATION SEQUENCE:
 *    - Webview loads → sends 'loadChatHistory' or 'migrateLocalStorage'
 *    - Extension responds with 'chatHistoryLoaded' or 'migrationComplete'
 *    - Webview sets initialized flag to prevent duplicate requests
 *
 * 2. WORKSPACE CHANGES:
 *    - Extension detects workspace change → sends 'workspaceChanged'
 *    - Webview receives → sends 'loadChatHistory' for new workspace
 *    - Extension responds with 'chatHistoryLoaded' for new workspace
 *
 * 3. SAVE OPERATIONS:
 *    - Webview chat changes → sends 'saveChatHistory' (debounced)
 *    - Extension saves to workspace state (no response needed)
 *    - On error, extension logs but doesn't crash
 *
 * 4. MIGRATION:
 *    - Only happens once per workspace (tracked by migration flag)
 *    - Webview sends 'migrateLocalStorage' with old data
 *    - Extension validates, sanitizes, saves, and responds with 'migrationComplete'
 *    - Webview clears localStorage on successful migration
 *
 * 5. ERROR HANDLING:
 *    - All handlers wrapped in try-catch
 *    - Errors logged but don't crash the extension
 *    - Fallback to empty states on failure
 *
 * 6. WEBVIEW RESTORATION:
 *    - Panel serializer saves state before disposal
 *    - On restoration, state is passed to constructor
 *    - State restoration delayed 500ms to ensure webview loads
 *
 * 7. RACE CONDITION GUARDS:
 *    - isInitialized flag prevents duplicate initialization
 *    - hasMigrated flag prevents duplicate migrations
 *    - _isDisposing flag prevents recursive disposal
 *    - Workspace change events debounced/throttled
 */

export type WebviewToExtensionMessage =
    WebviewToExtensionMessages[keyof WebviewToExtensionMessages];
export type ExtensionToWebviewMessage =
    ExtensionToWebviewMessages[keyof ExtensionToWebviewMessages];
