import React, { useState, useEffect } from 'react';
import ChatInterface from './components/Chat/ChatInterface';
import CanvasView from './components/CanvasView';
import { WebviewProvider } from 'react-vscode-webview-ipc/client';

// Import CSS as string for esbuild
import styles from './App.css';
import { CanvasContextKey, ChatContextKey } from './context-keys';

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<'chat' | 'canvas'>('chat');
    const [nonce, setNonce] = useState<string | null>(null);

    useEffect(() => {
        // Detect which view to render based on data-view attribute
        const rootElement = document.getElementById('root');

        const viewType = rootElement?.getAttribute('data-view');
        const nonceValue = rootElement?.getAttribute('data-nonce');

        if (nonceValue) {
            setNonce(nonceValue);
        }

        if (viewType === 'canvas') {
            setCurrentView('canvas');
            console.log('🎨 Switching to canvas view');
        } else {
            setCurrentView('chat');
            console.log('💬 Switching to chat view');
        }

        // Inject CSS styles
        const styleElement = document.createElement('style');
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
        console.log('🎨 CSS styles injected');

        return () => {
            document.head.removeChild(styleElement);
        };
    }, []);

    console.log(`[APP] currentView: ${currentView}`);
    const webviewContext = (window as any).__WEBVIEW_CONTEXT__;
    console.log(`[APP] webviewContext: ${webviewContext}`);

    const renderView = () => {
        switch (currentView) {
            case 'canvas':
                try {
                    // Canvas view doesn't need context - it gets data from extension directly
                    return (
                        <WebviewProvider viewType='App.tsx:canvas' contextKey={CanvasContextKey}>
                            <CanvasView nonce={nonce} />
                        </WebviewProvider>
                    );
                } catch (error) {
                    console.error('❌ Error rendering CanvasView:', error);
                    return <div>Error rendering canvas: {String(error)}</div>;
                }
            case 'chat':
            default:
                return (
                    <WebviewProvider viewType='App.tsx:chat' contextKey={ChatContextKey}>
                        <ChatInterface layout={webviewContext.layout ?? 'sidebar'} />
                    </WebviewProvider>
                );
        }
    };
    const layout = webviewContext?.layout ?? (currentView === 'canvas' ? 'panel' : 'sidebar');
    return <div className={`superdesign-app ${currentView}-view ${layout}`}>{renderView()}</div>;
};

export default App;
