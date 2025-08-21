import * as vscode from 'vscode';

export enum LogLevel {
    DEBUG,
    INFO,
    WARN,
    ERROR,
}

export class Logger {
    private static readonly outputChannel = vscode.window.createOutputChannel('Securedesign');

    public static debug(message: string, data: Record<any, any> | undefined = undefined) {
        this.log(LogLevel.DEBUG, 'DEBUG', message, data);
    }

    public static info(message: string, data: Record<any, any> | undefined = undefined) {
        this.log(LogLevel.INFO, 'INFO', message, data);
    }

    public static warn(message: string, data: Record<any, any> | undefined = undefined) {
        this.log(LogLevel.WARN, 'WARN', message, data);
    }

    public static error(message: string, data: Record<any, any> | undefined = undefined) {
        this.log(LogLevel.ERROR, 'ERROR', message, data);
    }

    public static dispose() {
        if (this.outputChannel) {
            this.outputChannel.dispose();
        }
    }

    private static log(
        level: LogLevel,
        label: string,
        message: string,
        data: Record<any, any> | undefined
    ) {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [${label}] ${message}`);

        switch (level) {
            case LogLevel.ERROR:
                console.error(message, data);
                break;
            case LogLevel.WARN:
                console.warn(message, data);
                break;
            case LogLevel.INFO:
                console.info(message, data);
                break;
            case LogLevel.DEBUG:
                console.debug(message, data);
                break;
        }
    }
}
