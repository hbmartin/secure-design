import * as vscode from 'vscode';
import { type ILogger, LogLevel } from './ILogger';

function removePromptsFromData<T extends Record<string, any>>(dictionary: T): T {
    for (const value of Object.values(dictionary)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                if (
                    typeof item === 'object' &&
                    item !== null &&
                    'content' in item &&
                    typeof item.content === 'string'
                ) {
                    delete item.content;
                }
            }
        }
    }

    return dictionary;
}

/**
 * Static logger class for extension-wide logging
 */
class LoggerImpl {
    private static outputChannel: vscode.OutputChannel | undefined =
        vscode.window.createOutputChannel('Securedesign');

    public static debug(message: string, data: Record<any, any> | undefined = undefined) {
        this.log(LogLevel.DEBUG, '', message, data);
    }

    public static info(message: string, data: Record<any, any> | undefined = undefined) {
        this.log(LogLevel.INFO, '', message, data);
    }

    public static warn(message: string, data: Record<any, any> | undefined = undefined) {
        this.log(LogLevel.WARN, '', message, data);
    }

    public static error(message: string, data: Record<any, any> | undefined = undefined) {
        this.log(LogLevel.ERROR, '', message, data);
    }

    public static dispose() {
        this.outputChannel?.dispose();
        this.outputChannel = undefined;
    }

    private static log(
        level: LogLevel,
        tag: string,
        message: string,
        data: Record<any, any> | undefined
    ) {
        const timestamp = new Date().toISOString().split('T')[1];
        const levelStr = LogLevel[level] || 'UNKNOWN';
        this.outputChannel?.appendLine(`[${timestamp}] [${levelStr}] ${tag}${message}`);
        if (data !== undefined) {
            const cleanedData = removePromptsFromData(data);
            this.outputChannel?.appendLine(JSON.stringify(cleanedData));
        }
    }
}

export const Logger: ILogger = {
    debug: (message: string, data?: Record<any, any>) => LoggerImpl.debug(message, data),
    info: (message: string, data?: Record<any, any>) => LoggerImpl.info(message, data),
    warn: (message: string, data?: Record<any, any>) => LoggerImpl.warn(message, data),
    error: (message: string, data?: Record<any, any>) => LoggerImpl.error(message, data),
    dispose: () => LoggerImpl.dispose(),
};
