import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  isViewApiRequest,
  isViewApiResponse,
  isViewApiError,
  isViewApiEvent,
  type ViewAPI,
  type ViewEvents,
  type ViewApiRequest,
  type ViewApiResponse,
  type ViewApiError,
  type ViewApiEvent
} from '../../api/viewApi';

describe('ViewAPI Type Guards', () => {
  describe('isViewApiRequest', () => {
    it('should return true for valid API requests', () => {
      const validRequest: ViewApiRequest = {
        type: 'request',
        id: 'test-id',
        key: 'sendChatMessage',
        params: ['Hello', []]
      };

      expect(isViewApiRequest(validRequest)).to.be.true;
    });

    it('should return false for invalid requests', () => {
      expect(isViewApiRequest(null)).to.be.false;
      expect(isViewApiRequest(undefined)).to.be.false;
      expect(isViewApiRequest({})).to.be.false;
      expect(isViewApiRequest({ type: 'request' })).to.be.false;
      expect(isViewApiRequest({ type: 'request', id: 'test' })).to.be.false;
      expect(isViewApiRequest({ type: 'request', id: 'test', key: 'test' })).to.be.false;
      expect(isViewApiRequest({ type: 'response', id: 'test', key: 'test', params: [] })).to.be.false;
    });

    it('should validate params as array', () => {
      const invalidRequest = {
        type: 'request',
        id: 'test-id',
        key: 'sendChatMessage',
        params: 'not-an-array'
      };

      expect(isViewApiRequest(invalidRequest)).to.be.false;
    });
  });

  describe('isViewApiResponse', () => {
    it('should return true for valid API responses', () => {
      const validResponse: ViewApiResponse = {
        type: 'response',
        id: 'test-id',
        value: 'result'
      };

      expect(isViewApiResponse(validResponse)).to.be.true;
    });

    it('should return true even when value is undefined', () => {
      const responseWithUndefinedValue: ViewApiResponse = {
        type: 'response',
        id: 'test-id',
        value: undefined
      };

      expect(isViewApiResponse(responseWithUndefinedValue)).to.be.true;
    });

    it('should return false for invalid responses', () => {
      expect(isViewApiResponse(null)).to.be.false;
      expect(isViewApiResponse({})).to.be.false;
      expect(isViewApiResponse({ type: 'response' })).to.be.false;
      expect(isViewApiResponse({ type: 'response', id: 'test' })).to.be.false;
      expect(isViewApiResponse({ type: 'request', id: 'test', value: 'test' })).to.be.false;
    });
  });

  describe('isViewApiError', () => {
    it('should return true for valid API errors', () => {
      const validError: ViewApiError = {
        type: 'error',
        id: 'test-id',
        value: 'Error message'
      };

      expect(isViewApiError(validError)).to.be.true;
    });

    it('should return false for invalid errors', () => {
      expect(isViewApiError(null)).to.be.false;
      expect(isViewApiError({})).to.be.false;
      expect(isViewApiError({ type: 'error' })).to.be.false;
      expect(isViewApiError({ type: 'error', id: 'test' })).to.be.false;
      expect(isViewApiError({ type: 'error', id: 'test', value: 123 })).to.be.false;
      expect(isViewApiError({ type: 'response', id: 'test', value: 'test' })).to.be.false;
    });
  });

  describe('isViewApiEvent', () => {
    it('should return true for valid API events', () => {
      const validEvent: ViewApiEvent = {
        type: 'event',
        key: 'chatResponseChunk',
        value: ['chunk data']
      };

      expect(isViewApiEvent(validEvent)).to.be.true;
    });

    it('should return false for invalid events', () => {
      expect(isViewApiEvent(null)).to.be.false;
      expect(isViewApiEvent({})).to.be.false;
      expect(isViewApiEvent({ type: 'event' })).to.be.false;
      expect(isViewApiEvent({ type: 'event', key: 'test' })).to.be.false;
      expect(isViewApiEvent({ type: 'event', key: 'test', value: 'not-array' })).to.be.false;
      expect(isViewApiEvent({ type: 'response', key: 'test', value: [] })).to.be.false;
    });
  });
});

describe('ViewAPI Type Definitions', () => {
  it('should have correct interface structure for ViewAPI', () => {
    // This is a compile-time test - if the types are wrong, TypeScript will fail
    const mockApi: Partial<ViewAPI> = {
      sendChatMessage: async (_message: string, _history: any[]) => {},
      stopChat: () => {},
      saveChatHistory: async (_history: any[]) => {},
      loadChatHistory: async () => [],
      clearChatHistory: async () => {},
      getCurrentProvider: async () => ({ providerId: 'test', model: 'test' }),
      changeProvider: async (_providerId: string, _model: string) => {},
      selectFile: async () => null,
      selectFolder: async () => null,
      selectImages: async () => null,
      showInformationMessage: (_message: string) => {},
      showErrorMessage: (_message: string) => {},
      executeCommand: async (_command: string, _args?: any) => {},
      getBase64Image: async (_filePath: string) => '',
      saveImageToMoodboard: async (_data: any) => {}
    };

    // If this compiles, the interface is correctly structured
    expect(mockApi).to.be.an('object');
  });

  it('should have correct interface structure for ViewEvents', () => {
    // Compile-time test for ViewEvents
    const mockEvents: Partial<ViewEvents> = {
      chatResponseChunk: (_chunk: string, _messageType?: string, _metadata?: any) => {},
      chatToolUpdate: (_toolId: string, _args: any) => {},
      chatToolResult: (_toolId: string, _result: any) => {},
      chatStreamEnd: () => {},
      chatError: (_error: string, _actions?: any[]) => {},
      chatStopped: () => {},
      workspaceChanged: (_workspaceId?: string) => {},
      providerChanged: (_providerId: string, _model: string) => {},
      historyLoaded: (_history: any[], _workspaceId?: string) => {},
      migrationComplete: (_history: any[], _workspaceId?: string) => {},
      contextFromCanvas: (_data: { fileName: string; type: string }) => {},
      imageSavedToMoodboard: (_data: { fileName: string; originalName: string; fullPath: string }) => {},
      imageSaveError: (_data: { fileName: string; originalName: string; error: string }) => {},
      uploadFailed: (_error: string) => {},
      base64ImageResult: (_data: { filePath: string; base64Data: string; mimeType: string }) => {}
    };

    expect(mockEvents).to.be.an('object');
  });
});

describe('ViewAPI Message Types', () => {
  it('should correctly type ViewApiRequest with different API keys', () => {
    const chatRequest: ViewApiRequest<'sendChatMessage'> = {
      type: 'request',
      id: 'test',
      key: 'sendChatMessage',
      params: ['Hello', []]
    };

    const providerRequest: ViewApiRequest<'getCurrentProvider'> = {
      type: 'request',
      id: 'test2',
      key: 'getCurrentProvider',
      params: []
    };

    expect(chatRequest.key).to.equal('sendChatMessage');
    expect(providerRequest.key).to.equal('getCurrentProvider');
    expect(chatRequest.params).to.deep.equal(['Hello', []]);
    expect(providerRequest.params).to.deep.equal([]);
  });

  it('should correctly type ViewApiEvent with different event keys', () => {
    const chunkEvent: ViewApiEvent<'chatResponseChunk'> = {
      type: 'event',
      key: 'chatResponseChunk',
      value: ['chunk data']
    };

    const errorEvent: ViewApiEvent<'chatError'> = {
      type: 'event',
      key: 'chatError',
      value: ['Error message']
    };

    expect(chunkEvent.key).to.equal('chatResponseChunk');
    expect(errorEvent.key).to.equal('chatError');
  });
});