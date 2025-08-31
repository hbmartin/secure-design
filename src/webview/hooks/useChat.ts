import { useState, useEffect, useCallback } from 'react';
import { useWebviewApi } from '../contexts/WebviewContext';
import type { ChatMessage } from '../../types/chatMessage';
import type { ToolResultPart } from 'ai';
import type { ChatChunkMetadata } from '../../api/viewApi';

/**
 * Type-safe chat hook using the new API contract
 * Provides a much simpler interface with automatic state management
 */
export interface ChatHookResult {
    messages: ChatMessage[];
    isLoading: boolean;
    isReady: boolean;
    sendMessage: (message: string) => Promise<void>;
}

export function useChat(initialMessages?: ChatMessage[]): ChatHookResult {
    const { api, addListener, removeListener, isReady } = useWebviewApi();
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
    const [isLoading, setIsLoading] = useState(false);

    /**
     * Update messages when initialMessages prop changes
     */
    useEffect(() => {
        console.log('[useChat] loading initial messages', initialMessages);
        if (initialMessages) {
            setMessages(initialMessages);
        }
    }, [initialMessages]);

    /**
     * Chat history is now saved by ChatController when sending messages
     * Auto-save is handled at the controller level
     */

    /**
     * Set up event listeners for chat updates
     */
    useEffect(() => {
        if (!isReady) return;

        const handleResponseChunk = (
            chunk: string,
            messageType?: string,
            metadata?: ChatChunkMetadata
        ) => {
            setMessages(prev => {
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
                        let newContent;
                        if (typeof lastMessage.content === 'string') {
                            newContent = [
                                { type: 'text', text: lastMessage.content },
                                toolCallPart,
                            ];
                        } else if (Array.isArray(lastMessage.content)) {
                            newContent = [...lastMessage.content, toolCallPart];
                        } else {
                            newContent = [toolCallPart];
                        }

                        newMessages[newMessages.length - 1] = {
                            ...lastMessage,
                            content: newContent as any,
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
            });
        };

        const handleToolUpdate = (toolId: string, args: any) => {
            setMessages(prev => {
                const newMessages = [...prev];

                // Find and update the tool call with matching ID
                for (let i = newMessages.length - 1; i >= 0; i--) {
                    const msg = newMessages[i];
                    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
                        const toolCallIndex = msg.content.findIndex(
                            part => part.type === 'tool-call' && (part as any).toolCallId === toolId
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
            });
        };

        const handleToolResult = (toolId: string) => {
            setMessages(prev => {
                const newMessages = [...prev];

                // Find and complete tool loading
                for (let i = newMessages.length - 1; i >= 0; i--) {
                    const msg = newMessages[i];
                    if (
                        msg.role === 'assistant' &&
                        Array.isArray(msg.content) &&
                        msg.metadata?.is_loading
                    ) {
                        const hasMatchingToolCall = msg.content.some(
                            part => part.type === 'tool-call' && (part as any).toolCallId === toolId
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
            });
        };

        const handleStreamStart = () => {
            setIsLoading(true);
        };

        const handleStreamEnd = () => {
            setIsLoading(false);
        };

        const handleChatError = (error: string, actions?: any[]) => {
            setIsLoading(false);
            setMessages(prev => [
                ...prev,
                {
                    role: 'assistant',
                    content: `❌ **Error**: ${error}`,
                    metadata: {
                        timestamp: Date.now(),
                        is_error: true,
                        actions: actions ?? [],
                    },
                },
            ]);
        };

        const handleChatStopped = () => {
            setIsLoading(false);
        };

        const handleWorkspaceChanged = () => {
            // Chat history will be updated via repository subscription
            // Just clear the current messages for now
            setMessages([]);
        };

        const handleMigrationComplete = (history: ChatMessage[]) => {
            setMessages(history);
        };

        // Register all event listeners
        addListener('chatStreamStart', handleStreamStart);
        addListener('chatResponseChunk', handleResponseChunk);
        addListener('chatToolUpdate', handleToolUpdate);
        addListener('chatToolResult', handleToolResult);
        addListener('chatStreamEnd', handleStreamEnd);
        addListener('chatError', handleChatError);
        addListener('chatStopped', handleChatStopped);
        addListener('workspaceChanged', handleWorkspaceChanged);
        addListener('migrationComplete', handleMigrationComplete);

        // Cleanup function
        return () => {
            removeListener('chatStreamStart', handleStreamStart);
            removeListener('chatResponseChunk', handleResponseChunk);
            removeListener('chatToolUpdate', handleToolUpdate);
            removeListener('chatToolResult', handleToolResult);
            removeListener('chatStreamEnd', handleStreamEnd);
            removeListener('chatError', handleChatError);
            removeListener('chatStopped', handleChatStopped);
            removeListener('workspaceChanged', handleWorkspaceChanged);
            removeListener('migrationComplete', handleMigrationComplete);
        };
    }, [api, addListener, removeListener, isReady]);

    /**
     * Send a chat message
     */
    const sendMessage = useCallback(
        async (text: string): Promise<void> => {
            if (!text.trim() || !isReady) {
                return;
            }

            const userMessage: ChatMessage = {
                role: 'user',
                content: text,
                metadata: {
                    timestamp: Date.now(),
                },
            };

            const newHistory = [...messages, userMessage];
            setMessages(newHistory);

            try {
                await api.sendChatMessage(text, newHistory);
            } catch (error) {
                console.error('Failed to send message:', error);
                setIsLoading(false);

                // Add error message to chat
                setMessages(prev => [
                    ...prev,
                    {
                        role: 'assistant',
                        content: `❌ **Failed to send message**: ${error instanceof Error ? error.message : String(error)}`,
                        metadata: {
                            timestamp: Date.now(),
                            is_error: true,
                        },
                    },
                ]);
            }
        },
        [api, messages, isReady]
    );

    return {
        messages,
        isLoading,
        isReady,
        sendMessage,
    };
}
