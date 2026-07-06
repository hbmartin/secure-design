// Browser stand-in for the Node-only Claude Code SDK. The webview only needs
// provider metadata and configuration; model instances are created in the
// extension host. Match the shape expected by ai-sdk-provider-claude-code.
export function createClaudeCode(): never {
    throw new Error('Claude Code SDK is not available in the browser build.');
}

export default {};
