import type { Brand } from '../providers/types';

export type WebviewKey = Brand<string, 'WebviewKey'>;

export const PATCH = 'patch';
export const ACT = 'act';

export type FnKeys<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

export function isFnKey<T extends object>(
    prop: string | symbol | number,
    obj: T
): prop is FnKeys<T> {
    return (
        Object.prototype.hasOwnProperty.call(obj, prop) &&
        typeof obj[prop as keyof T] === 'function'
    );
}

interface IpcMessage {
    readonly type: string;
    readonly providerId: WebviewKey;
}
export interface Action<T extends object, K extends FnKeys<T> = FnKeys<T>> extends IpcMessage {
    readonly type: typeof ACT;
    readonly key: K;
    readonly params: T[K] extends (...a: infer A) => any ? Readonly<A> : never;
}

export interface Patch<A, K extends FnKeys<A> = FnKeys<A>> extends IpcMessage {
    readonly type: typeof PATCH;
    readonly key: K;
    readonly patch: Patches<A>[K];
}

export type Patches<A> = {
    [K in FnKeys<A>]: A[K] extends (...args: any) => infer R
        ? R extends Promise<infer U>
            ? U
            : R
        : never;
};

export function isMyActionMessage<T extends object>(
    msg: any,
    providerId: WebviewKey
): msg is Action<T> {
    return (
        msg !== null &&
        msg !== undefined &&
        typeof msg === 'object' &&
        'providerId' in msg &&
        'type' in msg &&
        'key' in msg &&
        'params' in msg &&
        msg.type === ACT &&
        typeof msg.providerId === 'string' &&
        msg.providerId === providerId &&
        (typeof msg.key === 'string' || typeof msg.key === 'symbol') &&
        Array.isArray(msg.params)
    );
}

export type StateReducer<S, A> = {
    [Key in FnKeys<A>]: (prevState: S, patch: Patches<A>[Key]) => S;
};

export type ActionDelegate<A> = {
    [K in FnKeys<A>]: A[K] extends (...args: infer P) => infer R
        ? (...args: P) => R | Promise<R>
        : never;
};
