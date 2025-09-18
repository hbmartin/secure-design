import * as path from 'path';
import * as vscode from 'vscode';
import { Logger } from 'react-vscode-webview-ipc/host';

export default async function getCssFileContent(filePath: string): Promise<string> {
    // Handle relative paths - resolve them to workspace root
    let resolvedPath = filePath;

    if (!path.isAbsolute(filePath)) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        // If path doesn't start with .superdesign, add it
        if (!filePath.startsWith('.superdesign/') && filePath.startsWith('design_iterations/')) {
            resolvedPath = `.superdesign/${filePath}`;
        }

        resolvedPath = path.join(workspaceFolder.uri.fsPath, resolvedPath);
    }

    Logger.info(`[getCssFileContent] Resolved path: ${resolvedPath}`);

    // Check if file exists first
    let fileUri = vscode.Uri.file(resolvedPath);
    try {
        await vscode.workspace.fs.stat(fileUri);
    } catch {
        const { workspaceFolders } = vscode.workspace;
        if (
            workspaceFolders !== undefined &&
            !filePath.startsWith('.superdesign/') &&
            !filePath.startsWith('/')
        ) {
            // TODO: detect correct workspace index
            const altPath = path.join(workspaceFolders[0].uri.fsPath, '.superdesign', filePath);
            try {
                const altUri = vscode.Uri.file(altPath);
                await vscode.workspace.fs.stat(altUri);
                resolvedPath = altPath;
                fileUri = altUri;
            } catch {
                throw new Error(`CSS file not found at: ${resolvedPath} or ${altPath}`);
            }
        } else {
            throw new Error(`CSS file not found: ${resolvedPath}`);
        }
    }

    // Read the CSS file
    const fileData = await vscode.workspace.fs.readFile(fileUri);

    // Convert to string
    return Buffer.from(fileData).toString('utf8');
}
