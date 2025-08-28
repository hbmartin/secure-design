import { useContext, useMemo } from 'react';
import { WebviewContext } from '../contexts/WebviewContext';
import { WebviewLogger } from '../utils/WebviewLogger';
import type { ILogger } from '../../services/ILogger';

/**
 * React hook to get a logger instance for use in webview components.
 * The logger automatically sends all log messages to the extension host
 * where they are written to the VS Code output channel.
 */
export function useLogger(tag: string): ILogger {
    const context = useContext(WebviewContext);
    return useMemo(
        () => (context?.api ? new WebviewLogger(context.api, tag) : createConsoleLogger(tag)),
        [context?.api, tag]
    );
}

function createConsoleLogger(tag: string): ILogger {
    return {
        debug: (message: string, data?: Record<any, any>) =>
            console.debug(`[${tag}] ${message}`, data),
        info: (message: string, data?: Record<any, any>) =>
            console.info(`[${tag}] ${message}`, data),
        warn: (message: string, data?: Record<any, any>) =>
            console.warn(`[${tag}] ${message}`, data),
        error: (message: string, data?: Record<any, any>) =>
            console.error(`[${tag}] ${message}`, data),
        dispose: () => {},
    };
}
