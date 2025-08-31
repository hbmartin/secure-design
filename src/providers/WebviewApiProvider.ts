import type * as vscode from 'vscode';
import { getLogger } from '../services/logger';
import type { EventTrigger } from '../chat/ChatController';
import type { RequestContext, ViewApiEvent, ViewEvents } from '../api/viewApi';

/**
 * WebviewApiProvider implements the type-safe API contract between host and webviews.
 * It handles all API calls and event dispatching with full type safety.
 */
interface ConnectedView {
    view: vscode.WebviewView;
    context: RequestContext;
}

export class WebviewApiProvider implements vscode.Disposable, EventTrigger {
    private readonly connectedViews = new Map<string, ConnectedView>();
    private readonly disposables: vscode.Disposable[] = [];
    private readonly logger = getLogger('WebviewApiProvider');

    /**
     * Type-safe event triggering to all connected webviews
     * Prunes failing webviews to prevent unbounded growth and repeated failures
     */
    triggerEvent<E extends keyof ViewEvents>(key: E, ...params: Parameters<ViewEvents[E]>): void {
        const event: ViewApiEvent<E> = {
            type: 'event',
            key,
            value: params,
        };

        this.logger.debug(`Triggering event: ${key}`);

        // Track views that fail to receive messages
        const failedViews: string[] = [];

        // Send to all connected views
        this.connectedViews.forEach((connectedView, viewId) => {
            try {
                // Wrap postMessage in try-catch to handle synchronous exceptions
                const postPromise = connectedView.view.webview.postMessage(event);

                // Handle async failures
                postPromise.then(
                    () => {
                        // Message sent successfully
                    },
                    (err: Error) => {
                        this.logger.error(
                            `Failed to send event ${key} to view ${connectedView.context.viewType}:${viewId}: ${String(err)}`
                        );

                        // Mark view for removal
                        failedViews.push(viewId);
                    }
                );
            } catch (error) {
                // Handle synchronous exceptions from postMessage
                this.logger.error(
                    `Exception while sending event ${key} to view ${connectedView.context.viewType}:${viewId}: ${String(error)}`
                );

                // Mark view for removal
                failedViews.push(viewId);
            }
        });

        // Prune failed views after iteration to avoid modifying collection during iteration
        if (failedViews.length > 0) {
            failedViews.forEach(viewId => {
                const connectedView = this.connectedViews.get(viewId);
                if (connectedView) {
                    this.logger.warn(
                        `Removing failed webview ${connectedView.context.viewType}:${viewId} from connectedViews`
                    );

                    // Only remove from connected views - let webviews handle their own disposal lifecycle
                    this.connectedViews.delete(viewId);
                }
            });

            this.logger.info(
                `Removed ${failedViews.length} failed webview(s) from connectedViews. Remaining: ${this.connectedViews.size}`
            );
        }
    }

    /**
     * Register a webview with this API provider
     */
    registerView(id: string, view: vscode.WebviewView, viewType: string = 'unknown'): void {
        const context: RequestContext = {
            viewId: id,
            viewType: viewType,
            timestamp: Date.now(),
            sessionId: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        };

        this.connectedViews.set(id, { view, context });
        this.logger.info(`Registered webview: ${viewType}:${id}`);

        // Clean up on dispose
        view.onDidDispose(() => {
            this.connectedViews.delete(id);
            this.logger.info(`Unregistered webview: ${viewType}:${id}`);
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
        this.logger.info('WebviewApiProvider disposed');
    }
}
