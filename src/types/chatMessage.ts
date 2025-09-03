import type { ModelMessage } from 'ai';

export interface MessageAction {
    readonly text: string;
    readonly command: string;
    readonly args?: string;
}

// Metadata for UI state. Timestamps are epoch milliseconds
export interface MessageMetadata {
    timestamp?: number;
    is_loading?: boolean;
    start_time?: number;
    end_time?: number;
    session_id?: string;
    total_cost_usd?: number;
    actions?: Array<MessageAction>;
    is_error?: boolean;
}

// Message with metadata for UI - extends AI SDK's ModelMessage
export type ChatMessage = ModelMessage & {
    metadata?: MessageMetadata;
};
