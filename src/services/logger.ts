import * as vscode from 'vscode';
import { type ILogger, LogLevel } from './ILogger';

function removePromptsFromData<T extends Record<any, any>>(
    dictionary: T | undefined | null
): T | undefined {
    if (dictionary === null || dictionary === undefined) {
        return undefined;
    }
    if (typeof dictionary !== 'object') {
        return dictionary;
    }

    try {
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
    } catch (error) {
        // Silently handle cases where Object.values fails
        console.warn('Error processing log data:', error);
        return dictionary;
    }

    return dictionary;
}

/**
 * Static logger class for extension-wide logging
 */
class LoggerImpl {
    private static readonly outputChannel: vscode.OutputChannel =
        vscode.window.createOutputChannel('Securedesign');

    public static debug(message: string, data: Record<any, any> | undefined = undefined) {
        this.log(LogLevel.DEBUG, message, data);
    }

    public static info(message: string, data: Record<any, any> | undefined = undefined) {
        this.log(LogLevel.INFO, message, data);
    }

    public static warn(message: string, data: Record<any, any> | undefined = undefined) {
        this.log(LogLevel.WARN, message, data);
    }

    public static error(message: string, data: Record<any, any> | undefined = undefined) {
        this.log(LogLevel.ERROR, message, data);
    }

    public static dispose() {
        this.outputChannel.dispose();
    }

    private static log(level: LogLevel, message: string, data: Record<any, any> | undefined) {
        const timestamp = new Date().toISOString().split('T')[1];
        const levelStr = LogLevel[level] || 'UNKNOWN';
        const cleanedData = removePromptsFromData(data);
        if (cleanedData !== undefined) {
            this.outputChannel.appendLine(
                `[${timestamp}] [${levelStr}] ${message} : ${JSON.stringify(cleanedData)}`
            );
        } else {
            this.outputChannel.appendLine(`[${timestamp}] [${levelStr}] ${message}`);
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

export const getLogger = (tag: string): ILogger => ({
    debug: (message: string, data?: Record<any, any>) =>
        LoggerImpl.debug(`[${tag}] ${message}`, data),
    info: (message: string, data?: Record<any, any>) =>
        LoggerImpl.info(`[${tag}] ${message}`, data),
    warn: (message: string, data?: Record<any, any>) =>
        LoggerImpl.warn(`[${tag}] ${message}`, data),
    error: (message: string, data?: Record<any, any>) =>
        LoggerImpl.error(`[${tag}] ${message}`, data),
    dispose: () => {},
});
