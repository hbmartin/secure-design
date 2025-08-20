import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { renderHook, act, waitFor } from '@testing-library/react';
import * as sinon from 'sinon';
import { useChatTypeSafe } from '../../../webview/hooks/useChatTypeSafe';
import * as WebviewContext from '../../../webview/contexts/WebviewContext';
import type { ChatMessage } from '../../../types/chatMessage';

// Mock the WebviewContext
const mockWebviewApi = {
  api: {
    loadChatHistory: sinon.stub(),
    saveChatHistory: sinon.stub(),
    clearChatHistory: sinon.stub(),
    sendChatMessage: sinon.stub()
  },
  addListener: sinon.stub(),
  removeListener: sinon.stub(),
  isReady: true
};

describe('useChatTypeSafe', () => {
  let useWebviewApiStub: sinon.SinonStub;

  beforeEach(() => {
    // Mock the useWebviewApi hook
    useWebviewApiStub = sinon.stub(WebviewContext, 'useWebviewApi').returns(mockWebviewApi as any);
    
    // Reset all stubs
    mockWebviewApi.api.loadChatHistory.reset();
    mockWebviewApi.api.saveChatHistory.reset();
    mockWebviewApi.api.clearChatHistory.reset();
    mockWebviewApi.api.sendChatMessage.reset();
    mockWebviewApi.addListener.reset();
    mockWebviewApi.removeListener.reset();
    
    // Set up default stub behaviors
    mockWebviewApi.api.loadChatHistory.resolves([]);
    mockWebviewApi.api.saveChatHistory.resolves();
    mockWebviewApi.api.clearChatHistory.resolves();
    mockWebviewApi.api.sendChatMessage.resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('initialization', () => {
    it('should initialize with empty messages and ready state', () => {
      const { result } = renderHook(() => useChatTypeSafe());

      expect(result.current.messages).to.deep.equal([]);
      expect(result.current.isLoading).to.be.false;
      expect(result.current.isSaving).to.be.false;
      expect(result.current.isReady).to.be.true;
    });

    it('should load chat history on initialization when ready', async () => {
      const mockHistory: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];
      
      mockWebviewApi.api.loadChatHistory.resolves(mockHistory);

      const { result } = renderHook(() => useChatTypeSafe());

      await waitFor(() => {
        expect(mockWebviewApi.api.loadChatHistory.calledOnce).to.be.true;
        expect(result.current.messages).to.deep.equal(mockHistory);
      });
    });

    it('should not load history when not ready', () => {
      mockWebviewApi.isReady = false;
      useWebviewApiStub.returns({ ...mockWebviewApi, isReady: false });

      renderHook(() => useChatTypeSafe());

      expect(mockWebviewApi.api.loadChatHistory.called).to.be.false;
    });

    it('should handle history loading errors gracefully', async () => {
      const consoleSpy = sinon.spy(console, 'error');
      mockWebviewApi.api.loadChatHistory.rejects(new Error('Load failed'));

      const { result } = renderHook(() => useChatTypeSafe());

      await waitFor(() => {
        expect(consoleSpy.calledWith('Failed to load chat history:')).to.be.true;
        expect(result.current.messages).to.deep.equal([]);
      });

      consoleSpy.restore();
    });
  });

  describe('auto-save functionality', () => {
    it('should auto-save messages after delay', async () => {
      const clock = sinon.useFakeTimers();
      
      try {
        const { result } = renderHook(() => useChatTypeSafe());

        // Add a message
        act(() => {
          result.current.sendMessage('Hello');
        });

        // Wait for the message to be added
        await waitFor(() => {
          expect(result.current.messages).to.have.lengthOf(1);
        });

        // Fast forward 500ms (debounce delay)
        act(() => {
          clock.tick(500);
        });

        await waitFor(() => {
          expect(mockWebviewApi.api.saveChatHistory.calledOnce).to.be.true;
        });
      } finally {
        clock.restore();
      }
    });

    it('should not save when messages are empty', () => {
      const clock = sinon.useFakeTimers();
      
      try {
        renderHook(() => useChatTypeSafe());

        // Fast forward past debounce delay
        act(() => {
          clock.tick(1000);
        });

        expect(mockWebviewApi.api.saveChatHistory.called).to.be.false;
      } finally {
        clock.restore();
      }
    });

    it('should not save when not ready', () => {
      mockWebviewApi.isReady = false;
      useWebviewApiStub.returns({ ...mockWebviewApi, isReady: false });
      
      const clock = sinon.useFakeTimers();
      
      try {
        const { result } = renderHook(() => useChatTypeSafe());

        // Manually add a message to trigger save
        act(() => {
          result.current.messages.push({ role: 'user', content: 'Test' });
        });

        act(() => {
          clock.tick(1000);
        });

        expect(mockWebviewApi.api.saveChatHistory.called).to.be.false;
      } finally {
        clock.restore();
      }
    });

    it('should handle save errors gracefully', async () => {
      const clock = sinon.useFakeTimers();
      const consoleSpy = sinon.spy(console, 'error');
      
      mockWebviewApi.api.saveChatHistory.rejects(new Error('Save failed'));
      
      try {
        const { result } = renderHook(() => useChatTypeSafe());

        await act(async () => {
          await result.current.sendMessage('Hello');
        });

        act(() => {
          clock.tick(500);
        });

        await waitFor(() => {
          expect(consoleSpy.calledWith('Failed to save chat history:')).to.be.true;
        });

        consoleSpy.restore();
      } finally {
        clock.restore();
      }
    });
  });

  describe('sendMessage', () => {
    it('should add user message and call API', async () => {
      const { result } = renderHook(() => useChatTypeSafe());

      await act(async () => {
        await result.current.sendMessage('Hello world');
      });

      expect(result.current.messages).to.have.lengthOf(1);
      expect(result.current.messages[0]).to.include({
        role: 'user',
        content: 'Hello world'
      });
      
      expect(mockWebviewApi.api.sendChatMessage.calledOnce).to.be.true;
      const [message, history] = mockWebviewApi.api.sendChatMessage.firstCall.args;
      expect(message).to.equal('Hello world');
      expect(history).to.have.lengthOf(1);
    });

    it('should not send empty messages', async () => {
      const { result } = renderHook(() => useChatTypeSafe());

      await act(async () => {
        await result.current.sendMessage('   ');
      });

      expect(result.current.messages).to.have.lengthOf(0);
      expect(mockWebviewApi.api.sendChatMessage.called).to.be.false;
    });

    it('should not send when not ready', async () => {
      mockWebviewApi.isReady = false;
      useWebviewApiStub.returns({ ...mockWebviewApi, isReady: false });

      const { result } = renderHook(() => useChatTypeSafe());

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(mockWebviewApi.api.sendChatMessage.called).to.be.false;
    });

    it('should handle send errors', async () => {
      const consoleSpy = sinon.spy(console, 'error');
      mockWebviewApi.api.sendChatMessage.rejects(new Error('Send failed'));

      const { result } = renderHook(() => useChatTypeSafe());

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(consoleSpy.calledWith('Failed to send message:')).to.be.true;
      expect(result.current.isLoading).to.be.false;
      
      // Should add error message to chat
      expect(result.current.messages).to.have.lengthOf(2); // User message + error message
      expect(result.current.messages[1].content).to.include('Failed to send message');

      consoleSpy.restore();
    });
  });

  describe('clearHistory', () => {
    it('should clear messages and call API', async () => {
      const { result } = renderHook(() => useChatTypeSafe());

      // Add some messages first
      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(result.current.messages).to.have.lengthOf(1);

      // Clear history
      await act(async () => {
        await result.current.clearHistory();
      });

      expect(result.current.messages).to.have.lengthOf(0);
      expect(mockWebviewApi.api.clearChatHistory.calledOnce).to.be.true;
      expect(result.current.isLoading).to.be.false;
    });

    it('should not call API when not ready', async () => {
      mockWebviewApi.isReady = false;
      useWebviewApiStub.returns({ ...mockWebviewApi, isReady: false });

      const { result } = renderHook(() => useChatTypeSafe());

      await act(async () => {
        await result.current.clearHistory();
      });

      expect(mockWebviewApi.api.clearChatHistory.called).to.be.false;
    });

    it('should handle clear errors gracefully', async () => {
      const consoleSpy = sinon.spy(console, 'error');
      mockWebviewApi.api.clearChatHistory.rejects(new Error('Clear failed'));

      const { result } = renderHook(() => useChatTypeSafe());

      await act(async () => {
        await result.current.clearHistory();
      });

      expect(consoleSpy.calledWith('Failed to clear chat history:')).to.be.true;
      consoleSpy.restore();
    });
  });

  describe('event listeners', () => {
    it('should register event listeners on mount', () => {
      renderHook(() => useChatTypeSafe());

      // Should register multiple event listeners
      expect(mockWebviewApi.addListener.callCount).to.be.greaterThan(5);
      
      // Check for specific listeners
      const listenerCalls = mockWebviewApi.addListener.getCalls().map(call => call.args[0]);
      expect(listenerCalls).to.include('chatResponseChunk');
      expect(listenerCalls).to.include('chatStreamEnd');
      expect(listenerCalls).to.include('chatError');
      expect(listenerCalls).to.include('workspaceChanged');
    });

    it('should remove event listeners on unmount', () => {
      const { unmount } = renderHook(() => useChatTypeSafe());

      unmount();

      // Should remove all registered listeners
      expect(mockWebviewApi.removeListener.callCount).to.equal(mockWebviewApi.addListener.callCount);
    });

    it('should handle chatResponseChunk events', () => {
      const { result } = renderHook(() => useChatTypeSafe());

      // Get the registered handler for chatResponseChunk
      const addListenerCall = mockWebviewApi.addListener.getCalls()
        .find(call => call.args[0] === 'chatResponseChunk');
      const handler = addListenerCall?.args[1];

      expect(handler).to.be.a('function');

      // Simulate receiving a chunk
      act(() => {
        handler?.('Hello', 'assistant');
      });

      expect(result.current.messages).to.have.lengthOf(1);
      expect(result.current.messages[0]).to.include({
        role: 'assistant',
        content: 'Hello'
      });
    });

    it('should handle chatStreamEnd events', () => {
      const { result } = renderHook(() => useChatTypeSafe());

      // Start loading state
      act(() => {
        result.current.sendMessage('Test');
      });

      expect(result.current.isLoading).to.be.true;

      // Get the registered handler for chatStreamEnd
      const addListenerCall = mockWebviewApi.addListener.getCalls()
        .find(call => call.args[0] === 'chatStreamEnd');
      const handler = addListenerCall?.args[1];

      // Simulate stream end
      act(() => {
        handler?.();
      });

      expect(result.current.isLoading).to.be.false;
    });

    it('should handle chatError events', () => {
      const { result } = renderHook(() => useChatTypeSafe());

      // Get the registered handler for chatError
      const addListenerCall = mockWebviewApi.addListener.getCalls()
        .find(call => call.args[0] === 'chatError');
      const handler = addListenerCall?.args[1];

      // Simulate error
      act(() => {
        handler?.('Something went wrong');
      });

      expect(result.current.isLoading).to.be.false;
      expect(result.current.messages).to.have.lengthOf(1);
      expect(result.current.messages[0].content).to.include('Something went wrong');
      expect(result.current.messages[0].metadata?.is_error).to.be.true;
    });

    it('should handle workspaceChanged events', async () => {
      const mockNewHistory: ChatMessage[] = [
        { role: 'user', content: 'New workspace message' }
      ];
      
      mockWebviewApi.api.loadChatHistory.resolves(mockNewHistory);

      const { result } = renderHook(() => useChatTypeSafe());

      // Add initial message
      await act(async () => {
        await result.current.sendMessage('Old message');
      });

      expect(result.current.messages).to.have.lengthOf(1);

      // Get the registered handler for workspaceChanged
      const addListenerCall = mockWebviewApi.addListener.getCalls()
        .find(call => call.args[0] === 'workspaceChanged');
      const handler = addListenerCall?.args[1];

      // Simulate workspace change
      await act(async () => {
        await handler?.();
      });

      expect(result.current.messages).to.deep.equal(mockNewHistory);
    });
  });
});