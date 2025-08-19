import type { ModelMessage } from 'ai';

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
    is_error?: boolean;
    duration_ms?: number;
    total_cost_usd?: number;
    // Tool-related metadata
    tool_name?: string;
    tool_id?: string;
    tool_input?: any;
    tool_result?: any;
    result_is_error?: boolean;
    result_received?: boolean;
    actions?: Array<{
        text: string;
        command: string;
        args?: string;
    }>;
    error_context?: string;
}

// Message with metadata for UI - extends AI SDK's ModelMessage
export type ChatMessage = ModelMessage & {
    metadata?: MessageMetadata;
};
