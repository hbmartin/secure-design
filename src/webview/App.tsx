import React, { useState, useEffect } from 'react';
import ChatInterface from './components/Chat/ChatInterface';
import CanvasView from './components/CanvasView';
import { WebviewProvider } from './contexts/WebviewContext';
import type { WebviewContext } from '../types/context';

// Import CSS as string for esbuild
import styles from './App.css';

const App: React.FC = () => {
    const [context, setContext] = useState<WebviewContext | null>(null);
    const [currentView, setCurrentView] = useState<'chat' | 'canvas'>('chat');
    const [nonce, setNonce] = useState<string | null>(null);

    useEffect(() => {
        // Detect which view to render based on data-view attribute
        const rootElement = document.querySelector('#root');

        const viewType = rootElement?.getAttribute('data-view');
        const nonceValue = rootElement?.getAttribute('data-nonce');

        if (nonceValue) {
            setNonce(nonceValue);
        }

        if (viewType === 'canvas') {
            setCurrentView('canvas');
        } else {
            setCurrentView('chat');
        }

        // Inject CSS styles
        const styleElement = document.createElement('style');
        styleElement.textContent = styles;
        document.head.append(styleElement);

        // Get context from window (only needed for chat interface)
        const webviewContext = (globalThis as any).__WEBVIEW_CONTEXT__;
        console.log('🌐 Webview context from window:', webviewContext);

        if (webviewContext) {
            setContext(webviewContext);
            console.log('✅ Context set:', webviewContext);
        } else {
            console.log('⚠️ No webview context found in window');
        }

        return () => {
            styleElement.remove();
        };
    }, []);

    console.log(`[APP] currentView: ${currentView}`);

    const renderView = () => {
        switch (currentView) {
            case 'canvas': {
                try {
                    // Canvas view doesn't need context - it gets data from extension directly
                    return (
                        <WebviewProvider>
                            <CanvasView nonce={nonce} />
                        </WebviewProvider>
                    );
                } catch (error) {
                    console.error('❌ Error rendering CanvasView:', error);
                    return <div>Error rendering canvas: {String(error)}</div>;
                }
            }
            case 'chat':
            default: {
                console.log('💬 Rendering ChatInterface, context:', !!context);
                // Chat interface needs context
                if (!context) {
                    console.log('⏳ Context not ready, showing loading...');
                    return <div>Loading...</div>;
                }
                try {
                    return (
                        <WebviewProvider>
                            <ChatInterface layout={context.layout} />
                        </WebviewProvider>
                    );
                } catch (error) {
                    console.error('❌ Error rendering ChatInterface:', error);
                    return <div>Error rendering chat: {String(error)}</div>;
                }
            }
        }
    };

    return (
        <div
            className={`superdesign-app ${currentView}-view ${context?.layout ? `${context.layout}-layout` : ''}`}
        >
            {renderView()}
        </div>
    );
};

export default App;
