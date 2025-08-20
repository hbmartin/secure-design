import { useState, useEffect, useCallback } from 'react';
import { useWebviewApi } from '../contexts/WebviewContext';
import type { ChatMessage } from '../../types/chatMessage';
import type { ToolResultPart } from 'ai';

/**
 * Type-safe chat hook using the new API contract
 * Provides a much simpler interface with automatic state management
 */
export interface ChatHookResult {
  messages: ChatMessage[];
  isLoading: boolean;
  isSaving: boolean;
  isReady: boolean;
  sendMessage: (message: string) => Promise<void>;
  clearHistory: () => Promise<void>;
}

export function useChatTypeSafe(): ChatHookResult {
  const { api, addListener, removeListener, isReady } = useWebviewApi();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Load initial chat history when webview becomes ready
   */
  useEffect(() => {
    if (!isReady) return;
    
    const loadHistory = async () => {
      try {
        const history = await api.loadChatHistory();
        setMessages(history);
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    };
    
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    loadHistory();
  }, [api, isReady]);

  /**
   * Auto-save messages with debounce when they change
   */
  useEffect(() => {
    if (!isReady || messages.length === 0) return;
    
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const saveTimer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await api.saveChatHistory(messages);
      } catch (error) {
        console.error('Failed to save chat history:', error);
      } finally {
        setIsSaving(false);
      }
    }, 500);
    
    return () => clearTimeout(saveTimer);
  }, [api, messages, isReady]);

  /**
   * Set up event listeners for chat updates
   */
  useEffect(() => {
    if (!isReady) return;

    const handleResponseChunk = (chunk: string, messageType?: string, metadata?: any) => {
      setMessages(prev => {
        const newMessages = [...prev];
        
        if (messageType === 'assistant') {
          // Handle assistant text messages
          const lastMessage = newMessages[newMessages.length - 1];
          
          if (lastMessage && lastMessage.role === 'assistant' && typeof lastMessage.content === 'string') {
            // Append to existing assistant message
            newMessages[newMessages.length - 1] = {
              ...lastMessage,
              content: lastMessage.content + chunk
            };
          } else {
            // Create new assistant message
            newMessages.push({
              role: 'assistant',
              content: chunk,
              metadata: {
                timestamp: Date.now(),
                session_id: metadata?.session_id
              }
            });
          }
        } else if (messageType === 'tool-call') {
          // Handle tool calls
          const toolCallPart = {
            type: 'tool-call' as const,
            toolCallId: metadata?.tool_id ?? 'unknown',
            toolName: metadata?.tool_name ?? 'unknown',
            input: metadata?.tool_input ?? {}
          };

          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage && lastMessage.role === 'assistant') {
            // Convert content to array format and append tool call
            let newContent;
            if (typeof lastMessage.content === 'string') {
              newContent = [
                { type: 'text', text: lastMessage.content },
                toolCallPart
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
                progress_percentage: 0
              }
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
                progress_percentage: 0
              }
            });
          }
        } else if (messageType === 'tool-result') {
          // Add tool result message  
          const toolResultPart: ToolResultPart = {
            type: 'tool-result' as const,
            toolCallId: metadata?.tool_id ?? 'unknown',
            toolName: metadata?.tool_name ?? 'unknown',
            output: {type: 'text' as const, value: chunk ?? ''},
          };

          newMessages.push({
            role: 'tool',
            content: [toolResultPart],
            metadata: {
              timestamp: Date.now(),
              session_id: metadata?.session_id
            }
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
                args
              } as any;

              newMessages[i] = {
                ...msg,
                content: updatedContent
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
          if (msg.role === 'assistant' && Array.isArray(msg.content) && msg.metadata?.is_loading) {
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
                  elapsed_time: msg.metadata.estimated_duration ?? 90
                }
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
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ **Error**: ${error}`,
        metadata: {
          timestamp: Date.now(),
          is_error: true,
          actions: actions ?? []
        }
      }]);
    };

    const handleChatStopped = () => {
      setIsLoading(false);
    };

    const handleWorkspaceChanged = () => {
      void (async () => {
        try {
          const history = await api.loadChatHistory();
          setMessages(history);
        } catch (error) {
          console.error('Failed to reload chat history after workspace change:', error);
          setMessages([]);
        }
      })();
    };

    const handleHistoryLoaded = (history: ChatMessage[]) => {
      setMessages(history);
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
    addListener('historyLoaded', handleHistoryLoaded);
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
      removeListener('historyLoaded', handleHistoryLoaded);
      removeListener('migrationComplete', handleMigrationComplete);
    };
  }, [api, addListener, removeListener, isReady]);

  /**
   * Send a chat message
   */
  const sendMessage = useCallback(async (text: string): Promise<void> => {
    if (!text.trim() || !isReady) {
      return;
    }
    
    const userMessage: ChatMessage = {
      role: 'user',
      content: text,
      metadata: {
        timestamp: Date.now()
      }
    };
    
    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    
    try {
      await api.sendChatMessage(text, newHistory);
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsLoading(false);
      
      // Add error message to chat
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ **Failed to send message**: ${error instanceof Error ? error.message : String(error)}`,
        metadata: {
          timestamp: Date.now(),
          is_error: true
        }
      }]);
    }
  }, [api, messages, isReady]);

  /**
   * Clear chat history
   */
  const clearHistory = useCallback(async (): Promise<void> => {
    console.log('🗑️ clearHistory called, isReady:', isReady);
    if (!isReady) {
      console.log('🗑️ clearHistory skipped - not ready');
      return;
    }
    
    try {
      console.log('🗑️ Clearing UI messages first...');
      setMessages([]);
      setIsLoading(false);
      
      console.log('🗑️ Calling API clearChatHistory...');
      await api.clearChatHistory();
      console.log('🗑️ API clearChatHistory completed');
    } catch (error) {
      console.error('Failed to clear chat history:', error);
    }
  }, [api, isReady]);

  return {
    messages,
    isLoading,
    isSaving,
    isReady,
    sendMessage,
    clearHistory
  };
}