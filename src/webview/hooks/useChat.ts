import { useState, useEffect } from 'react';
import { useWebviewApi } from '../contexts/WebviewContext';

/**
 * Type-safe chat hook using the new API contract
 * Provides a much simpler interface with automatic state management
 */
export interface ChatHookResult {
    isLoading: boolean;
    isReady: boolean;
}

export function useChat(): ChatHookResult {
    const { api, addListener, removeListener, isReady } = useWebviewApi();
    // const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
    const [isLoading, setIsLoading] = useState(false);

    /**
     * Chat history is now saved by ChatController when sending messages
     * Auto-save is handled at the controller level
     */

    /**
     * Set up event listeners for chat updates
     */
    useEffect(() => {
        if (!isReady) return;

        const handleStreamStart = () => {
            setIsLoading(true);
        };

        const handleStreamEnd = () => {
            setIsLoading(false);
        };

        const handleChatStopped = () => {
            setIsLoading(false);
        };

        // Register all event listeners
        addListener('chatStreamStart', handleStreamStart);
        addListener('chatStreamEnd', handleStreamEnd);
        addListener('chatStopped', handleChatStopped);

        // Cleanup function
        return () => {
            removeListener('chatStreamStart', handleStreamStart);
            removeListener('chatStreamEnd', handleStreamEnd);
            removeListener('chatStopped', handleChatStopped);
        };
    }, [api, addListener, removeListener, isReady]);

    return {
        isLoading,
        isReady,
    };
}
