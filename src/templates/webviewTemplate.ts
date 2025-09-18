import * as vscode from 'vscode';

export function generateWebviewHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
): string {
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js')
    );

    // Generate webview URIs for logo images
    const logoUris = {
        cursor: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'assets', 'cursor_logo.png')).toString(),
        windsurf: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'assets', 'windsurf_logo.png')).toString(),
        claudeCode: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'assets', 'claude_code_logo.png')).toString(),
        lovable: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'assets', 'lovable_logo.png')).toString(),
        bolt: webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'assets', 'bolt_logo.jpg')).toString(),
    };

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; img-src ${webview.cspSource} data: https: vscode-webview:; script-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource} https://fonts.gstatic.com;">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SecureDesign Chat</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                font-size: var(--vscode-font-size);
                font-weight: var(--vscode-font-weight);
                color: var(--vscode-sideBar-foreground);
                background-color: var(--vscode-sideBar-background);
                border-right: 1px solid var(--vscode-sideBar-border);
                margin: 0;
                padding: 8px;
                height: 100vh;
                overflow: hidden;
                box-sizing: border-box;
            }
        </style>
    </head>
    <body>
        <div id="root"></div>
        <script>
            // Initialize context for React app
            window.__WEBVIEW_CONTEXT__ = ${JSON.stringify({ extensionUri, logoUris })};
            
            // Debug logging in webview
            console.log('Webview context set:', window.__WEBVIEW_CONTEXT__);
            console.log('Logo URIs received in webview:', window.__WEBVIEW_CONTEXT__?.logoUris);
            
            // Additional debug - check if context persists
            setTimeout(() => {
                console.log('Context check after 1 second:', window.__WEBVIEW_CONTEXT__);
            }, 1000);
        </script>
        <script src="${scriptUri}"></script>
    </body>
    </html>`;
}

 