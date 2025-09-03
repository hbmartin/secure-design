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

export function isToolResultPart(value: unknown): value is ToolResultPart {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'type')) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'toolCallId')) return false;
    if (!Object.prototype.hasOwnProperty.call(value, 'toolName')) return false;

    const v = value as Record<string, unknown>;
    if (v.type !== 'tool-result') return false;
    if (typeof v.toolCallId !== 'string') return false;
    if (typeof v.toolName !== 'string') return false;
    if ('isError' in v && typeof v.isError !== 'boolean') return false;

    return true;
}
