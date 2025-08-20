import type { ChatMessage } from '../types/chatMessage';

/**
 * Type-safe API contract shared between host (extension) and webview
 * This ensures compile-time safety for all cross-boundary communication
 */
export interface ViewAPI {
  // Chat operations
  sendChatMessage: (message: string, history: ChatMessage[]) => Promise<void>;
  stopChat: () => void;
  saveChatHistory: (history: ChatMessage[]) => Promise<void>;
  loadChatHistory: () => Promise<ChatMessage[]>;
  clearChatHistory: () => Promise<void>;
  
  // Provider operations
  getCurrentProvider: () => Promise<{ providerId: string; model: string }>;
  changeProvider: (providerId: string, model: string) => Promise<void>;
  
  // Context operations
  selectFile: () => Promise<string | null>;
  selectFolder: () => Promise<string | null>;
  selectImages: () => Promise<string[] | null>;
  
  // Utility operations
  showInformationMessage: (message: string) => void;
  showErrorMessage: (message: string) => void;
  executeCommand: (command: string, args?: any) => Promise<void>;
  
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
  }) => Promise<void>;
}

/**
 * Events that can be triggered by the host and listened to by webviews
 * These represent notifications/updates flowing from host to webview
 */
export interface ViewEvents {
  // Chat events
  chatStreamStart: () => void;
  chatResponseChunk: (chunk: string, messageType?: string, metadata?: any) => void;
  chatToolUpdate: (toolId: string, args: any) => void;
  chatToolResult: (toolId: string, result: any) => void;
  chatStreamEnd: () => void;
  chatError: (error: string, actions?: any[]) => void;
  chatStopped: () => void;
  
  // State events
  workspaceChanged: (workspaceId?: string) => void;
  providerChanged: (providerId: string, model: string) => void;
  historyLoaded: (history: ChatMessage[], workspaceId?: string) => void;
  migrationComplete: (history: ChatMessage[], workspaceId?: string) => void;
  
  // Context events
  contextFromCanvas: (data: { fileName: string; type: string }) => void;
  
  // Image events
  imageSavedToMoodboard: (data: { fileName: string; originalName: string; fullPath: string }) => void;
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

export type ViewApiMessage = 
  | ViewApiRequest
  | ViewApiResponse
  | ViewApiError
  | ViewApiEvent;

/**
 * Type guard to check if a message is a valid API request
 */
export function isViewApiRequest(msg: any): msg is ViewApiRequest {
  return (
    msg &&
    typeof msg === 'object' &&
    msg.type === 'request' &&
    typeof msg.id === 'string' &&
    typeof msg.key === 'string' &&
    Array.isArray(msg.params) &&
    (msg.context === undefined || (
      typeof msg.context === 'object' &&
      typeof msg.context.viewId === 'string' &&
      typeof msg.context.viewType === 'string' &&
      typeof msg.context.timestamp === 'number'
    ))
  );
}

/**
 * Type guard to check if a message is a valid API response
 */
export function isViewApiResponse(msg: any): msg is ViewApiResponse {
  return (
    msg &&
    typeof msg === 'object' &&
    msg.type === 'response' &&
    typeof msg.id === 'string' &&
    msg.hasOwnProperty('value')
  );
}

/**
 * Type guard to check if a message is a valid API error
 */
export function isViewApiError(msg: any): msg is ViewApiError {
  return (
    msg &&
    typeof msg === 'object' &&
    msg.type === 'error' &&
    typeof msg.id === 'string' &&
    typeof msg.value === 'string'
  );
}

/**
 * Type guard to check if a message is a valid API event
 */
export function isViewApiEvent(msg: any): msg is ViewApiEvent {
  return (
    msg &&
    typeof msg === 'object' &&
    msg.type === 'event' &&
    typeof msg.key === 'string' &&
    Array.isArray(msg.value)
  );
}