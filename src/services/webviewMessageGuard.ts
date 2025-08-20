import type * as vscode from 'vscode';
import { Logger } from './logger';

/**
 * Guard service to prevent race conditions and ensure reliable message handling
 * between extension host and webviews
 */
export class WebviewMessageGuard {
    private static readonly pendingRequests = new Map<
        string,
        {
            timestamp: number;
            resolve: (value: any) => void;
            reject: (error: any) => void;
        }
    >();

    private static readonly REQUEST_TIMEOUT = 5000; // 5 seconds
    private static requestIdCounter = 0;
    private static cleanupTimer: NodeJS.Timeout | undefined;

    /**
     * Send a message to webview and wait for response
     * Includes timeout and error handling
     */
    public static async sendMessageWithResponse<T = any>(
        webview: vscode.Webview,
        message: any,
        timeout: number = this.REQUEST_TIMEOUT
    ): Promise<T> {
        const requestId = `${Date.now()}_${++this.requestIdCounter}`;
        const messageWithId = { ...message, requestId };

        return new Promise<T>((resolve, reject) => {
            // Store pending request
            this.pendingRequests.set(requestId, {
                timestamp: Date.now(),
                resolve,
                reject,
            });

            // Set timeout
            const timeoutHandle = setTimeout(() => {
                const pending = this.pendingRequests.get(requestId);
                if (pending) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error(`Timeout waiting for response to ${message.command}`));
                    Logger.warn(`Message timeout: ${message.command} (${requestId})`);
                }
            }, timeout);

            // Send message
            webview.postMessage(messageWithId).then(
                () => {
                    // Message sent successfully, wait for response
                    Logger.debug(`Message sent: ${message.command} (${requestId})`);
                },
                err => {
                    // Failed to send message
                    clearTimeout(timeoutHandle);
                    this.pendingRequests.delete(requestId);
                    const error = err instanceof Error ? err : new Error(String(err));
                    reject(error);
                    Logger.error(`Failed to send message: ${message.command} - ${error}`);
                }
            );
        });
    }

    /**
     * Handle a response message from webview
     */
    public static handleResponse(requestId: string, response: any): void {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
            this.pendingRequests.delete(requestId);
            pending.resolve(response);
            Logger.debug(`Response received for request ${requestId}`);
        }
    }

    /**
     * Clean up old pending requests to prevent memory leaks
     */
    public static cleanupPendingRequests(): void {
        const now = Date.now();
        const timeout = this.REQUEST_TIMEOUT * 2; // Double timeout for cleanup

        for (const [requestId, pending] of this.pendingRequests.entries()) {
            if (now - pending.timestamp > timeout) {
                this.pendingRequests.delete(requestId);
                pending.reject(new Error('Request timed out and was cleaned up'));
                Logger.warn(`Cleaned up stale request: ${requestId}`);
            }
        }
    }

    /**
     * Debounce function to prevent rapid repeated messages
     */
    public static debounce<T extends (...args: any[]) => any>(
        func: T,
        wait: number
    ): (...args: Parameters<T>) => void {
        let timeout: NodeJS.Timeout | undefined;

        return (...args: Parameters<T>) => {
            if (timeout) {
                clearTimeout(timeout);
            }

            timeout = setTimeout(() => {
                func(...args);
            }, wait);
        };
    }

    /**
     * Throttle function to limit message frequency
     */
    public static throttle<T extends (...args: any[]) => any>(
        func: T,
        limit: number
    ): (...args: Parameters<T>) => void {
        let inThrottle = false;

        return (...args: Parameters<T>) => {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => {
                    inThrottle = false;
                }, limit);
            }
        };
    }

    /**
     * Ensure webview is ready before sending messages
     * Useful after webview creation or restoration
     */
    public static async ensureWebviewReady(
        webview: vscode.Webview,
        maxAttempts: number = 10,
        delayMs: number = 100
    ): Promise<boolean> {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                // Send a ping message
                await webview.postMessage({ command: 'ping' });
                Logger.debug('Webview is ready');
                return true;
            } catch {
                if (i < maxAttempts - 1) {
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                } else {
                    Logger.error(`Webview not ready after ${maxAttempts} attempts`);
                    return false;
                }
            }
        }
        return false;
    }

    /**
     * Wrap a message handler with error handling and logging
     */
    public static wrapHandler<T extends (...args: any[]) => any>(
        handlerName: string,
        handler: T
    ): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
        return async (...args: Parameters<T>) => {
            try {
                Logger.debug(`Handling message: ${handlerName}`);
                const result = await handler(...args);
                Logger.debug(`Message handled successfully: ${handlerName}`);
                return result;
            } catch (error) {
                Logger.error(`Error in message handler ${handlerName}: ${error}`);
                // Re-throw to let caller handle if needed
                throw error;
            }
        };
    }

    /**
     * Initialize the cleanup timer - should be called during extension activation
     */
    public static initialize(): void {
        if (!this.cleanupTimer) {
            this.cleanupTimer = setInterval(() => {
                this.cleanupPendingRequests();
            }, 60000); // Clean up every minute
            Logger.debug('WebviewMessageGuard cleanup timer initialized');
        }
    }

    /**
     * Stop the cleanup timer and clean up resources - should be called during extension deactivation
     */
    public static dispose(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
            Logger.debug('WebviewMessageGuard cleanup timer disposed');
        }

        // Clean up any remaining pending requests
        for (const [_requestId, pending] of this.pendingRequests.entries()) {
            pending.reject(new Error('Extension is deactivating'));
        }
        this.pendingRequests.clear();
    }
}
