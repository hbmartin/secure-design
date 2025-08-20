import * as vscode from 'vscode';
import {
  isViewApiRequest, 
  type ViewAPI, 
  type ViewEvents, 
  type ViewApiResponse, 
  type ViewApiError, 
  type ViewApiEvent,
  type RequestContext
} from '../api/viewApi';
import type { ChatMessage } from '../types/chatMessage';
import type { WorkspaceStateService } from '../services/workspaceStateService';
import type { ChatController } from '../controllers/ChatController';
import { Logger } from '../services/logger';

/**
 * WebviewApiProvider implements the type-safe API contract between host and webviews.
 * It handles all API calls and event dispatching with full type safety.
 */
interface ConnectedView {
  view: vscode.WebviewView;
  context: RequestContext;
}

export class WebviewApiProvider implements vscode.Disposable {
  private readonly connectedViews = new Map<string, ConnectedView>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly workspaceState: WorkspaceStateService;
  private chatController: ChatController | null;

  /**
   * Type-safe API implementation that maps to concrete business logic
   */
  private readonly api: ViewAPI = {
    sendChatMessage: async (message: string, history: ChatMessage[]): Promise<void> => {
      Logger.info('API: sendChatMessage called');
      if (!this.chatController) {
        throw new Error('ChatController not initialized. Call initializeChatController() first.');
      }
      
      // Process chat message asynchronously to avoid timeout
      // The response will be handled through events (chatStreamStart, chatResponseChunk, etc.)
      void this.chatController.handleChatMessage({ message, chatHistory: history }).catch(error => {
        Logger.error('Error processing chat message:', error);
        this.triggerEvent('chatError', error instanceof Error ? error.message : String(error));
      });
      
      // Return immediately to avoid timeout
      return Promise.resolve();
    },

    stopChat: (): void => {
      Logger.info('API: stopChat called');
      if (!this.chatController) {
        Logger.warn('ChatController not initialized. Cannot stop chat.');
        return;
      }
      this.chatController.stopChat();
    },

    saveChatHistory: async (history: ChatMessage[]): Promise<void> => {
      Logger.info(`API: saveChatHistory called with ${history.length} messages`);
      await this.workspaceState.saveChatHistory(history);
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    loadChatHistory: async (): Promise<ChatMessage[]> => {
      Logger.info('API: loadChatHistory called');
      return this.workspaceState.getChatHistory();
    },

    clearChatHistory: async (): Promise<void> => {
      Logger.info('API: clearChatHistory called');
      await this.workspaceState.clearChatHistory();
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    getCurrentProvider: async (): Promise<{ providerId: string; model: string }> => {
      Logger.info('API: getCurrentProvider called');
      if (!this.chatController) {
        throw new Error('ChatController not initialized. Call initializeChatController() first.');
      }
      return this.chatController.getCurrentProvider();
    },

    changeProvider: async (providerId: string, model: string): Promise<void> => {
      Logger.info(`API: changeProvider called with ${providerId}, ${model}`);
      if (!this.chatController) {
        throw new Error('ChatController not initialized. Call initializeChatController() first.');
      }
      await this.chatController.changeProvider({ providerId, model });
    },

    selectFile: async (): Promise<string | null> => {
      Logger.info('API: selectFile called');
      const files = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'All Files': ['*'],
          'Code Files': ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'go', 'rs', 'php'],
          'Text Files': ['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'toml'],
          'Config Files': ['config', 'conf', 'env', 'ini'],
        },
      });
      return files?.[0]?.fsPath ?? null;
    },

    selectFolder: async (): Promise<string | null> => {
      Logger.info('API: selectFolder called');
      const folders = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
      });
      return folders?.[0]?.fsPath ?? null;
    },

    selectImages: async (): Promise<string[] | null> => {
      Logger.info('API: selectImages called');
      const images = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: true,
        filters: {
          Images: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'],
        },
      });
      return images?.map(img => img.fsPath) ?? null;
    },

    showInformationMessage: (message: string): void => {
      Logger.info(`API: showInformationMessage called: ${message}`);
      vscode.window.showInformationMessage(message);
    },

    showErrorMessage: (message: string): void => {
      Logger.info(`API: showErrorMessage called: ${message}`);
      vscode.window.showErrorMessage(message);
    },

    executeCommand: async (command: string, args?: any): Promise<void> => {
      Logger.info(`API: executeCommand called: ${command}`);
      if (args) {
        await vscode.commands.executeCommand(command, args);
      } else {
        await vscode.commands.executeCommand(command);
      }
    },

    checkCanvasStatus: (): Promise<boolean> => {
      Logger.info('API: checkCanvasStatus called');
      // Check if SuperdesignCanvasPanel is currently open
      const panels = vscode.window.tabGroups.all.flatMap(group => group.tabs);
      const canvasPanel = panels.find(tab => 
        tab.label === 'Superdesign Canvas' || 
        (tab.input as any)?.viewType === 'superdesign.canvas'
      );
      return Promise.resolve(!!canvasPanel);
    },

    openCanvas: async (): Promise<void> => {
      Logger.info('API: openCanvas called');
      await vscode.commands.executeCommand('superdesign.openCanvas');
    },

    initializeSecuredesign: async (): Promise<void> => {
      Logger.info('API: initializeSecuredesign called');
      await vscode.commands.executeCommand('superdesign.initializeProject');
    },

    getBase64Image: async (filePath: string): Promise<string> => {
      Logger.info(`API: getBase64Image called for: ${filePath}`);
      try {
        const fileUri = vscode.Uri.file(filePath);
        const fileData = await vscode.workspace.fs.readFile(fileUri);
        
        // Determine MIME type from file extension
        const extension = filePath.toLowerCase().split('.').pop();
        let mimeType: string;
         // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
        switch (extension) {
          case 'jpg':
          case 'jpeg':
            mimeType = 'image/jpeg';
            break;
          case 'png':
            mimeType = 'image/png';
            break;
          case 'gif':
            mimeType = 'image/gif';
            break;
          case 'bmp':
            mimeType = 'image/bmp';
            break;
          case 'webp':
            mimeType = 'image/webp';
            break;
          case 'svg':
            mimeType = 'image/svg+xml';
            break;
          default:
            mimeType = 'application/octet-stream';
        }
        
        const base64Data = Buffer.from(fileData).toString('base64');
        return `data:${mimeType};base64,${base64Data}`;
      } catch (error) {
        Logger.error(`Failed to convert image to base64: ${error}`);
        throw new Error(`Failed to read image file: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    saveImageToMoodboard: async (data: {
      fileName: string;
      originalName: string;
      base64Data: string;
      mimeType: string;
      size: number;
    }): Promise<void> => {
      Logger.info(`API: saveImageToMoodboard called for: ${data.fileName}`);
      
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder found');
      }

      try {
        // Create .superdesign/moodboard directory if it doesn't exist
        const moodboardDir = vscode.Uri.joinPath(workspaceFolder.uri, '.superdesign', 'moodboard');

        try {
          await vscode.workspace.fs.stat(moodboardDir);
        } catch {
          await vscode.workspace.fs.createDirectory(moodboardDir);
        }

        // Convert base64 to buffer and save file
        const base64Content = data.base64Data.split(',')[1];
        const buffer = Buffer.from(base64Content, 'base64');
        const filePath = vscode.Uri.joinPath(moodboardDir, data.fileName);

        await vscode.workspace.fs.writeFile(filePath, buffer);

        // Trigger success event
        this.triggerEvent('imageSavedToMoodboard', {
          fileName: data.fileName,
          originalName: data.originalName,
          fullPath: filePath.fsPath,
        });
      } catch (error) {
        // Trigger error event
        this.triggerEvent('imageSaveError', {
          fileName: data.fileName,
          originalName: data.originalName,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }
  };
  
  constructor(
    workspaceState: WorkspaceStateService,
    _outputChannel: vscode.OutputChannel
  ) {
    this.chatController = null;
    this.workspaceState = workspaceState;
    // _outputChannel is prefixed with underscore to indicate it's unused
  }

  /**
   * Initialize the ChatController - must be called after construction
   */
  initializeChatController(chatController: ChatController): void {
    if (this.chatController) {
      throw new Error('ChatController already initialized');
    }
    this.chatController = chatController;
    Logger.info('ChatController initialized in WebviewApiProvider');
  }

  // Chat handling methods moved to ChatController

  /**
   * Handle incoming messages from webview with full type safety
   */
  async handleMessage(message: any, webview: vscode.Webview): Promise<void> {
    if (!isViewApiRequest(message)) {
      Logger.warn('Received invalid message format');
      return;
    }

    // Log request context for debugging and analytics
    const contextInfo = message.context ? 
      `from ${message.context.viewType}:${message.context.viewId}` : 
      'without context';
    Logger.debug(`Handling API request: ${message.key} ${contextInfo}`);

    try {
      // Call the API method with type safety
      const result = await Promise.resolve(
        (this.api[message.key] as any)(...message.params)
      );
      
      // Send typed response
      const response: ViewApiResponse = {
        type: 'response',
        id: message.id,
        value: result
      };
      
      await webview.postMessage(response);
    } catch (error) {
      Logger.error(`API call failed for ${message.key} ${contextInfo}: ${String(error)}`);
      
      // Send typed error
      const errorResponse: ViewApiError = {
        type: 'error',
        id: message.id,
        value: error instanceof Error ? error.message : 'An unexpected error occurred'
      };
      
      await webview.postMessage(errorResponse);
    }
  }

  /**
   * Type-safe event triggering to all connected webviews
   */
  triggerEvent<E extends keyof ViewEvents>(
    key: E,
    ...params: Parameters<ViewEvents[E]>
  ): void {
    const event: ViewApiEvent<E> = {
      type: 'event',
      key,
      value: params
    };
    
    Logger.debug(`Triggering event: ${key}`);
    
    // Send to all connected views
    this.connectedViews.forEach((connectedView, viewId) => {
      connectedView.view.webview.postMessage(event).then(
        () => {},
        (err: Error) => {
          Logger.error(`Failed to send event ${key} to view ${connectedView.context.viewType}:${viewId}: ${String(err)}`);
        }
      );
    });
  }

  /**
   * Register a webview with this API provider
   */
  registerView(id: string, view: vscode.WebviewView, viewType: string = 'unknown'): void {
    const context: RequestContext = {
      viewId: id,
      viewType: viewType,
      timestamp: Date.now(),
      sessionId: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    this.connectedViews.set(id, { view, context });
    Logger.info(`Registered webview: ${viewType}:${id}`);
    
    // Clean up on dispose
    view.onDidDispose(() => {
      this.connectedViews.delete(id);
      Logger.info(`Unregistered webview: ${viewType}:${id}`);
    });
  }

  /**
   * Get the number of connected views (useful for testing)
   */
  getConnectedViewCount(): number {
    return this.connectedViews.size;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.connectedViews.clear();
    Logger.info('WebviewApiProvider disposed');
  }
}