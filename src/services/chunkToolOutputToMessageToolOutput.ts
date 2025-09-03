import type { JSONValue } from 'ai';
import type { LanguageModelV2ToolResultOutput } from '@ai-sdk/provider';

function isPlainObject(x: unknown): x is Record<string, unknown> {
    if (typeof x !== 'object' || x === null) return false;
    const proto = Object.getPrototypeOf(x);
    return proto === Object.prototype || proto === null;
}

// Safe property getter (avoids property access before existence checks)
function getProp<T extends string>(o: unknown, key: T): unknown {
    return typeof o === 'object' && o !== null && key in o
        ? (o as Record<T, unknown>)[key]
        : undefined;
}

function isJSONValue(x: unknown, seen = new WeakSet<object>()): x is JSONValue {
    if (x === null) return true;
    const t = typeof x;
    if (t === 'string' || t === 'number' || t === 'boolean') return true;
    if (t === 'bigint' || t === 'function' || t === 'symbol' || t === 'undefined') return false;

    // objects / arrays
    if (typeof x === 'object') {
        const obj = x;
        if (seen.has(obj)) return false; // cycle guard
        seen.add(obj);

        if (Array.isArray(x)) return x.every(v => isJSONValue(v, seen));
        if (!isPlainObject(x)) return false;

        for (const [k, v] of Object.entries(x)) {
            if (typeof k !== 'string') return false;
            if (!isJSONValue(v, seen)) return false;
        }
        return true;
    }
    return false;
}

function isTextItem(x: unknown): boolean {
    const type = getProp(x, 'type');
    const text = getProp(x, 'text');
    return type === 'text' && typeof text === 'string';
}

function isMediaItem(x: unknown): boolean {
    const type = getProp(x, 'type');
    const data = getProp(x, 'data');
    const mediaType = getProp(x, 'mediaType');
    return type === 'media' && typeof data === 'string' && typeof mediaType === 'string';
}

function isContentArray(x: unknown): boolean {
    return Array.isArray(x) && x.every(item => isTextItem(item) || isMediaItem(item));
}

// Accepts an already-formed union (validates shape)
function isLanguageModelV2ToolResultOutput(x: unknown): x is LanguageModelV2ToolResultOutput {
    if (!isPlainObject(x)) return false;
    const type = getProp(x, 'type');
    const value = getProp(x, 'value');

    switch (type) {
        case 'text':
            return typeof value === 'string';
        case 'json':
            return isJSONValue(value);
        case 'error-text':
            return typeof value === 'string';
        case 'error-json':
            return isJSONValue(value);
        case 'content':
            return isContentArray(value);
        default:
            return false;
    }
}

/* ──────────────── Heuristic classifier ──────────────── */

export function guessToolResultOutput(input: unknown): LanguageModelV2ToolResultOutput {
    // 1) Already the correct union? Return as-is.
    if (isLanguageModelV2ToolResultOutput(input)) {
        return input;
    }

    // 2) Native Error -> error-text (message best represents the error)
    if (input instanceof Error) {
        return { type: 'error-text', value: input.message ?? String(input) };
    }

    // 3) Content array or single content item -> wrap as content
    //   if (isContentArray(input)) {
    //     return { type: 'content', value: input };
    //   }
    //   if (isTextItem(input) || isMediaItem(input)) {
    //     return { type: 'content', value: [input] };
    //   }

    // 4) Primitives / strings
    if (typeof input === 'string') {
        return { type: 'text', value: input };
    }

    // 5) JSON-compatible values
    if (isJSONValue(input)) {
        // detect "error-ish" JSON objects and map to error-json
        // if (
        //   isPlainObject(input) &&
        //   (typeof getProp(input, 'error') !== 'undefined' ||
        //     typeof getProp(input, 'code') !== 'undefined' ||
        //     typeof getProp(input, 'message') === 'string')
        // ) {
        //   return { type: 'error-json', value: input };
        // }
        return { type: 'json', value: input };
    }

    // 6) Last resort: stringify unknown into error-text
    let msg = '';
    try {
        msg = JSON.stringify(input);
    } catch {
        msg = Object.prototype.toString.call(input);
    }
    return { type: 'error-text', value: `Unrecognized value: ${msg}` };
}
