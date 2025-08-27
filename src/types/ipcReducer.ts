import type { Brand } from '../providers/types';

export type WebviewKey = Brand<string, 'WebviewKey'>;

export const PATCH = 'patch';
export const ACT = 'act';

export interface Action<T, K extends keyof T = keyof T> {
    type: 'act';
    providerId: WebviewKey;
    key: K;
    params: T[K] extends (...args: any[]) => any ? Parameters<T[K]> : never;
}

export type BasePatches<A> = {
    [K in keyof A]-?: unknown;
};

export type Patches<A, T extends BasePatches<A>> = T;

export interface Patch<P, K extends keyof P = keyof P> {
    type: 'patch';
    providerId: WebviewKey;
    key: K;
    patch: P[K];
}

export interface StateWrapper<S> {
    type: 'state';
    state: S;
    providerId: WebviewKey;
}

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

export type StateReducer<S, P extends BasePatches<any>, K extends keyof P = keyof P> = {
    [Key in K]: (prevState: S, patch: P[Key]) => S;
};
