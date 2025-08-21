import { LogLevel, type ILogger } from '../../services/ILogger';
import type { ViewAPI } from '../../api/viewApi';

/**
 * WebviewLogger implements the ILogger interface for webview contexts.
 * It uses the ViewAPI to send log messages to the extension host where
 * they are processed by the main Logger service.
 *
 * This ensures all logs from both the extension and webviews are
 * centralized in the same output channel.
 */
export class WebviewLogger implements ILogger {
    constructor(
        private readonly api: ViewAPI,
        readonly tag: string
    ) {}

    debug(message: string, data?: Record<any, any>): void {
        this.api.log(LogLevel.DEBUG, `[${this.tag}] ${message}`, data);
    }

    info(message: string, data?: Record<any, any>): void {
        this.api.log(LogLevel.INFO, `[${this.tag}] ${message}`, data);
    }

    warn(message: string, data?: Record<any, any>): void {
        this.api.log(LogLevel.WARN, `[${this.tag}] ${message}`, data);
    }

    error(message: string, data?: Record<any, any>): void {
        this.api.log(LogLevel.ERROR, `[${this.tag}] ${message}`, data);
    }

    dispose(): void {
        // No resources to dispose in webview context
        // The actual output channel is managed by the extension host Logger
    }
}
