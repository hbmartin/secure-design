import type { ModelMessage } from 'ai';

export interface MessageAction {
    readonly text: string;
    readonly command: string;
    readonly args?: string;
}

// Additional metadata for UI state
interface MessageMetadata {
    timestamp?: number;
    is_loading?: boolean;
    estimated_duration?: number;
    start_time?: number;
    elapsed_time?: number;
    progress_percentage?: number;
    session_id?: string;
    result_type?: string;
    duration_ms?: number;
    total_cost_usd?: number;
    // Tool-related metadata
    is_update?: boolean;
    tool_name?: string;
    tool_id?: string;
    tool_input?: any;
    tool_result?: any;
    result_received?: boolean;
    actions?: Array<MessageAction>;
    is_error?: boolean;
}

// Message with metadata for UI - extends AI SDK's ModelMessage
export type ChatMessage = ModelMessage & {
    metadata?: MessageMetadata;
};
