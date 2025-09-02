import type { ToolResultPart, ToolCallPart } from 'ai';
import type { ChatMessage } from '../types';
import type { ChatChunkMetadata } from '../api/viewApi';
import type { LanguageModelV2ToolResultOutput } from '@ai-sdk/provider';

export function isToolCallPart(value: unknown): value is ToolCallPart {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'type')) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'toolCallId')) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'toolName')) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'input')) return false;

    const v = value as Record<string, unknown>;
    if (v.type !== 'tool-call') return false;
    if (typeof v.toolCallId !== 'string') return false;
    if (typeof v.toolName !== 'string') return false;

    return true;
}

export function isToolResultPart(value: unknown): value is ToolResultPart {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'type')) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'toolCallId')) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'toolName')) return false;

    const v = value as Record<string, unknown>;
    if (v.type !== 'tool-result') return false;
    if (typeof v.toolCallId !== 'string') return false;
    if (typeof v.toolName !== 'string') return false;
    if ('isError' in v && typeof v.isError !== 'boolean') return false;

    return true;
}

export function handleStreamMessage(prev: ChatMessage[], message: ChatMessage): ChatMessage[] {
    // Handle assistant messages
    if (message.role === 'assistant') {
        if (typeof message.content === 'string') {
            // Simple text content
            if (message.metadata?.is_error === true) {
                return handleChatError(prev, message);
            }
            if (message.content.trim()) {
                return handleResponseChunk(prev, message.content, 'assistant', {});
            }
            console.error('No content in message', message);
            return prev;
        } else if (Array.isArray(message.content)) {
            let newMessages = [...prev];
            // Handle assistant content array (text parts, tool calls, etc.)
            console.log('Handling assistant message with array content:', message);
            for (const part of message.content) {
                if (part.type === 'text' && part.text) {
                    // Send text content
                    newMessages = handleResponseChunk(newMessages, part.text, 'assistant', {});
                } else if (part.type === 'tool-call') {
                    const args = part.input ?? (part as any).args ?? (part as any).params;
                    if (message.metadata?.is_update === true) {
                        newMessages = handleToolUpdate(newMessages, part.toolCallId, args);
                    } else {
                        const metadata: ChatChunkMetadata = {
                            tool_id: part.toolCallId,
                            tool_name: part.toolName,
                            args,
                        };
                        newMessages = handleResponseChunk(newMessages, '', 'tool-call', metadata);
                    }
                } else {
                    console.error(`Unknown tool part type: ${part.type}`, message);
                }
            }
            return newMessages;
        }
        console.error(`Unknown assistant content type: ${typeof message.content}`, message);
        throw new Error(`Unknown assistant content type: ${typeof message.content}`);
    } else if (message.role === 'tool') {
        // Handle tool results
        if (Array.isArray(message.content)) {
            let newMessages = [...prev];
            for (const part of message.content) {
                if (part.type === 'tool-result') {
                    const toolResultPart = part as any;
                    if (!('output' in toolResultPart)) {
                        console.error(
                            `Tool result part missing output field: ${JSON.stringify(part)}`
                        );
                        continue;
                    }
                    const rawOutput = toolResultPart.output;

                    // Ensure the output conforms to LanguageModelV2ToolResultOutput interface
                    // The AI SDK should already provide this in the correct format
                    const aiSdkOutput: LanguageModelV2ToolResultOutput =
                        normalizeToolResultOutput(rawOutput);

                    const metadata: ChatChunkMetadata = {
                        tool_id: part.toolCallId,
                        tool_name: part.toolName,
                        output: aiSdkOutput,
                    };
                    // Pass empty string as chunk since the actual data is in metadata
                    newMessages = handleResponseChunk(newMessages, '', 'tool-result', metadata);
                    newMessages = handleToolResult(newMessages, part.toolCallId);
                }
            }
            return newMessages;
        }
        console.error(
            `Unknown tool content type: ${typeof message.content}`,
            JSON.stringify(message, null, 2)
        );
        throw new Error(`Unknown tool content type: ${typeof message.content}`);
    }
    console.error(`Unknown message role: ${message.role}`, JSON.stringify(message, null, 2));
    throw new Error(`Unknown message role: ${message.role}`);
}

function normalizeToolResultOutput(rawOutput: any): LanguageModelV2ToolResultOutput {
    // If it's already in the correct format, return as-is
    if (rawOutput && typeof rawOutput === 'object' && rawOutput.type) {
        // Validate it's a valid LanguageModelV2ToolResultOutput type
        const validTypes = ['text', 'json', 'error-text', 'error-json', 'content'];
        if (validTypes.includes(rawOutput.type)) {
            return rawOutput as LanguageModelV2ToolResultOutput;
        }
    }

    // Handle legacy or non-conformant outputs
    if (typeof rawOutput === 'string') {
        // String output -> text type
        return { type: 'text', value: rawOutput };
    }

    if (rawOutput === null || rawOutput === undefined) {
        // Null/undefined -> empty text
        return { type: 'text', value: '' };
    }

    if (typeof rawOutput === 'object') {
        // Complex object -> json type
        return { type: 'json', value: rawOutput };
    }

    // Fallback for primitives -> convert to string
    return { type: 'text', value: String(rawOutput) };
}

const handleResponseChunk = (
    prev: ChatMessage[],
    chunk: string,
    messageType?: string,
    metadata?: ChatChunkMetadata
) => {
    const newMessages = [...prev];

    if (messageType === 'assistant') {
        // Handle assistant text messages
        const lastMessage = newMessages[newMessages.length - 1];

        if (
            lastMessage &&
            lastMessage.role === 'assistant' &&
            typeof lastMessage.content === 'string'
        ) {
            // Append to existing assistant message
            newMessages[newMessages.length - 1] = {
                ...lastMessage,
                content: lastMessage.content + chunk,
            };
        } else {
            // Create new assistant message
            newMessages.push({
                role: 'assistant',
                content: chunk,
                metadata: {
                    timestamp: Date.now(),
                    session_id: metadata?.session_id,
                },
            });
        }
    } else if (messageType === 'tool-call') {
        // Handle tool calls with dual-field schema for compatibility
        // - 'input' field required by AI SDK ToolCallPart type
        // - 'args' field expected by UI components (ChatInterface.tsx line 994)
        const toolCallPart = {
            type: 'tool-call' as const,
            toolCallId:
                metadata?.tool_id ??
                `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            toolName: metadata?.tool_name ?? 'unknown',
            input: metadata?.args ?? {}, // AI SDK compatibility
            args: metadata?.args ?? {}, // UI component compatibility
        };

        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
            // Convert content to array format and append tool call
            let newContent: Array<any>;
            if (typeof lastMessage.content === 'string') {
                newContent = [{ type: 'text', text: lastMessage.content }, toolCallPart];
            } else if (Array.isArray(lastMessage.content)) {
                newContent = [...lastMessage.content, toolCallPart];
            } else {
                newContent = [toolCallPart];
            }

            newMessages[newMessages.length - 1] = {
                ...lastMessage,
                content: newContent,
                metadata: {
                    ...lastMessage.metadata,
                    is_loading: true,
                    estimated_duration: 90,
                    start_time: Date.now(),
                    progress_percentage: 0,
                },
            };
        } else {
            // Create new assistant message with tool call
            newMessages.push({
                role: 'assistant',
                content: [toolCallPart],
                metadata: {
                    timestamp: Date.now(),
                    session_id: metadata?.session_id,
                    is_loading: true,
                    estimated_duration: 90,
                    start_time: Date.now(),
                    progress_percentage: 0,
                },
            });
        }
    } else if (messageType === 'tool-result') {
        // Add tool result message with full AI SDK LanguageModelV2ToolResultOutput compliance
        // The output should already be in the correct format from ChatController.normalizeToolResultOutput():
        // - {type: 'text', value: string}
        // - {type: 'json', value: JSONValue}
        // - {type: 'error-text', value: string}
        // - {type: 'error-json', value: JSONValue}
        // - {type: 'content', value: Array<TextPart | MediaPart>}

        // Ensure we have valid output - ChatController should always provide this
        if (!metadata?.output) {
            console.error('Tool result received without normalized output metadata');
            return prev; // Skip this invalid tool result
        }

        const toolResultPart: ToolResultPart = {
            type: 'tool-result' as const,
            toolCallId:
                metadata.tool_id ??
                `result-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            toolName: metadata.tool_name ?? 'unknown',
            output: metadata.output, // Type-safe: guaranteed to be LanguageModelV2ToolResultOutput
        };

        newMessages.push({
            role: 'tool',
            content: [toolResultPart],
            metadata: {
                timestamp: Date.now(),
                session_id: metadata?.session_id,
            },
        });
    }

    return newMessages;
};

const handleToolUpdate = (prev: ChatMessage[], toolId: string, args: any): ChatMessage[] => {
    const newMessages = [...prev];

    // Find and update the tool call with matching ID
    for (let i = newMessages.length - 1; i >= 0; i--) {
        const msg = newMessages[i];
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            const toolCallIndex = msg.content.findIndex(
                part => part.type === 'tool-call' && part.toolCallId === toolId
            );

            if (toolCallIndex !== -1) {
                const updatedContent = [...msg.content];
                updatedContent[toolCallIndex] = {
                    ...updatedContent[toolCallIndex],
                    args,
                } as any;

                newMessages[i] = {
                    ...msg,
                    content: updatedContent,
                };
                break;
            }
        }
    }

    return newMessages;
};

const handleToolResult = (prev: ChatMessage[], toolId: string): ChatMessage[] => {
    const newMessages = [...prev];

    // Find and complete tool loading
    for (let i = newMessages.length - 1; i >= 0; i--) {
        const msg = newMessages[i];
        if (msg.role === 'assistant' && Array.isArray(msg.content) && msg.metadata?.is_loading) {
            const hasMatchingToolCall = msg.content.some(
                part => part.type === 'tool-call' && part.toolCallId === toolId
            );

            if (hasMatchingToolCall) {
                newMessages[i] = {
                    ...msg,
                    metadata: {
                        ...msg.metadata,
                        is_loading: false,
                        progress_percentage: 100,
                        elapsed_time: msg.metadata.estimated_duration ?? 90,
                    },
                };
                break;
            }
        }
    }

    return newMessages;
};
const handleChatError = (prev: ChatMessage[], message: ChatMessage): ChatMessage[] => {
    return [
        ...prev,
        {
            ...message,
            role: 'assistant',
            content: `❌ **Error**: ${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`,
        },
    ];
};
