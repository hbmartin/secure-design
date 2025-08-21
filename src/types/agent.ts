import type { CoreMessage } from 'ai';
import type { ILogger } from '../services/ILogger';

export interface AgentService {
    query(
        prompt?: string,
        messages?: CoreMessage[],
        options?: any,
        abortController?: AbortController,
        onMessage?: (message: any) => void
    ): Promise<any[]>;

    hasApiKey(): boolean;
    isApiKeyAuthError(errorMessage: string): boolean;
}

export interface ExecutionContext {
    workingDirectory: string;
    sessionId: string;
    logger: ILogger;
    abortController?: AbortController;
}
