import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { WebviewApiProvider } from '../../providers/WebviewApiProvider';
import { WorkspaceStateService } from '../../services/workspaceStateService';
import { ProviderService } from '../../providers/ProviderService';
import { Logger } from '../../services/logger';
import * as VsCodeConfiguration from '../../providers/VsCodeConfiguration';
// AgentService import removed since ChatController now handles agent operations
import type { ChatMessage } from '../../types/chatMessage';

// Mock dependencies
class MockOutputChannel {
  name = 'test';
  appendLine = sinon.stub();
  append = sinon.stub();
  clear = sinon.stub();
  show = sinon.stub();
  hide = sinon.stub();
  dispose = sinon.stub();
  replace = sinon.stub();
}

// MockAgentService removed since ChatController now handles agent operations

class MockWebview {
  postMessage = sinon.stub().resolves(true);
  html = '';
  options = {};
  onDidReceiveMessage = sinon.stub();
  onDidDispose = sinon.stub();
}

class MockWebviewView {
  webview = new MockWebview();
  onDidDispose = sinon.stub().returns({ dispose: sinon.stub() });
  onDidChangeVisibility = sinon.stub();
  visible = true;
  viewType = 'test';
}

describe('WebviewApiProvider', () => {
  let provider: WebviewApiProvider;
  let mockOutputChannel: MockOutputChannel;
  // mockAgentService removed since ChatController now handles agent operations
  let mockWebviewView: MockWebviewView;
  
  // Stub singletons
  let workspaceStateStub: sinon.SinonStub;

  beforeEach(() => {
    mockOutputChannel = new MockOutputChannel();
    // mockAgentService creation removed
    mockWebviewView = new MockWebviewView();

    // Stub singleton instances
    workspaceStateStub = sinon.stub(WorkspaceStateService, 'getInstance').returns({
      initialize: sinon.stub(),
      saveChatHistory: sinon.stub().resolves(),
      getChatHistory: sinon.stub().returns([]),
      clearChatHistory: sinon.stub().resolves(),
      getWorkspaceId: sinon.stub().returns('test-workspace')
    } as any);

    sinon.stub(ProviderService, 'getInstance').returns({
      validateCredentialsForProvider: sinon.stub().returns({ isValid: true }),
      getProviderMetadata: sinon.stub().returns({
        id: 'test-provider',
        name: 'Test Provider',
        configureCommand: 'test.configure'
      }),
      getModelDisplayName: sinon.stub().returns('Test Model')
    } as any);

    // Stub Logger static methods
    sinon.stub(Logger, 'info');
    sinon.stub(Logger, 'debug');
    sinon.stub(Logger, 'warn');
    sinon.stub(Logger, 'error');

    provider = new WebviewApiProvider(
      {} as any, // mockWorkspaceState
      mockOutputChannel as any
    );
  });

  afterEach(() => {
    sinon.restore();
    provider.dispose();
  });

  describe('constructor', () => {
    it('should initialize properly', () => {
      expect(provider).to.be.instanceOf(WebviewApiProvider);
      expect(provider.getConnectedViewCount()).to.equal(0);
    });

    it('should initialize WorkspaceStateService', () => {
      expect(workspaceStateStub.calledOnce).to.be.true;
    });
  });

  describe('registerView', () => {
    it('should register a view successfully', () => {
      const viewId = 'test-view-1';
      provider.registerView(viewId, mockWebviewView as any);
      
      expect(provider.getConnectedViewCount()).to.equal(1);
    });

    it('should handle view disposal', () => {
      const viewId = 'test-view-1';
      let disposeCallback: () => void = () => {};
      
      mockWebviewView.onDidDispose = sinon.stub().callsFake((callback) => {
        disposeCallback = callback;
        return { dispose: sinon.stub() };
      });

      provider.registerView(viewId, mockWebviewView as any);
      expect(provider.getConnectedViewCount()).to.equal(1);

      // Simulate view disposal
      disposeCallback();
      expect(provider.getConnectedViewCount()).to.equal(0);
    });
  });

  describe('handleMessage', () => {
    beforeEach(() => {
      provider.registerView('test-view', mockWebviewView as any);
    });

    it('should handle valid API requests', async () => {
      const request = {
        type: 'request',
        id: 'test-id',
        key: 'showInformationMessage',
        params: ['Test message']
      };

      await provider.handleMessage(request, mockWebviewView.webview as any);

      expect(mockWebviewView.webview.postMessage.calledOnce).to.be.true;
      const response = mockWebviewView.webview.postMessage.firstCall.args[0];
      expect(response).to.deep.include({
        type: 'response',
        id: 'test-id'
      });
    });

    it('should handle invalid message format', async () => {
      const invalidMessage = { invalid: 'message' };
      
      await provider.handleMessage(invalidMessage, mockWebviewView.webview as any);
      
      expect(mockWebviewView.webview.postMessage.called).to.be.false;
    });

    it('should handle API errors', async () => {
      // Stub a method to throw an error
      const workspaceState = WorkspaceStateService.getInstance();
      (workspaceState.saveChatHistory as sinon.SinonStub).rejects(new Error('Save failed'));

      const request = {
        type: 'request',
        id: 'test-id',
        key: 'saveChatHistory',
        params: [[]]
      };

      await provider.handleMessage(request, mockWebviewView.webview as any);

      expect(mockWebviewView.webview.postMessage.calledOnce).to.be.true;
      const response = mockWebviewView.webview.postMessage.firstCall.args[0];
      expect(response).to.deep.include({
        type: 'error',
        id: 'test-id',
        value: 'Save failed'
      });
    });
  });

  describe('API methods', () => {
    beforeEach(() => {
      provider.registerView('test-view', mockWebviewView as any);
    });

    it('should handle saveChatHistory', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];

      const request = {
        type: 'request',
        id: 'save-test',
        key: 'saveChatHistory',
        params: [messages]
      };

      const workspaceState = WorkspaceStateService.getInstance();
      (workspaceState.saveChatHistory as sinon.SinonStub).resolves();

      await provider.handleMessage(request, mockWebviewView.webview as any);

      expect((workspaceState.saveChatHistory as sinon.SinonStub).calledWith(messages)).to.be.true;
      expect(mockWebviewView.webview.postMessage.calledOnce).to.be.true;
    });

    it('should handle loadChatHistory', async () => {
      const mockHistory: ChatMessage[] = [
        { role: 'user', content: 'Previous message' }
      ];

      const request = {
        type: 'request',
        id: 'load-test',
        key: 'loadChatHistory',
        params: []
      };

      const workspaceState = WorkspaceStateService.getInstance();
      (workspaceState.getChatHistory as sinon.SinonStub).returns(mockHistory);

      await provider.handleMessage(request, mockWebviewView.webview as any);

      expect(mockWebviewView.webview.postMessage.calledOnce).to.be.true;
      const response = mockWebviewView.webview.postMessage.firstCall.args[0];
      expect(response.value).to.deep.equal(mockHistory);
    });

    it('should handle clearChatHistory', async () => {
      const request = {
        type: 'request',
        id: 'clear-test',
        key: 'clearChatHistory',
        params: []
      };

      const workspaceState = WorkspaceStateService.getInstance();
      (workspaceState.clearChatHistory as sinon.SinonStub).resolves();

      await provider.handleMessage(request, mockWebviewView.webview as any);

      expect((workspaceState.clearChatHistory as sinon.SinonStub).calledOnce).to.be.true;
      expect(mockWebviewView.webview.postMessage.calledOnce).to.be.true;
    });

    it('should handle getCurrentProvider', async () => {
      // Mock getModel function
      const getModelStub = sinon.stub().returns({
        providerId: 'anthropic',
        id: 'claude-3-5-sonnet-20241022'
      });
      
      // Stub the getModel function
      sinon.stub(VsCodeConfiguration, 'getModel').returns(getModelStub());

      const request = {
        type: 'request',
        id: 'provider-test',
        key: 'getCurrentProvider',
        params: []
      };

      await provider.handleMessage(request, mockWebviewView.webview as any);

      expect(mockWebviewView.webview.postMessage.calledOnce).to.be.true;
      const response = mockWebviewView.webview.postMessage.firstCall.args[0];
      expect(response.value).to.deep.equal({
        providerId: 'anthropic',
        model: 'claude-3-5-sonnet-20241022'
      });

      // sinon.restore() will handle cleanup automatically
    });
  });

  describe('triggerEvent', () => {
    beforeEach(() => {
      provider.registerView('test-view-1', mockWebviewView as any);
      
      // Add a second view
      const mockWebviewView2 = new MockWebviewView();
      provider.registerView('test-view-2', mockWebviewView2 as any);
    });

    it('should trigger events to all connected views', () => {
      provider.triggerEvent('chatResponseChunk', 'Hello', 'assistant');

      // Both views should receive the event
      expect(mockWebviewView.webview.postMessage.calledOnce).to.be.true;
      
      const event = mockWebviewView.webview.postMessage.firstCall.args[0];
      expect(event).to.deep.include({
        type: 'event',
        key: 'chatResponseChunk',
        value: ['Hello', 'assistant']
      });
    });

    it('should handle event triggering errors gracefully', () => {
      mockWebviewView.webview.postMessage.rejects(new Error('Send failed'));

      // Should not throw
      expect(() => provider.triggerEvent('chatStreamEnd')).not.to.throw();
    });
  });

  describe('dispose', () => {
    it('should clean up resources', () => {
      provider.registerView('test-view', mockWebviewView as any);
      expect(provider.getConnectedViewCount()).to.equal(1);

      provider.dispose();
      expect(provider.getConnectedViewCount()).to.equal(0);
    });
  });
});