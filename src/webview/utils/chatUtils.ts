import type { ToolResultPart, ToolCallPart } from 'ai';

export function isToolCallPart(value: unknown): value is ToolCallPart {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'type')) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'toolCallId')) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'toolName')) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'input')) return false;

    const v = value as Record<string, unknown>;
    if (v.type !== 'tool-call') return false;
    if (typeof v.toolCallId !== 'string') return false;
    if (typeof v.toolName !== 'string') return false;

    return true;
}

export interface NormalizedToolInput {
    /** Parsed key/value input when the payload is (or parses to) a plain object */
    readonly input: Record<string, unknown> | undefined;
    /** Human-readable rendering of the payload, regardless of its original shape */
    readonly display: string;
}

/**
 * Some providers (e.g. DeepSeek, or models routed through OpenRouter) deliver
 * tool-call input as a JSON string rather than a parsed object. Normalize any
 * payload shape so rendering code can safely use `in` checks and key access.
 */
export function normalizeToolInput(rawInput: unknown): NormalizedToolInput {
    if (rawInput === undefined || rawInput === null) {
        return { input: undefined, display: '' };
    }

    if (typeof rawInput === 'string') {
        try {
            const parsed: unknown = JSON.parse(rawInput);
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return {
                    input: parsed as Record<string, unknown>,
                    display: JSON.stringify(parsed, null, 2),
                };
            }
        } catch {
            // Not JSON (or truncated mid-stream) — fall through and show it raw
        }
        return { input: undefined, display: rawInput };
    }

    if (typeof rawInput === 'object') {
        let display: string;
        try {
            display = JSON.stringify(rawInput, null, 2);
        } catch {
            display = '[Tool input serialization failed]';
        }
        if (Array.isArray(rawInput)) {
            return { input: undefined, display };
        }
        return { input: rawInput as Record<string, unknown>, display };
    }

    if (
        typeof rawInput === 'number' ||
        typeof rawInput === 'boolean' ||
        typeof rawInput === 'bigint'
    ) {
        return { input: undefined, display: String(rawInput) };
    }

    return { input: undefined, display: '' };
}

export function isToolResultPart(value: unknown): value is ToolResultPart {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'type')) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'toolCallId')) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'toolName')) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'output')) return false;

    const v = value as Record<string, unknown>;
    if (v.type !== 'tool-result') return false;
    if (typeof v.toolCallId !== 'string') return false;
    if (typeof v.toolName !== 'string') return false;
    if ('isError' in v && typeof v.isError !== 'boolean') return false;

    return true;
}
