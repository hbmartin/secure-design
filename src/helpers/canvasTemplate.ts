import type * as vscode from 'vscode';

export interface HtmlTemplateContext {
    scriptUri: vscode.Uri;
    logoUris: {
        cursor: string;
        windsurf: string;
        claudeCode: string;
        lovable: string;
        bolt: string;
    };
    nonce: string;
    extensionUri: vscode.Uri;
    webviewCspSource: string;
}

export function generateCanvasHtml(context: HtmlTemplateContext): string {
    const { scriptUri, logoUris, nonce, extensionUri, webviewCspSource } = context;

    return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webviewCspSource} 'unsafe-inline'; img-src ${webviewCspSource} data: https: vscode-webview:; script-src 'nonce-${nonce}'; frame-src ${webviewCspSource};">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>SecureDesign Canvas</title>
		</head>
		<body>
			<div id="root" data-view="canvas" data-nonce="${nonce}"></div>
			<script nonce="${nonce}">
				// Initialize context for React app
				window.__WEBVIEW_CONTEXT__ = {
					layout: 'panel',
					extensionUri: '${extensionUri.toString()}',
					logoUris: ${JSON.stringify(logoUris)}
				};
				
				// Debug logging in webview
				console.log('Canvas Panel - Webview context set:', window.__WEBVIEW_CONTEXT__);
			</script>
			<script nonce="${nonce}" src="${scriptUri}"></script>
		</body>
		</html>`;
}

export function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
