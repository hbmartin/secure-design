import { createRoot } from 'react-dom/client';
import ChatInterface from './components/Chat/ChatInterface';
import { WebviewProvider } from './contexts/WebviewContext';
import type { WebviewContext } from '../types/context';

// Import main App styles for panel layout
import App from './App';

const container = document.querySelector('#root');
if (container) {
    const root = createRoot(container);

    // Check if this is a canvas view (doesn't need context)
    const viewType = container.dataset.view;

    if (viewType === 'canvas') {
        // Canvas view - render App component directly (it will handle the canvas routing)
        root.render(<App />);
    } else {
        // Chat view - needs context
        const context: WebviewContext = (globalThis as any).__WEBVIEW_CONTEXT__;
        console.log('[index.tsx] context:', context);

        if (!context) {
            console.error('❌ No context provided for chat view');
            root.render(<div>Error: No context provided for chat view</div>);
        } else if (context.layout === 'panel') {
            // Use full App component for panel (includes header and styling)
            root.render(<App />);
        } else {
            // Use ChatInterface directly for sidebar (compact layout)
            root.render(
                <WebviewProvider>
                    <ChatInterface layout='sidebar' />
                </WebviewProvider>
            );
        }
    }
}
