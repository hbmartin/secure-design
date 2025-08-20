import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  isViewApiResponse,
  isViewApiError,
  isViewApiEvent,
  type ViewAPI, 
  type ViewEvents, 
  type ViewApiRequest,
  type RequestContext
} from '../../api/viewApi';

/**
 * Deferred promise for handling async responses
 */
class DeferredPromise<T> {
  promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (reason?: any) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

/**
 * Generate a unique ID for requests
 */
function generateId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Context value interface providing type-safe API access
 */
interface WebviewContextValue {
  api: {
    [K in keyof ViewAPI]: (...args: Parameters<ViewAPI[K]>) => ReturnType<ViewAPI[K]>
  };
  addListener: <E extends keyof ViewEvents>(
    key: E,
    callback: ViewEvents[E]
  ) => void;
  removeListener: <E extends keyof ViewEvents>(
    key: E,
    callback: ViewEvents[E]
  ) => void;
  isReady: boolean;
}

const WebviewContext = createContext<WebviewContextValue | null>(null);

/**
 * Hook to access the webview API
 */
export const useWebviewApi = (): WebviewContextValue => {
  const context = useContext(WebviewContext);
  if (!context) {
    throw new Error('useWebviewApi must be used within WebviewProvider');
  }
  return context;
};

interface WebviewProviderProps {
  children: React.ReactNode;
}

/**
 * WebviewProvider provides type-safe API access to webview components
 */
export const WebviewProvider: React.FC<WebviewProviderProps> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const vscodeApi = useRef<VsCodeApi | undefined>(undefined);
  const pendingRequests = useRef<Map<string, DeferredPromise<any>>>(new Map());
  const listeners = useRef<Map<keyof ViewEvents, Set<(...args: any[]) => void>>>(new Map());
  
  // Generate context for this webview instance
  const contextRef = useRef<RequestContext>({
    viewId: `webview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    viewType: 'chat-interface',
    timestamp: Date.now(),
    sessionId: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  });
  
  // Initialize VSCode API
  useEffect(() => {
    try {
      if (typeof acquireVsCodeApi === 'function') {
        vscodeApi.current = acquireVsCodeApi();
        setIsReady(true);
      }
    } catch (error) {
      console.error('Failed to acquire VSCode API:', error);
    }
  }, []);

  /**
   * Type-safe API caller with request/response matching
   */
  const callApi = <K extends keyof ViewAPI>(
    key: K,
    ...params: Parameters<ViewAPI[K]>
  ): ReturnType<ViewAPI[K]> => {
    if (!vscodeApi.current) {
      console.error('VSCode API not available for call to', key);
      return Promise.reject(new Error('VSCode API not available')) as ReturnType<ViewAPI[K]>;
    }

    const id = generateId();
    const deferred = new DeferredPromise<Awaited<ReturnType<ViewAPI[K]>>>();
    
    const request: ViewApiRequest<K> = {
      type: 'request',
      id,
      key,
      params,
      context: contextRef.current
    };
    
    pendingRequests.current.set(id, deferred);
    
    // Set timeout for request (varies by operation type)
    const getTimeoutForOperation = (operation: string): number => {
      switch (operation) {
        case 'sendChatMessage':
          return 0; // No timeout for chat messages - handled through events
        case 'loadChatHistory':
        case 'saveChatHistory':
        case 'clearChatHistory':
          return 0; // No timeout for chat-related operations
        case 'selectFile':
        case 'selectFolder':
        case 'selectImages':
          return 60000; // 60 seconds for user interaction
        case 'changeProvider':
          return 15000; // 15 seconds for configuration changes
        default:
          return 30000; // 30 seconds default
      }
    };
    
    const timeoutMs = getTimeoutForOperation(key);
    if (timeoutMs > 0) {
      setTimeout(() => {
        if (pendingRequests.current.has(id)) {
          pendingRequests.current.delete(id);
          deferred.reject(new Error(`Request ${key} timed out after ${timeoutMs / 1000} seconds`));
        }
      }, timeoutMs);
    }
    
    // Send the request
    try {
      console.debug(`Sending API request: ${key}`, params);
      vscodeApi.current.postMessage(request);
    } catch (error) {
      console.error(`Failed to send API request ${key}:`, error);
      pendingRequests.current.delete(id);
      deferred.reject(error instanceof Error ? error : new Error(String(error)));
    }
    
    return deferred.promise as ReturnType<ViewAPI[K]>;
  };

  /**
   * Create typed API object using Proxy for dynamic method access
   */
  const api = new Proxy({} as WebviewContextValue['api'], {
    get: (_, key: string) => {
      return (...args: any[]) => {
        // Type assertion is safe here because the proxy ensures correct typing at usage
        return callApi(key as keyof ViewAPI, ...(args as Parameters<ViewAPI[keyof ViewAPI]>));
      };
    }
  });

  /**
   * Add an event listener with type safety
   */
  const addListener = <E extends keyof ViewEvents>(
    key: E,
    callback: ViewEvents[E]
  ): void => {
    if (!listeners.current.has(key)) {
      listeners.current.set(key, new Set());
    }
    listeners.current.get(key)!.add(callback as (...args: any[]) => void);
  };

  /**
   * Remove an event listener
   */
  const removeListener = <E extends keyof ViewEvents>(
    key: E,
    callback: ViewEvents[E]
  ): void => {
    listeners.current.get(key)?.delete(callback as (...args: any[]) => void);
  };

  /**
   * Handle messages from the extension host
   */
  useEffect(() => {
    const handleMessage = (event: MessageEvent<any>) => {
      const message = event.data;
      
      if (isViewApiResponse(message)) {
        // Handle API response
        const deferred = pendingRequests.current.get(message.id);
        if (deferred) {
          console.debug(`API response received for request ${message.id}:`, message.value);
          pendingRequests.current.delete(message.id);
          deferred.resolve(message.value);
        } else {
          console.warn(`No pending request found for response ID: ${message.id}`);
        }
      } else if (isViewApiError(message)) {
        // Handle API error
        const deferred = pendingRequests.current.get(message.id);
        if (deferred) {
          console.error(`API error received for request ${message.id}:`, message.value);
          pendingRequests.current.delete(message.id);
          deferred.reject(new Error(message.value));
        } else {
          console.warn(`No pending request found for error ID: ${message.id}`);
        }
      } else if (isViewApiEvent(message)) {
        // Handle event
        const callbacks = listeners.current.get(message.key);
        if (callbacks && callbacks.size > 0) {
          callbacks.forEach(cb => {
            try {
              cb(...message.value);
            } catch (error) {
              console.error(`Error in event listener for ${message.key}:`, error);
            }
          });
        }
      } else {
        // Handle legacy messages that don't follow the new format
        // This ensures compatibility during migration
        console.debug('Received legacy message format:', message);
      }
    };

    window.addEventListener('message', handleMessage);
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  /**
   * Cleanup pending requests on unmount
   */
  useEffect(() => {
    const currentRequests = pendingRequests.current;
    return () => {
      // Reject all pending requests
      currentRequests.forEach((deferred) => {
        deferred.reject(new Error('WebviewProvider unmounted'));
      });
      currentRequests.clear();
    };
  }, []);

  const contextValue: WebviewContextValue = {
    api,
    addListener,
    removeListener,
    isReady
  };

  return (
    <WebviewContext.Provider value={contextValue}>
      {children}
    </WebviewContext.Provider>
  );
};

/**
 * Higher-order component to ensure WebviewProvider is available
 */
export function withWebviewApi<P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P> {
  const WrappedComponent: React.FC<P> = (props) => {
    return (
      <WebviewProvider>
        <Component {...props} />
      </WebviewProvider>
    );
  };
  
  WrappedComponent.displayName = `withWebviewApi(${Component.displayName ?? Component.name})`;
  
  return WrappedComponent;
}