import type { ILogger } from 'react-vscode-webview-ipc/host';
import type { ChatMessage } from './chatMessage';

export interface AgentService {
    query(
        messages: ChatMessage[],
        abortController: AbortController,
        onMessage: (prev: ChatMessage[]) => void
    ): Promise<ChatMessage[]>;

    isApiKeyAuthError(errorMessage: string): boolean;
}

export interface ExecutionContext {
    workingDirectory: string;
    sessionId: string;
    logger: ILogger;
    abortController?: AbortController;
}
