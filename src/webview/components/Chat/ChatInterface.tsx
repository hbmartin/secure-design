import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ChatMessage, MessageAction } from '../../../types/chatMessage';
import { useFirstTimeUser } from '../../hooks/useFirstTimeUser';
import MarkdownRenderer from '../MarkdownRenderer';
import { TaskIcon, CheckIcon, LightBulbIcon } from '../Icons';
import Welcome from '../Welcome';
import ThemePreviewCard from './ThemePreviewCard';
import chatStyles from './ChatInterface.css';
import welcomeStyles from '../Welcome/Welcome.css';
import {
    ChatSidebarKey,
    type ChatSidebarActions,
    type ChatSidebarState,
} from '../../../types/chatSidebarTypes';
import type {
    TextPart,
    ImagePart,
    FilePart,
    ToolCallPart,
    ToolResultPart,
} from '@ai-sdk/provider-utils';
import { isToolCallPart, isToolResultPart } from '../../utils/chatUtils';
import {
    createDefaultRegistry,
    type ModelId,
    ModelSelect,
    type ProviderId,
    type ModelPickerTelemetry,
} from 'ai-sdk-react-model-picker';
import mpStyles from 'ai-sdk-react-model-picker/styles.css';
import {
    type StateReducer,
    useLogger,
    useVscodeState,
    useWebviewApi,
    type WebviewLayout,
} from 'react-vscode-webview-ipc/client';
import { ChatContextKey } from '../../context-keys';

interface ChatInterfaceProps {
    layout: WebviewLayout;
}

const postReducer: StateReducer<ChatSidebarState, ChatSidebarActions> = {
    getCssFileContent: function (
        prevState: ChatSidebarState,
        patch: { filePath: string; content?: string; error?: string }
    ): ChatSidebarState {
        return {
            ...prevState,
            css: {
                ...prevState.css,
                [patch.filePath]: {
                    filePath: patch.filePath,
                    content: patch.content,
                    error: patch.error,
                },
            },
        };
    },
    loadChats: function (prevState: ChatSidebarState, patch: ChatMessage[]): ChatSidebarState {
        return {
            ...prevState,
            messages: patch,
        };
    },
    clearChats: function (prevState: ChatSidebarState, _patch: void): ChatSidebarState {
        return {
            ...prevState,
            messages: [],
        };
    },
    sendChatMessage: function (prevState: ChatSidebarState, _: void): ChatSidebarState {
        return prevState;
    },
};

const ChatInterface: React.FC<ChatInterfaceProps> = ({ layout }) => {
    const { api, vscode } = useWebviewApi(ChatContextKey);
    const logger = useLogger('ChatInterface');
    const [state, actor] = useVscodeState<ChatSidebarState, ChatSidebarActions>(
        vscode,
        ChatSidebarKey,
        postReducer,
        {
            css: {},
            messages: undefined,
        } satisfies ChatSidebarState
    );

    const {
        isFirstTime,
        isLoading: isCheckingFirstTime,
        markAsReturningUser,
        resetFirstTimeUser,
    } = useFirstTimeUser();
    const [inputMessage, setInputMessage] = useState('');
    const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
    const [currentContext, setCurrentContext] = useState<{ fileName: string; type: string } | null>(
        null
    );
    const [showWelcome, setShowWelcome] = useState<boolean>(false);
    const storage = useRef({
        get: (key: string): PromiseLike<Record<string, string> | undefined> => api.get(key),
        set: (key: string, value: Record<string, string>) => api.set(key, value),
        remove: (key: string): PromiseLike<void> => api.remove(key),
    });

    // Drag and drop state
    const [uploadingImages, setUploadingImages] = useState<string[]>([]);
    const [pendingImages, setPendingImages] = useState<
        { fileName: string; originalName: string; fullPath: string }[]
    >([]);
    const timerIntervals = useRef<Record<string, NodeJS.Timeout>>({});

    const [chatHistory, hasConversationMessages, isChatHistoryLoading] = useMemo(
        () => [state.messages, (state.messages?.length ?? 0) > 0, state.messages === undefined],
        [state]
    );
    const providerRegistry = useRef(createDefaultRegistry());
    const msLogger = useLogger('ModelSelect');
    const modelSelectTelemetry = useMemo(() => {
        return {
            onFetchStart: (providerId: ProviderId) => msLogger.debug(`onFetchStart: ${providerId}`),
            onFetchSuccess: (providerId: ProviderId, modelCount: number) =>
                msLogger.debug(`onFetchSuccess: ${providerId}: ${modelCount}`),
            onFetchError: (providerId: ProviderId | undefined, error: Error) =>
                msLogger.error(`onFetchError: ${providerId}: ${error.message}`, { error }),
            onStorageError: (operation: 'read' | 'write', key: string, error: Error) =>
                msLogger.error(`onStorageError: ${key}: ${operation}: ${error.message}`, { error }),
            onUserModelAdded: (providerId: ProviderId, modelId: ModelId) =>
                msLogger.debug(`onUserModelAdded: ${providerId}: ${modelId}`),
            onProviderInitError: (provider: string, error: Error) =>
                msLogger.error(`onProviderInitError: ${provider}: ${error.message}`, { error }),
            onProviderNotFound: (providerId: ProviderId) =>
                msLogger.error(`onProviderNotFound: ${providerId}`),
            onProviderInvalidConfig: (providerId: ProviderId) =>
                msLogger.error(`onProviderInvalidConfig: ${providerId}`),
        } satisfies ModelPickerTelemetry;
    }, [msLogger]);

    const handleNewConversation = useCallback(async () => {
        // Clear UI state immediately for responsive UX
        setInputMessage('');
        setCurrentContext(null);
        setUploadingImages([]);
        setPendingImages([]);

        // Clear all timer intervals
        Object.values(timerIntervals.current).forEach(timer => clearInterval(timer));
        timerIntervals.current = {};

        markAsReturningUser();

        // Clear both UI and workspace state via the IPC action
        try {
            logger.debug('🗑️ Calling actor.clearChats...');
            await actor.clearChats();
            logger.debug('🗑️ actor.clearChats completed');
        } catch (error) {
            console.error('Failed to clear conversation:', error);
            void api.showErrorMessage('Failed to clear chat history');
        }
    }, [markAsReturningUser, api, logger, actor]);

    // Load initial chat history when component mounts
    useEffect(() => {
        actor.loadChats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        // Inject ChatInterface CSS styles
        const styleId = 'chat-interface-styles';
        let styleElement = document.getElementById(styleId) as HTMLStyleElement;

        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = styleId;
            styleElement.textContent = chatStyles;
            document.head.appendChild(styleElement);
        }

        // Inject Welcome CSS styles
        const welcomeStyleId = 'welcome-styles';
        let welcomeStyleElement = document.getElementById(welcomeStyleId) as HTMLStyleElement;

        if (!welcomeStyleElement) {
            welcomeStyleElement = document.createElement('style');
            welcomeStyleElement.id = welcomeStyleId;
            welcomeStyleElement.textContent = welcomeStyles;
            document.head.appendChild(welcomeStyleElement);
        }

        const mpStyleId = 'mp-styles';
        let mpStyleElement = document.getElementById(mpStyleId) as HTMLStyleElement;

        if (!mpStyleElement) {
            mpStyleElement = document.createElement('style');
            mpStyleElement.id = mpStyleId;
            mpStyleElement.textContent = mpStyles;
            document.head.appendChild(mpStyleElement);
        }

        // Listen for context messages and other events
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.command === 'contextFromCanvas') {
                // Handle context from canvas
                logger.debug('📄 Received context from canvas:', message.data);
                if (message.data.type === 'clear' || !message.data.fileName) {
                    setCurrentContext(null);
                    logger.debug('📄 Context cleared');
                } else {
                    setCurrentContext(message.data);
                    logger.debug('📄 Context set to:', message.data);
                }
            } else if (message.command === 'imageSavedToMoodboard') {
                // Handle successful image save with full path
                logger.debug('📎 Image saved with full path:', message.data);
                setPendingImages(prev => [
                    ...prev,
                    {
                        fileName: message.data.fileName,
                        originalName: message.data.originalName,
                        fullPath: message.data.fullPath,
                    },
                ]);
                // Remove from uploading state
                setUploadingImages(prev => prev.filter(name => name !== message.data.originalName));
            } else if (message.command === 'imageSaveError') {
                // Handle image save error
                console.error('📎 Image save error:', message.data);
                setUploadingImages(prev => prev.filter(name => name !== message.data.originalName));
            } else if (message.command === 'resetWelcome') {
                // Handle reset welcome command from command palette
                resetFirstTimeUser();
                setShowWelcome(true);
                logger.debug('👋 Welcome screen reset and shown');
            } else if (message.command === 'setChatPrompt') {
                // Handle prompt from canvas floating buttons
                logger.debug('📝 Received prompt from canvas:', message.data.prompt);
                setInputMessage(message.data.prompt);
            }
        };

        // Add message listener
        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
            // Clean up on unmount
            const existingStyle = document.getElementById(styleId);
            if (existingStyle) {
                document.head.removeChild(existingStyle);
            }
            const existingWelcomeStyle = document.getElementById(welcomeStyleId);
            if (existingWelcomeStyle) {
                document.head.removeChild(existingWelcomeStyle);
            }
            const existingMpStyle = document.getElementById(mpStyleId);
            if (existingMpStyle) {
                document.head.removeChild(existingMpStyle);
            }
        };
    }, [api, handleNewConversation, resetFirstTimeUser, logger]);

    // Handle first-time user welcome display
    useEffect(() => {
        if (!isCheckingFirstTime && isFirstTime && !hasConversationMessages) {
            setShowWelcome(true);
        }
    }, [isCheckingFirstTime, isFirstTime, chatHistory, hasConversationMessages]);

    const handleSendMessage = async () => {
        if (inputMessage.trim()) {
            let messageContent: string | Array<TextPart | ImagePart | FilePart>;
            logger.debug('handleSendMessage called:', {
                hasContext: !!currentContext,
                contextType: currentContext?.type,
                messageLength: inputMessage.length,
            });

            // Check if we have image context to include
            if (
                currentContext &&
                (currentContext.type === 'image' || currentContext.type === 'images')
            ) {
                try {
                    // Create structured content with text and images
                    const contentParts: Array<TextPart | ImagePart | FilePart> = [
                        {
                            type: 'text',
                            text: inputMessage,
                        },
                    ];

                    // Process image context
                    const imagePaths =
                        currentContext.type === 'images'
                            ? currentContext.fileName.split(', ')
                            : [currentContext.fileName];

                    // Convert each image to base64
                    for (const imagePath of imagePaths) {
                        try {
                            const base64Data = await api.getBase64Image(imagePath);

                            // Extract MIME type from base64 data URL
                            const mimeMatch = base64Data.match(/^data:([^;]+);base64,/);
                            const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
                            const base64Content = base64Data.replace(/^data:[^;]+;base64,/, '');

                            contentParts.push({
                                type: 'image',
                                image: base64Content,
                            });

                            logger.debug('📎 Added image to message:', { imagePath, mimeType });
                        } catch (error) {
                            console.error('Failed to load image:', imagePath, error);
                            // Add error note to text content instead
                            (contentParts[0] as TextPart).text +=
                                `\n\n[Note: Could not load image ${imagePath}: ${error}]`;
                        }
                    }

                    messageContent = contentParts;
                    logger.debug(`📤 Final structured message content: ${contentParts.length}`);
                } catch (error) {
                    console.error('Error processing images:', error);
                    // Fallback to text-only message with context info
                    messageContent =
                        currentContext.type === 'images'
                            ? `Context: Multiple images in moodboard\n\nMessage: ${inputMessage}`
                            : `Context: ${currentContext.fileName}\n\nMessage: ${inputMessage}`;
                }
            } else if (currentContext) {
                // Non-image context - use simple text format
                messageContent = `Context: ${currentContext.fileName}\n\nMessage: ${inputMessage}`;
                logger.debug('📤 Final message with non-image context:', { messageContent });
            } else {
                // No context - just the message text
                messageContent = inputMessage;
                logger.debug('📤 No context available, sending message as-is');
            }

            logger.debug(`Sending message with content type: ${typeof messageContent}`);
            actor.sendChatMessage(messageContent);
            setInputMessage('');
            logger.debug('Message sent, input cleared');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSendMessage();
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInputMessage(e.target.value);
        resizeTextarea(e.target);
    };

    const resizeTextarea = (textarea: HTMLTextAreaElement) => {
        // Auto-resize textarea
        textarea.style.height = 'auto'; // Reset height to calculate new height

        // Set height based on scroll height, with max height of 120px (about 6 lines)
        const maxHeight = 120;
        const newHeight = Math.min(textarea.scrollHeight, maxHeight);
        textarea.style.height = `${newHeight}px`;
    };

    // Reset textarea height when input is cleared (e.g., after sending message)
    useEffect(() => {
        if (!inputMessage.trim()) {
            const textarea = document.querySelector('.message-input') as HTMLTextAreaElement;
            if (textarea) {
                textarea.style.height = 'auto';
            }
        }
    }, [inputMessage]);

    const handleAddContext = () => {
        // TODO: Implement context addition functionality
        logger.debug('Add Context clicked');
    };

    const handleWelcomeGetStarted = async () => {
        logger.debug('Welcome Get Started clicked');
        setShowWelcome(false);
        markAsReturningUser();
        logger.debug('👋 User clicked Get Started, welcome dismissed');

        // Initialize Securedesign using the new API
        try {
            await api.initializeSecuredesign();
            logger.debug('🚀 Successfully initialized Securedesign');
        } catch (error) {
            console.error('Failed to initialize Securedesign:', error);
            void api.showErrorMessage('Failed to initialize SecureDesign');
        }
    };

    // Drag and drop handlers
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Check if dragged items contain files
        if (e.dataTransfer.types.includes('Files')) {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.dropEffect = 'copy';
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Essential: Must prevent default and set dropEffect for drop to work
        if (e.dataTransfer.types.includes('Files')) {
            e.dataTransfer.dropEffect = 'copy';
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (isChatHistoryLoading) {
            return;
        }

        const files = Array.from(e.dataTransfer.files);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));

        if (imageFiles.length === 0) {
            return;
        }

        // Process each image file
        for (const file of imageFiles) {
            try {
                await handleImageUpload(file);
            } catch (error) {
                console.error('Error processing dropped image:', error);
            }
        }
    };

    const handleImageUpload = useCallback(
        async (file: File): Promise<void> => {
            logger.debug('handleImageUpload called:', {
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
            });
            const maxSize = 10 * 1024 * 1024; // 10MB limit
            if (file.size > maxSize) {
                const displayName = file.name || 'clipboard image';
                console.error('Image too large:', displayName);
                void api.showErrorMessage(
                    `Image "${displayName}" is too large. Maximum size is 10MB.`
                );
                return;
            }

            // Create a unique filename - handle clipboard images without names
            const timestamp = Date.now();
            const originalName = file.name || `clipboard-image-${timestamp}`;
            const extension = file.type.split('/')[1] || 'png';
            const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
            const fileName = safeName.includes('.')
                ? `${timestamp}_${safeName}`
                : `${timestamp}_${safeName}.${extension}`;

            // Add to uploading state
            setUploadingImages(prev => [...prev, originalName]);

            // Convert to base64 for sending to extension
            try {
                const base64Data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
                    reader.readAsDataURL(file);
                });

                // Send to extension to save in moodboard
                logger.debug('Saving image to moodboard:', {
                    fileName,
                    originalName,
                });
                await api.saveImageToMoodboard({
                    fileName,
                    originalName,
                    base64Data,
                    mimeType: file.type,
                    size: file.size,
                });
                logger.debug(`📎 Image saved to moodboard: ${fileName}`);
            } catch (error) {
                console.error('Failed to process image:', error);
                void api.showErrorMessage(
                    `Failed to process image "${file.name}": ${error instanceof Error ? error.message : String(error)}`
                );
            } finally {
                // Remove from uploading state
                setUploadingImages(prev => prev.filter(name => name !== originalName));
            }
        },
        [api, setUploadingImages, logger]
    );

    // Auto-set context when images finish uploading
    useEffect(() => {
        logger.debug('Image upload state:', {
            uploadingCount: uploadingImages.length,
            pendingCount: pendingImages.length,
        });
        if (uploadingImages.length === 0 && pendingImages.length > 0) {
            if (pendingImages.length === 1) {
                // Single image - set as context with full path
                setCurrentContext({
                    fileName: pendingImages[0].fullPath,
                    type: 'image',
                });
            } else {
                // Multiple images - create a combined context with all full paths
                const fullPaths = pendingImages.map(img => img.fullPath).join(', ');
                setCurrentContext({
                    fileName: fullPaths,
                    type: 'images',
                });
            }
            // Clear pending images after setting context
            setPendingImages([]);
        }
    }, [uploadingImages.length, pendingImages.length, pendingImages, logger]);

    // Global drag & drop fallback for VS Code webview
    useEffect(() => {
        const handleGlobalDragOver = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer?.types.includes('Files')) {
                e.dataTransfer.dropEffect = 'copy';
            }
        };

        const handleGlobalDrop = async (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            logger.debug(`🎯 Global drop detected! ${e.dataTransfer?.files.length} files`);

            if (!e.dataTransfer?.files) {
                return;
            }

            const files = Array.from(e.dataTransfer.files);
            const imageFiles = files.filter(file => file.type.startsWith('image/'));

            if (imageFiles.length > 0 && !isChatHistoryLoading) {
                for (const file of imageFiles) {
                    try {
                        await handleImageUpload(file);
                    } catch (error) {
                        console.error('Error processing dropped image:', error);
                    }
                }
            }
        };

        const handleGlobalPaste = async (e: ClipboardEvent) => {
            // Only handle paste if we're focused on the chat and not loading
            if (isChatHistoryLoading || showWelcome) {
                return;
            }

            const clipboardItems = e.clipboardData?.items;
            if (!clipboardItems) {
                return;
            }

            logger.debug('📋 Paste detected, checking for images...');

            // Look for image items in clipboard
            const imageItems = Array.from(clipboardItems).filter(item =>
                item.type.startsWith('image/')
            );

            if (imageItems.length > 0) {
                e.preventDefault();
                logger.debug(`📋 Found ${imageItems.length} image(s) in clipboard`);

                for (const item of imageItems) {
                    const file = item.getAsFile();
                    if (file) {
                        try {
                            logger.debug('📋 Processing pasted image:', {
                                name: file.name || 'clipboard-image',
                                type: file.type,
                            });
                            await handleImageUpload(file);
                        } catch (error) {
                            console.error('Error processing pasted image:', error);
                            void api.showErrorMessage(
                                `Failed to process pasted image: ${error instanceof Error ? error.message : String(error)}`
                            );
                        }
                    }
                }
            }
        };

        // Create wrapper functions to handle async properly
        const dropWrapper = (e: DragEvent) => void handleGlobalDrop(e);
        const pasteWrapper = (e: ClipboardEvent) => void handleGlobalPaste(e);

        // Add global listeners
        document.addEventListener('dragover', handleGlobalDragOver);
        document.addEventListener('drop', dropWrapper);
        document.addEventListener('paste', pasteWrapper);

        return () => {
            document.removeEventListener('dragover', handleGlobalDragOver);
            document.removeEventListener('drop', dropWrapper);
            document.removeEventListener('paste', pasteWrapper);
        };
    }, [chatHistory, isChatHistoryLoading, handleImageUpload, showWelcome, api, logger]);

    const renderChatMessage = (msg: ChatMessage, index: number) => {
        // Helper function to extract text content from CoreMessage
        const getMessageText = (msg: ChatMessage): string => {
            if (typeof msg.content === 'string') {
                return msg.content;
            } else if (Array.isArray(msg.content)) {
                // Find text parts and concatenate them
                return msg.content
                    .filter((part: any) => part.type === 'text')
                    .map((part: any) => part.text)
                    .join('\n');
            }
            return '';
        };

        // Check if message has tool calls
        const hasToolCalls =
            Array.isArray(msg.content) &&
            msg.content.some((part: any) => part.type === 'tool-call');

        // Check if message has tool results
        const hasToolResults =
            Array.isArray(msg.content) &&
            msg.content.some((part: any) => part.type === 'tool-result');

        const isLastMessage = index === (chatHistory?.length ?? 0) - 1;
        const isLastUserMessage = msg.role === 'user' && isLastMessage;
        const isStreaming = (msg.role === 'assistant' || hasToolResults) && isLastMessage;
        const messageText = getMessageText(msg);

        // Handle tool call messages specially - but for mixed content, we need to show both text AND tools
        if (msg.role === 'assistant' && hasToolCalls) {
            // Check if there's also text content
            const hasTextContent = messageText.trim().length > 0;

            if (hasTextContent) {
                // Mixed content: show both text and tool calls
                return (
                    <div
                        key={index}
                        className={`chat-message chat-message--assistant chat-message--${layout} chat-message--mixed-content`}
                    >
                        {layout === 'panel' && (
                            <div className='chat-message__header'>
                                <span className='chat-message__label'>AI</span>
                                {msg.metadata && (
                                    <span className='chat-message__metadata'>
                                        {msg.metadata.start_time !== undefined &&
                                            msg.metadata.end_time !== undefined && (
                                                <span className='metadata-item'>
                                                    {msg.metadata.end_time -
                                                        msg.metadata.start_time}
                                                    ms
                                                </span>
                                            )}
                                        {msg.metadata.total_cost_usd && (
                                            <span className='metadata-item'>
                                                ${msg.metadata.total_cost_usd.toFixed(4)}
                                            </span>
                                        )}
                                    </span>
                                )}
                            </div>
                        )}
                        <div className='chat-message__content'>
                            <MarkdownRenderer content={messageText} />
                            {isStreaming && <span className='streaming-cursor'>▋</span>}
                        </div>
                        <div className='chat-message__tools'>{renderToolCalls(msg, index)}</div>
                    </div>
                );
            } else {
                // Only tool calls, no text content - use original tool-only rendering
                return renderToolCalls(msg, index);
            }
        }

        // Handle error messages with actions specially
        if (msg.role === 'assistant' && msg.metadata?.is_error === true) {
            return renderErrorMessage(msg, index);
        }

        // Determine message label and styling
        let messageLabel = '';
        let messageClass = '';

        switch (msg.role) {
            case 'user':
                messageLabel = 'You';
                messageClass = 'user';
                break;
            case 'assistant':
                messageLabel = 'AI';
                messageClass = 'assistant';
                break;
            case 'system':
                messageLabel = 'System';
                messageClass = 'system';
                break;
            case 'tool':
                messageLabel = 'Tool Result';
                messageClass = 'tool-result';
                break;
        }

        const hasToolCall = hasToolCalls || hasToolResults;

        return (
            <div
                key={index}
                className={`chat-message chat-message--${messageClass} chat-message--${layout} ${hasToolCall ? 'chat-message--tool-container' : ''}`}
            >
                {layout === 'panel' && (
                    <div className='chat-message__header'>
                        <span className='chat-message__label'>{messageLabel}</span>
                        {msg.metadata && (
                            <span className='chat-message__metadata'>
                                {msg.metadata.start_time !== undefined &&
                                    msg.metadata.end_time !== undefined && (
                                        <span className='metadata-item'>
                                            {msg.metadata.end_time - msg.metadata.start_time}ms
                                        </span>
                                    )}
                                {msg.metadata.total_cost_usd && (
                                    <span className='metadata-item'>
                                        ${msg.metadata.total_cost_usd.toFixed(4)}
                                    </span>
                                )}
                            </span>
                        )}
                    </div>
                )}
                <div className='chat-message__content'>
                    {msg.role === 'assistant' ? (
                        <MarkdownRenderer content={messageText} />
                    ) : (
                        (() => {
                            // Check if this is a user message with context
                            if (
                                messageText.startsWith('Context: ') &&
                                messageText.includes('\n\nMessage: ')
                            ) {
                                const contextMatch = messageText.match(
                                    /^Context: (.+)\n\nMessage: (.+)$/s
                                );
                                if (contextMatch) {
                                    const contextFile = contextMatch[1];
                                    const actualMessage = contextMatch[2];

                                    // Handle display for multiple images or single image
                                    let displayFileName;
                                    if (contextFile.includes(', ')) {
                                        // Multiple images - show count
                                        const paths = contextFile.split(', ');
                                        displayFileName = `${paths.length} images in moodboard`;
                                    } else {
                                        // Single image - show just filename
                                        displayFileName = contextFile.includes('.superdesign')
                                            ? (contextFile.split('.superdesign/')[1] ??
                                              contextFile.split('/').pop() ??
                                              contextFile)
                                            : (contextFile.split('/').pop() ?? contextFile);
                                    }

                                    return (
                                        <>
                                            <div className='message-context-display'>
                                                <span className='context-icon'>@</span>
                                                <span className='context-text'>
                                                    {displayFileName}
                                                </span>
                                            </div>
                                            <div className='message-text'>{actualMessage}</div>
                                        </>
                                    );
                                }
                            }
                            return messageText;
                        })()
                    )}
                    {isStreaming && <span className='streaming-cursor'>▋</span>}
                </div>
                {isLastUserMessage && (
                    <div className='generating-content'>
                        <span className='generating-text'>Generating</span>
                    </div>
                )}
            </div>
        );
    };

    // New function to handle multiple tool calls in a single message
    const renderToolCalls = (msg: ChatMessage, index: number) => {
        if (!Array.isArray(msg.content)) {
            return <div key={index}>Invalid tool message content</div>;
        }

        // Find ALL tool call parts
        const toolCallParts: ToolCallPart[] = msg.content.filter((part: any) =>
            isToolCallPart(part)
        );

        if (toolCallParts.length === 0) {
            return <div key={index}>No tool calls found</div>;
        }

        // Render each tool call separately
        return (
            <div key={index} className='tool-calls-container'>
                {toolCallParts.map((toolCallPart, subIndex) =>
                    renderSingleToolCall(toolCallPart, index, subIndex)
                )}
            </div>
        );
    };

    // Updated function to render a single tool call with unique subIndex for state management
    const renderSingleToolCall = (
        toolCallPart: ToolCallPart,
        messageIndex: number,
        subIndex: number
    ) => {
        try {
            const toolName = toolCallPart.toolName ?? 'Unknown Tool';
            const toolInput = toolCallPart.input as object;
            const uniqueKey = `${messageIndex}_${subIndex}`;
            const { toolCallId } = toolCallPart;

            const toolResultPart = (
                chatHistory?.find(
                    m =>
                        m.role === 'tool' &&
                        Array.isArray(m.content) &&
                        m.content
                            .filter(p => isToolResultPart(p))
                            .some(p => p.toolCallId === toolCallId)
                )?.content as ToolResultPart[]
            )?.find(p => p.toolCallId === toolCallId);

            const error: string | undefined =
                toolResultPart?.output.type === 'error-json'
                    ? JSON.stringify(toolResultPart?.output.value)
                    : toolResultPart?.output.type === 'error-text'
                      ? toolResultPart?.output.value
                      : undefined;

            // Special handling for generateTheme tool calls
            if (toolName === 'generateTheme') {
                // For generateTheme, check if we have a tool result to determine completion
                const hasResult = !!toolResultPart;

                // Extract theme data from tool input
                const themeName =
                    ('theme_name' in toolInput ? String(toolInput.theme_name) : undefined) ??
                    'Untitled Theme';
                const cssSheet =
                    ('cssSheet' in toolInput ? toolInput.cssSheet : undefined) ?? undefined;
                const cssFilePath =
                    'cssFilePath' in toolInput
                        ? toolInput.cssFilePath
                        : toolResultPart?.output?.type === 'json' &&
                            'cssFilePath' in (toolResultPart?.output?.value as object)
                          ? (toolResultPart?.output?.value as any)?.cssFilePath
                          : undefined;

                // Try to get CSS file path from metadata or result
                let isLoadingCss: boolean = true;
                if (
                    hasResult &&
                    error === undefined &&
                    cssFilePath !== undefined &&
                    !(cssFilePath in state.css)
                ) {
                    void actor.getCssFileContent(cssFilePath);
                } else {
                    isLoadingCss = false;
                }

                if (cssSheet !== undefined && typeof cssSheet !== 'string') {
                    throw new Error(
                        `Could not handle the type of cssSheet: ${typeof cssSheet} from ${JSON.stringify(toolCallPart)}`
                    );
                }
                if (cssFilePath !== undefined && typeof cssFilePath !== 'string') {
                    throw new Error(
                        `Could not handle the type of cssFilePath: ${typeof cssFilePath} from ${JSON.stringify(toolCallPart)}`
                    );
                }
                let cssContent: string | undefined = cssSheet;
                let cssLoadError: string | undefined = undefined;
                if (cssFilePath !== undefined && cssFilePath in state.css) {
                    if (state.css[cssFilePath].content !== undefined) {
                        cssContent = state.css[cssFilePath].content;
                    } else {
                        cssLoadError = state.css[cssFilePath].error;
                    }
                    isLoadingCss = false;
                }
                return (
                    <div
                        key={uniqueKey}
                        className={`theme-tool-message theme-tool-message--${layout}`}
                    >
                        <ThemePreviewCard
                            themeName={themeName}
                            currentCssContent={cssContent}
                            isLoadingCss={!hasResult || isLoadingCss}
                            cssLoadError={cssLoadError}
                        />
                        {error !== undefined && (
                            <div
                                className='theme-error-notice'
                                style={{
                                    margin: '0.5rem 0',
                                    padding: '0.75rem',
                                    backgroundColor: 'var(--destructive)',
                                    color: 'var(--destructive-foreground)',
                                    borderRadius: '0.375rem',
                                    fontSize: '0.875rem',
                                }}
                            >
                                ⚠️ Theme generation encountered an error: <br />
                                {error}
                            </div>
                        )}
                    </div>
                );
            }

            // Continue with existing generic tool rendering for other tools
            const isExpanded = expandedTools[uniqueKey] ?? false;

            const description: string =
                'description' in toolInput ? (toolInput.description as string) : '';
            const command: string = 'command' in toolInput ? (toolInput.command as string) : '';
            const prompt: string = 'prompt' in toolInput ? (toolInput.prompt as string) : '';

            const toolComplete = !!toolResultPart;

            const toolResult: string =
                toolResultPart !== undefined
                    ? toolResultPart.output.type === 'text' ||
                      toolResultPart.output.type === 'error-text'
                        ? toolResultPart.output.value
                        : JSON.stringify((toolResultPart.output as any).value, null, 2)
                    : '';

            // Get friendly tool name for display
            const getFriendlyToolName = (name: string): string => {
                const friendlyNames: { [key: string]: string } = {
                    'mcp_taskmaster-ai_parse_prd': 'Parsing Requirements Document',
                    'mcp_taskmaster-ai_analyze_project_complexity': 'Analyzing Project Complexity',
                    'mcp_taskmaster-ai_expand_task': 'Expanding Task',
                    'mcp_taskmaster-ai_expand_all': 'Expanding All Tasks',
                    'mcp_taskmaster-ai_research': 'Researching Information',
                    codebase_search: 'Searching Codebase',
                    read_file: 'Reading File',
                    edit_file: 'Editing File',
                    run_terminal_cmd: 'Running Command',
                };
                return (
                    friendlyNames[name] ||
                    name.replace(/mcp_|_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                );
            };

            const toggleExpanded = () => {
                setExpandedTools(prev => ({
                    ...prev,
                    [uniqueKey]: !prev[uniqueKey],
                }));
            };

            // Input truncation with safe handling
            const inputString: string = (() => {
                try {
                    return JSON.stringify(toolInput, null, 2);
                } catch (error) {
                    console.error(
                        '❌ Error: Failed to stringify tool input for tool:',
                        toolCallPart.toolName,
                        error
                    );
                    return '[Tool input serialization failed]';
                }
            })();

            return (
                <div
                    key={uniqueKey}
                    className={`tool-message tool-message--${layout} ${toolComplete ? 'tool-message--complete' : ''} ${!toolComplete ? 'tool-message--loading' : ''}`}
                >
                    <div className='tool-message__header' onClick={toggleExpanded}>
                        <div className='tool-message__main'>
                            <span className='tool-icon'>
                                {!toolComplete ? (
                                    <div className='loading-icon-simple'>
                                        <div className='loading-ring' />
                                    </div>
                                ) : (
                                    <TaskIcon />
                                )}
                            </span>
                            <div className='tool-info'>
                                <span className='tool-name'>{getFriendlyToolName(toolName)}</span>
                                {description && (
                                    <span className='tool-description'>{description}</span>
                                )}
                            </div>
                        </div>
                        <div className='tool-actions'>
                            {toolComplete && (
                                <span className='tool-status tool-status--complete'>
                                    <CheckIcon />
                                </span>
                            )}
                            <button className={`tool-expand-btn ${isExpanded ? 'expanded' : ''}`}>
                                <svg width='12' height='12' viewBox='0 0 16 16' fill='currentColor'>
                                    <path d='M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z' />
                                </svg>
                            </button>
                        </div>
                    </div>
                    {isExpanded && (
                        <div className='tool-message__details'>
                            {!toolComplete && (
                                <div className='tool-loading-tips'>
                                    <div className='loading-tip'>
                                        <span className='tip-icon'>
                                            <LightBulbIcon />
                                        </span>
                                        <span className='tip-text'>{toolName}</span>
                                    </div>
                                </div>
                            )}
                            {command && (
                                <div className='tool-detail'>
                                    <span className='tool-detail__label'>Command:</span>
                                    <code className='tool-detail__value'>{command}</code>
                                </div>
                            )}
                            {Object.keys(toolInput).length > 0 && (
                                <div className='tool-detail'>
                                    <span className='tool-detail__label'>Input:</span>
                                    <div className='tool-detail__value tool-detail__value--result'>
                                        <pre className='tool-result-content'>{inputString}</pre>
                                    </div>
                                </div>
                            )}
                            {prompt && (
                                <div className='tool-detail'>
                                    <span className='tool-detail__label'>Prompt:</span>
                                    <div className='tool-detail__value tool-detail__value--result'>
                                        <pre className='tool-result-content'>{prompt}</pre>
                                    </div>
                                </div>
                            )}
                            {toolComplete && (
                                <div className='tool-detail'>
                                    <span className='tool-detail__label'>
                                        {error !== undefined ? 'Error Result:' : 'Result:'}
                                    </span>
                                    <div
                                        className={`tool-detail__value tool-detail__value--result ${error !== undefined ? 'tool-detail__value--error' : ''}`}
                                    >
                                        <pre className='tool-result-content'>{toolResult}</pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return (
                <div
                    key={`${messageIndex}_${subIndex}`}
                    className={`tool-message tool-message--${layout} tool-message--error`}
                >
                    <div className='tool-message__header'>
                        <div className='tool-message__main'>
                            <span className='tool-icon'>⚠️</span>
                            <div className='tool-info'>
                                <span className='tool-name'>
                                    Error rendering tool: {toolCallPart.toolName ?? 'Unknown'}
                                </span>
                                <span className='tool-description'>{errorMessage}</span>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
    };

    const renderErrorMessage = (msg: ChatMessage, index: number) => {
        const handleActionClick = (action: { text: string; command: string; args?: string }) => {
            logger.debug('Action clicked:', action);
            logger.debug('Executing command:', {
                command: action.command,
                hasArgs: !!action.args,
            });
            void api.executeCommand(action.command, action.args);
        };

        // TODO: implement this
        const handleCloseError = () => {
            // Since we can't directly modify chat history anymore,
            // we'll just hide the error message visually
            // The error will be cleared on next chat interaction
            const errorElement = document.querySelector(
                `.chat-message--result-error:nth-child(${index + 1})`
            );
            if (errorElement) {
                (errorElement as HTMLElement).style.display = 'none';
            }
        };

        return (
            <div
                key={index}
                className={`chat-message chat-message--result-error chat-message--${layout}`}
            >
                {layout === 'panel' && (
                    <div className='chat-message__header'>
                        <span className='chat-message__label'>Error</span>
                        <button
                            className='error-close-btn'
                            onClick={handleCloseError}
                            title='Dismiss error'
                        >
                            ×
                        </button>
                    </div>
                )}
                <div className='chat-message__content'>
                    <div className='error-message-content'>
                        {typeof msg.content === 'string' ? msg.content : 'Error occurred'}
                    </div>
                    {msg.metadata?.actions !== undefined && msg.metadata.actions.length > 0 && (
                        <div className='error-actions'>
                            {msg.metadata.actions.map(
                                (action: MessageAction, actionIndex: number) => (
                                    <button
                                        key={actionIndex}
                                        onClick={() => handleActionClick(action)}
                                        className='error-action-btn'
                                    >
                                        {action.text}
                                    </button>
                                )
                            )}
                        </div>
                    )}
                    {layout === 'sidebar' && (
                        <button
                            className='error-close-btn error-close-btn--sidebar'
                            onClick={handleCloseError}
                            title='Dismiss error'
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const renderPlaceholder = () => (
        <div className={`chat-placeholder chat-placeholder--${layout}`}>
            <div className='chat-placeholder__content'>
                <div className='empty-state-message'>
                    <p>
                        <strong>Cursor/Windsurf/Claude Code rules already added</strong>, prompt
                        Cursor/Windsurf/Claude Code to design UI like{' '}
                        <kbd>Help me design a calculator UI</kbd> and preview the UI in SecureDesign
                        canvas by <kbd>Cmd+Shift+P</kbd>{' '}
                        <code>&apos;SecureDesign: Open canvas view&apos;</code>
                    </p>
                    <div className='empty-state-divider'>OR</div>
                    <p>Start now by prompting SecureDesign.</p>
                </div>
            </div>
        </div>
    );

    return (
        <div
            className={`chat-interface chat-interface--${layout}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={e => void handleDrop(e)}
        >
            {layout === 'panel' && (
                <header className='chat-header'>
                    <h2>💬 Chat with SecureDesign</h2>
                    <p>Ask anything about code, design, or development!</p>
                    <button
                        className='new-conversation-btn'
                        onClick={() => void handleNewConversation()}
                        title='Start a new conversation'
                        disabled={isChatHistoryLoading || !hasConversationMessages}
                    >
                        <svg width='16' height='16' viewBox='0 0 16 16' fill='currentColor'>
                            <path d='M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z' />
                        </svg>
                    </button>
                </header>
            )}

            <div className='chat-container'>
                <div className='chat-history'>
                    {showWelcome ? (
                        <Welcome onGetStarted={handleWelcomeGetStarted} />
                    ) : hasConversationMessages ? (
                        <>{chatHistory?.map(renderChatMessage)}</>
                    ) : (
                        renderPlaceholder()
                    )}
                </div>

                {!showWelcome && (
                    <div className='chat-input-wrapper'>
                        {/* Context Display */}
                        {currentContext ? (
                            <div className='context-display'>
                                <span className='context-icon'>
                                    {currentContext.type === 'image'
                                        ? '🖼️'
                                        : currentContext.type === 'images'
                                          ? '🖼️'
                                          : '📄'}
                                </span>
                                <span className='context-text'>
                                    {currentContext.type === 'image'
                                        ? 'Image: '
                                        : currentContext.type === 'images'
                                          ? 'Images: '
                                          : 'Context: '}
                                    {currentContext.type === 'images'
                                        ? `${currentContext.fileName.split(', ').length} images in moodboard`
                                        : currentContext.fileName.includes('.superdesign')
                                          ? (currentContext.fileName.split('.superdesign/')[1] ??
                                            currentContext.fileName.split('/').pop() ??
                                            currentContext.fileName)
                                          : (currentContext.fileName.split('/').pop() ??
                                            currentContext.fileName)}
                                </span>
                                <button
                                    className='context-clear-btn'
                                    onClick={() => setCurrentContext(null)}
                                    title='Clear context'
                                >
                                    ×
                                </button>
                            </div>
                        ) : null}

                        {/* Upload Progress */}
                        {uploadingImages.length > 0 && (
                            <div className='upload-progress'>
                                {uploadingImages.length > 1 && (
                                    <div className='upload-summary'>
                                        Uploading {uploadingImages.length} images...
                                    </div>
                                )}
                                {uploadingImages.map((fileName, index) => (
                                    <div key={index} className='uploading-item'>
                                        <span className='upload-icon'>📎</span>
                                        <span className='upload-text'>Uploading {fileName}...</span>
                                        <div className='upload-spinner' />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add Context Button */}
                        {!currentContext && uploadingImages.length === 0 && (
                            <button
                                className='add-context-btn'
                                onClick={handleAddContext}
                                disabled={isChatHistoryLoading}
                            >
                                <span className='add-context-icon'>@</span>
                                Add Context
                            </button>
                        )}

                        {/* Input Area */}
                        <div className='chat-input'>
                            <textarea
                                placeholder='Design a calculator UI...'
                                value={inputMessage}
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                                disabled={isChatHistoryLoading || showWelcome}
                                className='message-input'
                                rows={1}
                                style={{
                                    minHeight: '20px',
                                    maxHeight: '120px',
                                    resize: 'none',
                                    overflow:
                                        inputMessage.split('\n').length > 6 ? 'auto' : 'hidden',
                                }}
                            />
                        </div>

                        {/* Agent and Model Selectors with Actions */}
                        <div className='input-controls'>
                            <div className='selectors-group'>
                                <div className='selector-wrapper'>
                                    <ModelSelect
                                        storage={storage.current}
                                        providerRegistry={providerRegistry.current}
                                        telemetry={modelSelectTelemetry}
                                    />
                                </div>
                            </div>
                            <div className='input-actions'>
                                <button
                                    className='attach-btn'
                                    onClick={() => {
                                        // Create file input and trigger it
                                        const fileInput = document.createElement('input');
                                        fileInput.type = 'file';
                                        fileInput.accept = 'image/*';
                                        fileInput.multiple = true;
                                        fileInput.onchange = e => {
                                            void (async () => {
                                                const files = (e.target as HTMLInputElement).files;
                                                if (files) {
                                                    for (const file of Array.from(files)) {
                                                        try {
                                                            await handleImageUpload(file);
                                                        } catch (error) {
                                                            console.error(
                                                                'Error uploading image:',
                                                                error
                                                            );
                                                        }
                                                    }
                                                }
                                            })();
                                        };
                                        fileInput.click();
                                    }}
                                    disabled={isChatHistoryLoading || showWelcome}
                                    title='Attach images'
                                >
                                    <svg
                                        width='12'
                                        height='12'
                                        viewBox='0 0 16 16'
                                        fill='currentColor'
                                    >
                                        <path d='M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z' />
                                        <path d='M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-12zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1h12z' />
                                    </svg>
                                </button>
                                {/* Todo: this should detect whether streaming is ongoing */}
                                {isChatHistoryLoading ? (
                                    <button
                                        onClick={() => {
                                            // TODO: Add Stop functionality
                                            logger.debug('Stop requested');
                                        }}
                                        className='send-btn stop-btn'
                                        title='Stop response'
                                    >
                                        <svg
                                            width='14'
                                            height='14'
                                            viewBox='0 0 16 16'
                                            fill='currentColor'
                                        >
                                            <path d='M5.5 3.5A1.5 1.5 0 0 1 7 2h2a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 9 14H7a1.5 1.5 0 0 1-1.5-1.5v-9z' />
                                        </svg>
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => void handleSendMessage()}
                                        disabled={!inputMessage.trim() || showWelcome}
                                        className='send-btn'
                                        title='Send message'
                                    >
                                        <svg
                                            width='14'
                                            height='14'
                                            viewBox='0 0 16 16'
                                            fill='currentColor'
                                        >
                                            <path d='M8 12a.5.5 0 0 0 .5-.5V5.707l2.146 2.147a.5.5 0 0 0 .708-.708l-3-3a.5.5 0 0 0-.708 0l-3 3a.5.5 0 1 0 .708.708L7.5 5.707V11.5a.5.5 0 0 0 .5.5z' />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatInterface;
