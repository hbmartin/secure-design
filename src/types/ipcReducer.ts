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
export interface Action<T, K extends FnKeys<T> = FnKeys<T>> {
    readonly type: typeof ACT;
    readonly providerId: WebviewKey;
    readonly key: K;
    readonly params: T[K] extends (...a: infer A) => any ? Readonly<A> : never;
}

export interface Patch<A, K extends FnKeys<A> = FnKeys<A>> {
    readonly type: typeof PATCH;
    readonly providerId: WebviewKey;
    readonly key: K;
    readonly patch: Patches<A>[K];
}

type Patches<A> = {
    [K in FnKeys<A>]: A[K] extends (...args: any) => infer R
        ? R extends Promise<infer U>
            ? U
            : R
        : never;
};

export function isMyActionMessage<T>(msg: any, providerId: string): msg is Action<T> {
    return (
        msg !== undefined &&
        typeof msg === 'object' &&
        'providerId' in msg &&
        'type' in msg &&
        msg.type === ACT &&
        typeof msg.providerId === 'string' &&
        msg.providerId === providerId
    );
}

export type StateReducer<S, A> = {
    [Key in FnKeys<A>]: (prevState: S, patch: Patches<A>[Key]) => S;
};

export type ActionDelegate<A> = {
    [K in FnKeys<A>]: A[K] extends (...args: infer P) => infer R ? (...args: P) => R : never;
};
