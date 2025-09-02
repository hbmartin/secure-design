import { LogLevel, type ILogger } from '../../services/ILogger';

interface LogMessage {
    type: 'log';
    level: LogLevel;
    message: string;
    data?: Record<any, any>;
}

export function isLogMessage(value: any): value is LogMessage {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'type')) return false;
    if (value.type !== 'log') return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'level')) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'message')) return false;
    return true;
}

export class WebviewLogger implements ILogger {
    constructor(
        private readonly vscode: VsCodeApi,
        readonly tag: string
    ) {}

    debug(message: string, data?: Record<any, any>): void {
        this.vscode.postMessage({
            type: 'log',
            level: LogLevel.DEBUG,
            message: `[${this.tag}] ${message}`,
            data,
        } satisfies LogMessage);
    }

    info(message: string, data?: Record<any, any>): void {
        this.vscode.postMessage({
            type: 'log',
            level: LogLevel.INFO,
            message: `[${this.tag}] ${message}`,
            data,
        } satisfies LogMessage);
    }

    warn(message: string, data?: Record<any, any>): void {
        this.vscode.postMessage({
            type: 'log',
            level: LogLevel.WARN,
            message: `[${this.tag}] ${message}`,
            data,
        } satisfies LogMessage);
    }

    error(message: string, data?: Record<any, any>): void {
        this.vscode.postMessage({
            type: 'log',
            level: LogLevel.ERROR,
            message: `[${this.tag}] ${message}`,
            data,
        } satisfies LogMessage);
    }

    dispose(): void {
        // No resources to dispose in webview context
        // The actual output channel is managed by the extension host Logger
    }
}
