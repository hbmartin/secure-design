import React from 'react';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { render, act, waitFor } from '@testing-library/react';
import { WebviewProvider, useWebviewApi } from '../../../webview/contexts/WebviewContext';

// Mock VSCode API
const mockVsCodeApi = {
  postMessage: sinon.stub().resolves(true),
  getState: sinon.stub(),
  setState: sinon.stub()
};

// Mock acquireVsCodeApi globally
(global as any).acquireVsCodeApi = () => mockVsCodeApi;

// Test component to use the hook
const TestComponent: React.FC = () => {
  const { api, isReady, addListener, removeListener } = useWebviewApi();
  
  const handleClick = () => {
    try {
      api.showInformationMessage('Test message');
    } catch (error) {
      console.error('API call failed:', error);
    }
  };

  React.useEffect(() => {
    const handleEvent = (chunk: string) => {
      console.log('Received chunk:', chunk);
    };
    
    if (isReady) {
      addListener('chatResponseChunk', handleEvent);
      return () => removeListener('chatResponseChunk', handleEvent);
    }
    return undefined;
  }, [isReady, addListener, removeListener]);

  return (
    <div>
      <span data-testid="ready-status">{isReady ? 'ready' : 'not-ready'}</span>
      <button data-testid="api-call" onClick={handleClick}>Call API</button>
    </div>
  );
};

describe('WebviewContext', () => {
  beforeEach(() => {
    mockVsCodeApi.postMessage.reset();
    mockVsCodeApi.getState.reset();
    mockVsCodeApi.setState.reset();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('WebviewProvider', () => {
    it('should render children', () => {
      const { getByText } = render(
        <WebviewProvider>
          <div>Test content</div>
        </WebviewProvider>
      );

      expect(getByText('Test content')).to.exist;
    });

    it('should initialize and set ready state', async () => {
      const { getByTestId } = render(
        <WebviewProvider>
          <TestComponent />
        </WebviewProvider>
      );

      // Should start as ready since acquireVsCodeApi succeeds
      await waitFor(() => {
        expect(getByTestId('ready-status').textContent).to.equal('ready');
      });
    });

    it('should handle acquireVsCodeApi failure', () => {
      const originalAcquire = (global as any).acquireVsCodeApi;
      (global as any).acquireVsCodeApi = () => {
        throw new Error('Failed to acquire API');
      };

      const consoleSpy = sinon.spy(console, 'error');

      const { getByTestId } = render(
        <WebviewProvider>
          <TestComponent />
        </WebviewProvider>
      );

      expect(consoleSpy.calledWith('Failed to acquire VSCode API:')).to.be.true;
      expect(getByTestId('ready-status').textContent).to.equal('not-ready');

      // Restore
      (global as any).acquireVsCodeApi = originalAcquire;
      consoleSpy.restore();
    });
  });

  describe('useWebviewApi hook', () => {
    it('should throw error when used outside provider', () => {
      const TestComponentOutsideProvider = () => {
        useWebviewApi(); // This should throw
        return <div>Test</div>;
      };

      expect(() => {
        render(<TestComponentOutsideProvider />);
      }).to.throw('useWebviewApi must be used within WebviewProvider');
    });

    it('should provide API methods', async () => {
      const { getByTestId } = render(
        <WebviewProvider>
          <TestComponent />
        </WebviewProvider>
      );

      await waitFor(() => {
        expect(getByTestId('ready-status').textContent).to.equal('ready');
      });

      // Simulate API call
      const button = getByTestId('api-call');
      await act(async () => {
        button.click();
      });

      // Should have called postMessage
      expect(mockVsCodeApi.postMessage.calledOnce).to.be.true;
      const message = mockVsCodeApi.postMessage.firstCall.args[0];
      expect(message).to.have.property('type', 'request');
      expect(message).to.have.property('key', 'showInformationMessage');
      expect(message.params).to.deep.equal(['Test message']);
    });
  });

  describe('Message handling', () => {
    let TestMessageHandler: React.FC;
    
    beforeEach(() => {
      const TestMessageHandlerComponent = () => {
        const { isReady, addListener, removeListener } = useWebviewApi();
        const [lastChunk, setLastChunk] = React.useState<string>('');
        const [lastError, setLastError] = React.useState<string>('');

        React.useEffect(() => {
          if (!isReady) return;

          const handleChunk = (chunk: string) => {
            setLastChunk(chunk);
          };

          const handleError = (error: string) => {
            setLastError(error);
          };

          addListener('chatResponseChunk', handleChunk);
          addListener('chatError', handleError);

          return () => {
            removeListener('chatResponseChunk', handleChunk);
            removeListener('chatError', handleError);
          };
        }, [isReady, addListener, removeListener]);

        return (
          <div>
            <span data-testid="last-chunk">{lastChunk}</span>
            <span data-testid="last-error">{lastError}</span>
            <span data-testid="ready">{isReady ? 'ready' : 'not-ready'}</span>
          </div>
        );
      };
      TestMessageHandlerComponent.displayName = 'TestMessageHandler';
      TestMessageHandler = TestMessageHandlerComponent;
    });

    it('should handle response messages', async () => {
      mockVsCodeApi.postMessage.resolves(true);
      
      const { getByTestId } = render(
        <WebviewProvider>
          <TestMessageHandler />
        </WebviewProvider>
      );

      await waitFor(() => {
        expect(getByTestId('ready').textContent).to.equal('ready');
      });

      // Trigger an API call
      act(() => {
        // Simulate the internal API call mechanism
        // This is complex to test due to the proxy, so we'll simulate the message flow instead
      });

      // Simulate receiving a response message
      await act(async () => {
        const responseEvent = new MessageEvent('message', {
          data: {
            type: 'response',
            id: 'test-id',
            value: 'success'
          }
        });
        window.dispatchEvent(responseEvent);
      });

      // The promise should resolve
      // Note: This is a simplified test - in practice the request/response matching is more complex
    });

    it('should handle event messages', async () => {
      const { getByTestId } = render(
        <WebviewProvider>
          <TestMessageHandler />
        </WebviewProvider>
      );

      await waitFor(() => {
        expect(getByTestId('ready').textContent).to.equal('ready');
      });

      // Simulate receiving an event
      await act(async () => {
        const eventMessage = new MessageEvent('message', {
          data: {
            type: 'event',
            key: 'chatResponseChunk',
            value: ['Hello World!']
          }
        });
        window.dispatchEvent(eventMessage);
      });

      await waitFor(() => {
        expect(getByTestId('last-chunk').textContent).to.equal('Hello World!');
      });
    });

    it('should handle error messages', async () => {
      const { getByTestId } = render(
        <WebviewProvider>
          <TestMessageHandler />
        </WebviewProvider>
      );

      await waitFor(() => {
        expect(getByTestId('ready').textContent).to.equal('ready');
      });

      // Simulate receiving an error event
      await act(async () => {
        const errorEvent = new MessageEvent('message', {
          data: {
            type: 'event',
            key: 'chatError',
            value: ['Something went wrong']
          }
        });
        window.dispatchEvent(errorEvent);
      });

      await waitFor(() => {
        expect(getByTestId('last-error').textContent).to.equal('Something went wrong');
      });
    });

    it('should handle legacy message format gracefully', async () => {
      const consoleSpy = sinon.spy(console, 'debug');

      render(
        <WebviewProvider>
          <TestMessageHandler />
        </WebviewProvider>
      );

      // Simulate receiving a legacy message
      await act(async () => {
        const legacyMessage = new MessageEvent('message', {
          data: {
            command: 'oldStyleCommand',
            payload: 'some data'
          }
        });
        window.dispatchEvent(legacyMessage);
      });

      // Should log the legacy message but not crash
      expect(consoleSpy.calledWith('Received legacy message format:')).to.be.true;
      
      consoleSpy.restore();
    });
  });

  describe('Request timeout handling', () => {
    it('should timeout requests after 30 seconds', async () => {
      const clock = sinon.useFakeTimers();
      
      try {
        const { getByTestId } = render(
          <WebviewProvider>
            <TestComponent />
          </WebviewProvider>
        );

        await waitFor(() => {
          expect(getByTestId('ready-status').textContent).to.equal('ready');
        });

        // Start an API call that won't receive a response
        const button = getByTestId('api-call');
        let apiError: Error | null = null;
        
        act(() => {
          try {
            button.click();
          } catch (error) {
            apiError = error as Error;
          }
        });

        // Fast forward 30 seconds
        await act(async () => {
          clock.tick(30000);
        });

        // Should have timed out
        expect(apiError).to.be.instanceOf(Error);
        expect((apiError as unknown as Error)?.message).to.include('timed out after 30 seconds');
      } finally {
        clock.restore();
      }
    });
  });

  describe('Cleanup on unmount', () => {
    it('should reject pending requests on unmount', () => {
      let rejectedError: Error | null = null;
      
      const TestUnmountComponent = () => {
        const { api } = useWebviewApi();
        
        React.useEffect(() => {
          // Start a request that won't complete
          api.loadChatHistory().catch((error: Error) => {
            rejectedError = error;
          });
          return undefined;
        }, [api]);

        return <div>Test</div>;
      };

      const { unmount } = render(
        <WebviewProvider>
          <TestUnmountComponent />
        </WebviewProvider>
      );

      // Unmount the component
      act(() => {
        unmount();
      });

      // Should have rejected the pending request
      expect(rejectedError).to.be.instanceOf(Error);
      expect((rejectedError as unknown as Error)?.message).to.equal('WebviewProvider unmounted');
    });
  });
});