import { createCtxKey, type ClientCalls } from 'react-vscode-webview-ipc/client';
import type { ChatViewAPI } from '../api/viewApi';

export const ChatContextKey = createCtxKey<ChatViewAPI>('chat');
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface DummyCanvasApi extends ClientCalls {}
export const CanvasContextKey = createCtxKey<DummyCanvasApi>('canvas');
