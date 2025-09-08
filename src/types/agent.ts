import type { ILogger } from '../services/ILogger';
import type { ChatMessage } from './chatMessage';

export interface AgentService {
    query(
        messages: ChatMessage[],
        abortController: AbortController,
        onMessage: (previous: ChatMessage[]) => void
    ): Promise<ChatMessage[]>;

    hasApiKey(): boolean;
    isApiKeyAuthError(errorMessage: string): boolean;
}

export interface ExecutionContext {
    workingDirectory: string;
    sessionId: string;
    logger: ILogger;
    abortController?: AbortController;
}
