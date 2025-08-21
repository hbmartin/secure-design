import { useMemo } from 'react';
import { useWebviewApi } from '../contexts/WebviewContext';
import { WebviewLogger } from '../utils/WebviewLogger';
import type { ILogger } from '../../services/ILogger';

/**
 * React hook to get a logger instance for use in webview components.
 * The logger automatically sends all log messages to the extension host
 * where they are written to the VS Code output channel.
 */
export function useLogger(tag: string): ILogger {
    const { api } = useWebviewApi();

    // Memoize the logger instance to avoid recreating it on every render
    const logger = useMemo(() => new WebviewLogger(api, tag), [api]);

    return logger;
}
