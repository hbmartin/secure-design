import * as vscode from 'vscode';
import type { WebviewApiProvider } from './WebviewApiProvider';
import type { WebviewContext } from '../types/context';
import { getLogger } from '../services/logger';
import type { ViewApiRequest } from '../api/viewApi';
import {
    isMyActionMessage,
    type WebviewKey,
    PATCH,
    type BasePatches,
    type Patch,
} from '../types/ipcReducer';

export abstract class BaseWebviewViewProvider<A, P extends BasePatches<A>>
    implements vscode.WebviewViewProvider
{
    protected _view?: vscode.WebviewView;
    protected readonly logger;
    constructor(
        private readonly providerId: WebviewKey,
        private readonly _extensionUri: vscode.Uri,
        private readonly apiProvider: WebviewApiProvider
    ) {
        this.logger = getLogger(providerId.split('.')[1]);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this.logger.debug('Resolving webview view');
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'dist'),
                vscode.Uri.joinPath(this._extensionUri, 'src', 'assets'),
            ],
        };

        const webviewContext: WebviewContext = {
            layout: 'sidebar',
            extensionUri: this._extensionUri.toString(),
        };

        const html = this.generateWebviewHtml(
            webviewView.webview,
            this._extensionUri,
            webviewContext
        );

        webviewView.webview.html = html;

        this.apiProvider.registerView(this.providerId, webviewView, this.providerId);

        const messageListener = webviewView.webview.onDidReceiveMessage(async message => {
            if (isMyActionMessage<A>(message, this.providerId)) {
                this.logger.debug('Received action message from webview', message);
                // Cast args to the correct parameter type for this specific method
                const params = message.params as A[keyof A] extends (...args: any[]) => any
                    ? Parameters<A[keyof A]>
                    : never;

                const [patchKey, patchParams] = await this.handleAction(message.key, params);
                const patch = {
                    type: PATCH,
                    providerId: this.providerId,
                    key: patchKey,
                    patch: patchParams,
                } as Patch<P>;

                this._view?.webview.postMessage(patch);
                return;
            }

            if (message.key !== 'log') {
                this.logger.debug('Delegating API request to WebviewApiProvider', {
                    requestId: message.id,
                    requestKey: message.key,
                });
            }
            await this.handleMessage(message, webviewView.webview);
        });

        // Dispose of the message listener when webview is disposed
        webviewView.onDidDispose(() => {
            messageListener.dispose();
        });
    }

    protected abstract generateWebviewHtml(
        webview: vscode.Webview,
        extensionUri: vscode.Uri,
        context: WebviewContext
    ): string;

    protected abstract handleMessage(
        message: ViewApiRequest,
        webview: vscode.Webview
    ): Promise<void>;

    protected abstract handleAction<K extends keyof A = keyof A>(
        key: K,
        params: A[K] extends (...args: any[]) => any ? Parameters<A[K]> : never
    ): Promise<[K, P[K]]>;
}
