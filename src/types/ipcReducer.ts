import type { Brand } from '../providers/types';

export type WebviewKey = Brand<string, 'WebviewKey'>;

export const PATCH = 'patch';
export const ACT = 'act';

export type FnKeys<T> = {
    [K in keyof T]: T[K] extends (...arguments_: any[]) => any ? K : never;
}[keyof T];

export function isFnKey<T extends object>(
    property: string | symbol | number,
    object: T
): property is FnKeys<T> {
    return (
        Object.prototype.hasOwnProperty.call(object, property) &&
        typeof object[property as keyof T] === 'function'
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
    [K in FnKeys<A>]: A[K] extends (...arguments_: any) => infer R
        ? R extends Promise<infer U>
            ? U
            : R
        : never;
};

export function isMyActionMessage<T extends object>(
    message: any,
    providerId: WebviewKey
): message is Action<T> {
    return (
        message !== null &&
        message !== undefined &&
        typeof message === 'object' &&
        'providerId' in message &&
        'type' in message &&
        'key' in message &&
        'params' in message &&
        message.type === ACT &&
        typeof message.providerId === 'string' &&
        message.providerId === providerId &&
        (typeof message.key === 'string' || typeof message.key === 'symbol') &&
        Array.isArray(message.params)
    );
}

export type StateReducer<S, A> = {
    [Key in FnKeys<A>]: (previousState: S, patch: Patches<A>[Key]) => S;
};

export type ActionDelegate<A> = {
    [K in FnKeys<A>]: A[K] extends (...arguments_: infer P) => infer R
        ? (...arguments_: P) => R | Promise<R>
        : never;
};
