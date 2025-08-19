# WebView Message Contract Documentation

This document describes the message communication protocol between the VS Code extension host and webviews to ensure reliable, race-condition-free operations.

## Overview

The extension uses a bidirectional message passing system between:

- **Extension Host**: The main VS Code extension process
- **WebViews**: Chat sidebar and Canvas panel UI components

## Message Flow Guarantees

### 1. Initialization Sequence

```mermaid
sequenceDiagram
    participant W as WebView
    participant E as Extension Host
    participant S as Workspace State

    W->>W: Check localStorage for old data
    alt Has old data & not migrated
        W->>E: migrateLocalStorage(oldData)
        E->>S: Save migrated data
        E->>W: migrationComplete(data, workspaceId)
        W->>W: Clear localStorage
    else No old data or already migrated
        W->>E: loadChatHistory()
        E->>S: Get chat history
        E->>W: chatHistoryLoaded(data, workspaceId)
    end
    W->>W: Set isInitialized = true
```

**Race Condition Prevention:**

- `isInitialized` flag prevents duplicate initialization requests
- `hasMigrated` flag prevents duplicate migrations
- Migration only happens once per workspace (tracked in workspace state)

### 2. Chat History Save (Debounced)

```mermaid
sequenceDiagram
    participant U as User
    participant W as WebView
    participant E as Extension Host

    U->>W: Type message
    W->>W: Update chatHistory state
    W->>W: Clear existing save timer
    W->>W: Start 500ms timer
    Note over W: If another change occurs,<br/>timer resets
    W->>W: Timer expires
    W->>E: saveChatHistory(data)
    E->>E: Save to workspace state
    W->>W: Set isSaving = false
```

**Race Condition Prevention:**

- 500ms debounce prevents rapid saves
- `isSaving` flag prevents loading during save
- Cancellation on workspace change

### 3. Workspace Changes

```mermaid
sequenceDiagram
    participant VS as VS Code
    participant E as Extension Host
    participant W as WebView

    VS->>E: Workspace folder changed
    E->>W: workspaceChanged(workspaceId)
    W->>W: Cancel pending saves
    W->>W: Clear save state
    W->>E: loadChatHistory()
    E->>W: chatHistoryLoaded(data, workspaceId)
```

**Race Condition Prevention:**

- Cancels pending saves before switching
- Clears save state to prevent cross-workspace pollution
- New workspace ID prevents stale data

### 4. WebView Restoration

```mermaid
sequenceDiagram
    participant VS as VS Code
    participant E as Extension Host
    participant W as WebView

    VS->>E: Restore webview panel
    E->>E: Deserialize saved state
    E->>W: Create webview with state
    Note over E,W: 500ms delay
    E->>W: restoreSelection(fileName)
    W->>E: loadChatHistory()
    E->>W: chatHistoryLoaded(data)
```

**Race Condition Prevention:**

- 500ms delay ensures webview is ready
- State passed through constructor
- Restoration happens after webview loads

## Message Types

### WebView → Extension

| Command                     | Purpose                   | Payload                                       | Response                      |
| --------------------------- | ------------------------- | --------------------------------------------- | ----------------------------- |
| `saveChatHistory`           | Persist chat to workspace | `chatHistory: ChatMessage[]`                  | None (fire-and-forget)        |
| `loadChatHistory`           | Request current chat      | None                                          | `chatHistoryLoaded`           |
| `clearWorkspaceChatHistory` | Clear all chat            | None                                          | `chatHistoryCleared`          |
| `migrateLocalStorage`       | Migrate old data          | `oldChatHistory: ChatMessage[]`               | `migrationComplete`           |
| `chatMessage`               | Send user message         | `message: string, chatHistory: ChatMessage[]` | Stream of `chatResponseChunk` |
| `stopChat`                  | Cancel streaming          | None                                          | `chatStopped`                 |

### Extension → WebView

| Command              | Purpose           | Payload                                            | Triggered By                |
| -------------------- | ----------------- | -------------------------------------------------- | --------------------------- |
| `chatHistoryLoaded`  | Provide chat data | `chatHistory: ChatMessage[], workspaceId?: string` | `loadChatHistory`           |
| `chatHistoryCleared` | Confirm clear     | None                                               | `clearWorkspaceChatHistory` |
| `migrationComplete`  | Migration done    | `chatHistory: ChatMessage[], workspaceId?: string` | `migrateLocalStorage`       |
| `workspaceChanged`   | Workspace switch  | `workspaceId?: string`                             | VS Code event               |
| `chatResponseChunk`  | Stream response   | Various                                            | `chatMessage`               |
| `chatError`          | Report error      | `error: string`                                    | Error condition             |

## Error Handling Strategy

### 1. Message Send Failures

```typescript
try {
    await webview.postMessage(message);
} catch (error) {
    Logger.error(`Failed to send message: ${error}`);
    // Graceful degradation - don't crash
}
```

### 2. Handler Errors

```typescript
try {
    await handleMessage(message);
} catch (error) {
    Logger.error(`Handler error: ${error}`);
    // Send error response if applicable
    webview.postMessage({
        command: 'error',
        error: error.message,
    });
}
```

### 3. Timeout Protection

- WebviewMessageGuard implements 5-second timeouts
- Pending requests cleaned up after 10 seconds
- Stale requests logged and rejected

## Best Practices

### DO:

✅ Always wrap handlers in try-catch  
✅ Use debouncing for frequent operations  
✅ Check webview disposal before sending  
✅ Log all message operations  
✅ Validate message payloads  
✅ Use type guards for message handling

### DON'T:

❌ Send messages in tight loops  
❌ Assume message delivery  
❌ Store state in both places  
❌ Send large payloads frequently  
❌ Ignore error responses  
❌ Mix sync and async patterns

## Testing Checklist

- [ ] Initialize fresh workspace
- [ ] Migrate from localStorage
- [ ] Switch between workspaces rapidly
- [ ] Save during workspace switch
- [ ] Restore after VS Code restart
- [ ] Handle network/API errors
- [ ] Clear chat during save
- [ ] Multiple panels open simultaneously
- [ ] Dispose during message send
- [ ] Large chat history (100+ messages)

## Debugging

Enable debug logging:

```typescript
Logger.debug(`Message sent: ${command}`);
Logger.debug(`Message received: ${command}`);
```

Monitor in VS Code Output panel:

1. Open Output panel (View → Output)
2. Select "SecureDesign" from dropdown
3. Watch for message flow

Common issues:

- "Cannot send message to disposed webview" - Check disposal guards
- "Timeout waiting for response" - Check handler implementation
- "Migration already performed" - Check migration flags
- "Chat history not loading" - Check workspace state initialization
