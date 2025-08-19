import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChatMessage } from '../../types';
import { useDebouncedSave } from './useDebouncedSave';

// Re-export ChatMessage for backward compatibility
export type { ChatMessage };

export interface ChatHookResult {
    chatHistory: ChatMessage[];
    isLoading: boolean;
    sendMessage: (message: string) => void;
    clearHistory: () => void;
    setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export function useChat(vscode: any): ChatHookResult {
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [hasMigrated, setHasMigrated] = useState(false);
    const [hasLoadedInitialHistory, setHasLoadedInitialHistory] = useState(false);
    const isWebviewReady = useRef(false);

    // Debounced save hook handles the complex save logic
    const saveChatHistory = useCallback(
        (history: ChatMessage[]) => {
            return vscode.postMessage({
                command: 'saveChatHistory',
                chatHistory: history,
            });
        },
        [vscode]
    );

    const { isSaving, lastSavedRef } = useDebouncedSave(chatHistory, saveChatHistory, {
        delay: 500,
        isReady: isInitialized && isWebviewReady.current,
        hasLoadedInitialData: hasLoadedInitialHistory,
        isSaving: false, // No external saving state
    });

    // Mark webview as ready when it can receive messages
    useEffect(() => {
        // Small delay to ensure webview is fully initialized
        const timer = setTimeout(() => {
            isWebviewReady.current = true;
        }, 100);

        return () => clearTimeout(timer);
    }, []);

    // Handle migration from localStorage to workspace state on initialization
    useEffect(() => {
        if (!isInitialized && isWebviewReady.current) {
            // Check for old localStorage data
            let oldChatHistory: ChatMessage[] = [];
            try {
                const saved = localStorage.getItem('superdesign-chat-history');
                if (saved) {
                    oldChatHistory = JSON.parse(saved);
                    console.log('Found old chat history in localStorage, migrating...');
                }
            } catch (error) {
                console.warn('Failed to read old chat history from localStorage:', error);
            }

            // If we have old data, migrate it; otherwise just load workspace state
            if (oldChatHistory.length > 0 && !hasMigrated) {
                vscode.postMessage({
                    command: 'migrateLocalStorage',
                    oldChatHistory: oldChatHistory,
                });
                setHasMigrated(true);
            } else {
                vscode.postMessage({ command: 'loadChatHistory' });
            }

            setIsInitialized(true);
        }
    }, [vscode, isInitialized, hasMigrated]);

    const clearHistory = useCallback(() => {
        setChatHistory([]);
        // Update last saved reference to empty
        lastSavedRef.current = JSON.stringify([]);
        // Clear from VS Code workspace state
        vscode.postMessage({ command: 'clearWorkspaceChatHistory' });
        // Reset isLoading state on workspace change
        setIsLoading(false);
    }, [vscode, lastSavedRef]);

    const sendMessage = useCallback(
        (message: string) => {
            setIsLoading(true);

            // Add user message to history
            const userMessage: ChatMessage = {
                role: 'user',
                content: message,
                metadata: {
                    timestamp: Date.now(),
                },
            };

            setChatHistory(prev => [...prev, userMessage]);

            // Send to extension
            vscode.postMessage({
                command: 'chatMessage',
                message: message,
                chatHistory: [...chatHistory, userMessage],
            });
        },
        [chatHistory, vscode]
    );

    useEffect(() => {
        const messageHandler = (event: MessageEvent) => {
            const message = event.data;

            switch (message.command) {
                case 'chatResponseChunk':
                    setChatHistory(prev => {
                        const newHistory = [...prev];

                        if (message.messageType === 'assistant') {
                            // Handle assistant text messages
                            const lastMessage = newHistory[newHistory.length - 1];

                            if (
                                lastMessage &&
                                lastMessage.role === 'assistant' &&
                                typeof lastMessage.content === 'string'
                            ) {
                                // Append to existing assistant message
                                newHistory[newHistory.length - 1] = {
                                    ...lastMessage,
                                    content: lastMessage.content + message.content,
                                };
                            } else {
                                // Create new assistant message
                                newHistory.push({
                                    role: 'assistant',
                                    content: message.content,
                                    metadata: {
                                        timestamp: Date.now(),
                                        session_id: message.metadata?.session_id,
                                    },
                                });
                            }
                        } else if (message.messageType === 'tool-call') {
                            // Handle tool calls - append to existing assistant message
                            const toolCallPart = {
                                type: 'tool-call' as const,
                                toolCallId: message.metadata?.tool_id ?? 'unknown',
                                toolName: message.metadata?.tool_name ?? 'unknown',
                                input: message.metadata?.tool_input ?? {},
                            };

                            // Find the last assistant message and append tool call to it
                            const lastMessage = newHistory[newHistory.length - 1];
                            const lastIndex = newHistory.length - 1;

                            if (lastMessage && lastMessage.role === 'assistant') {
                                // Convert content to array format and append tool call
                                let newContent;
                                if (typeof lastMessage.content === 'string') {
                                    // Convert string to array with text part + tool call part
                                    newContent = [
                                        { type: 'text', text: lastMessage.content },
                                        toolCallPart,
                                    ];
                                } else if (Array.isArray(lastMessage.content)) {
                                    // Append to existing array
                                    newContent = [...lastMessage.content, toolCallPart];
                                } else {
                                    // Fallback: create new array
                                    newContent = [toolCallPart];
                                }

                                newHistory[lastIndex] = {
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
                                // No assistant message to append to, create new one
                                newHistory.push({
                                    role: 'assistant',
                                    content: [toolCallPart],
                                    metadata: {
                                        timestamp: Date.now(),
                                        session_id: message.metadata?.session_id,
                                        is_loading: true,
                                        estimated_duration: 90,
                                        start_time: Date.now(),
                                        progress_percentage: 0,
                                    },
                                });
                            }
                        } else if (message.messageType === 'tool-result') {
                            // Add separate tool result message (correct CoreMessage structure)
                            const toolResultPart = {
                                type: 'tool-result' as const,
                                toolCallId: message.metadata?.tool_id ?? 'unknown',
                                toolName: message.metadata?.tool_name ?? 'unknown',
                                output: message.content ?? '',
                            };

                            newHistory.push({
                                role: 'tool',
                                content: [toolResultPart],
                                metadata: {
                                    timestamp: Date.now(),
                                    session_id: message.metadata?.session_id,
                                },
                            });
                        }

                        return newHistory;
                    });
                    break;

                case 'chatToolUpdate':
                    // Update tool parameters during streaming
                    setChatHistory(prev => {
                        const newHistory = [...prev];

                        // Find the most recent tool call message with matching ID
                        for (let i = newHistory.length - 1; i >= 0; i--) {
                            const msg = newHistory[i];
                            if (msg.role === 'assistant' && Array.isArray(msg.content)) {
                                const toolCallIndex = msg.content.findIndex(
                                    part =>
                                        part.type === 'tool-call' &&
                                        (part as any).toolCallId === message.tool_use_id
                                );

                                if (toolCallIndex !== -1) {
                                    // Update the tool call args
                                    const updatedContent = [...msg.content];
                                    updatedContent[toolCallIndex] = {
                                        ...updatedContent[toolCallIndex],
                                        args: message.tool_input,
                                    } as any;

                                    newHistory[i] = {
                                        ...msg,
                                        content: updatedContent,
                                    };
                                    break;
                                }
                            }
                        }

                        return newHistory;
                    });
                    break;

                case 'chatToolResult':
                    // Complete tool loading state
                    console.log('Received tool result for:', message.tool_use_id);
                    setChatHistory(prev => {
                        const newHistory = [...prev];

                        // Find and complete tool loading
                        for (let i = newHistory.length - 1; i >= 0; i--) {
                            const msg = newHistory[i];
                            if (
                                msg.role === 'assistant' &&
                                Array.isArray(msg.content) &&
                                msg.metadata?.is_loading
                            ) {
                                const hasMatchingToolCall = msg.content.some(
                                    part =>
                                        part.type === 'tool-call' &&
                                        (part as any).toolCallId === message.tool_use_id
                                );

                                if (hasMatchingToolCall) {
                                    newHistory[i] = {
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

                        return newHistory;
                    });
                    break;

                case 'chatStreamEnd':
                    console.log('Chat stream ended');
                    setIsLoading(false);
                    break;

                case 'chatErrorWithActions':
                    // Handle API key and authentication errors with action buttons
                    console.log('Chat error with actions:', message.error);
                    setIsLoading(false);

                    const errorMessage: ChatMessage = {
                        role: 'assistant',
                        content: `❌ **${message.error}**\n\nPlease configure your API key to use this AI model.`,
                        metadata: {
                            timestamp: Date.now(),
                            is_error: true,
                            actions: message.actions ?? [],
                        },
                    };

                    setChatHistory(prev => [...prev, errorMessage]);
                    break;

                case 'chatError':
                    // Handle general errors
                    console.log('Chat error:', message.error);
                    setIsLoading(false);

                    const generalErrorMessage: ChatMessage = {
                        role: 'assistant',
                        content: `❌ **Error**: ${message.error}`,
                        metadata: {
                            timestamp: Date.now(),
                            is_error: true,
                        },
                    };

                    setChatHistory(prev => [...prev, generalErrorMessage]);
                    break;

                case 'chatStopped':
                    console.log('Chat was stopped');
                    setIsLoading(false);
                    break;

                case 'chatHistoryLoaded':
                    console.log('Chat history loaded from workspace state');
                    // Only update if not currently saving to avoid overwriting pending changes
                    if (!isSaving) {
                        const loadedHistory = message.chatHistory ?? [];
                        setChatHistory(loadedHistory);

                        // Mark that we've loaded initial history
                        setHasLoadedInitialHistory(true);

                        // Update the last saved reference to prevent immediate re-save
                        lastSavedRef.current = JSON.stringify(loadedHistory);
                    }
                    break;

                case 'chatHistoryCleared':
                    console.log('Chat history cleared');
                    setChatHistory([]);
                    // Update last saved reference to empty
                    lastSavedRef.current = JSON.stringify([]);
                    break;

                case 'workspaceChanged':
                    console.log('Workspace changed, reloading chat history');
                    // Note: useDebouncedSave hook handles cleanup automatically
                    // Reset the loaded flag so we don't save until new history loads
                    setHasLoadedInitialHistory(false);
                    // Clear last saved reference
                    lastSavedRef.current = '';
                    // Request fresh chat history for new workspace
                    vscode.postMessage({ command: 'loadChatHistory' });
                    break;

                case 'migrationComplete':
                    console.log('Migration complete, received chat history');
                    const migratedHistory = message.chatHistory ?? [];
                    setChatHistory(migratedHistory);

                    // Mark that we've loaded initial history
                    setHasLoadedInitialHistory(true);

                    // Update the last saved reference to prevent immediate re-save
                    lastSavedRef.current = JSON.stringify(migratedHistory);

                    // Clear localStorage after successful migration
                    try {
                        localStorage.removeItem('superdesign-chat-history');
                        console.log('Cleared old localStorage data');
                    } catch (error) {
                        console.warn('Failed to clear localStorage:', error);
                    }
                    break;

                default:
                    break;
            }
        };

        window.addEventListener('message', messageHandler);
        return () => window.removeEventListener('message', messageHandler);
    }, [vscode]);

    return {
        chatHistory,
        isLoading,
        sendMessage,
        clearHistory,
        setChatHistory,
    };
}
