import type { Brand } from '../providers/types';

export type WebviewKey = Brand<string, 'WebviewKey'>;

export const PATCH = 'patch';
export const ACT = 'act';

// Function keys whose parameter tuple is not `any[]`
type FnKeys<T> = {
    [K in KnownKeys<T>]-?: T[K] extends (...a: infer A) => any
        ? IsAny<A> extends true
            ? never
            : K
        : never;
}[KnownKeys<T>];

export function isFnKey<T extends object>(prop: string | symbol, obj: T): prop is FnKeys<T> {
    return prop in obj && typeof obj[prop as keyof T] === 'function';
}
export interface Action<T extends Actions, K extends FnKeys<T> = FnKeys<T>> {
    type: 'act';
    providerId: WebviewKey;
    key: K;
    params: T[K] extends (...args: any[]) => any ? Parameters<T[K]> : never;
}

export type BasePatches<A> = {
    [K in keyof A]-?: unknown;
};

// export type Patches<A, T extends BasePatches<A>> = T;

export interface Patch<A extends Actions, K extends keyof A = keyof A> {
    type: 'patch';
    providerId: WebviewKey;
    key: K;
    patch: Patches<A>[K];
}
export interface Actions {
    [key: string]: (...args: any[]) => any;
}

export type Patches<A extends Actions> = {
    [K in keyof A]: ReturnType<A[K]>;
};

export interface StateWrapper<S> {
    type: 'state';
    state: S;
    providerId: WebviewKey;
}

export function isMyActionMessage<T extends Actions>(
    msg: any,
    providerId: string
): msg is Action<T> {
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

export type StateReducer<S, A extends Actions, K extends keyof A = keyof A> = {
    [Key in K]: (prevState: S, patch: ReturnType<Patches<A>[Key]>) => S;
};

type IsAny<T> = 0 extends 1 & T ? true : false;

type KnownKeys<T> = keyof {
    [K in keyof T as string extends K
        ? never
        : number extends K
          ? never
          : symbol extends K
            ? never
            : K]: unknown;
};

export type IpcProviderCall<T> = {
    [P in FnKeys<T>]: {
        key: P;
        params: T[P] extends (...a: infer A) => any ? A : never;
    };
}[FnKeys<T>];

export type IpcProviderResult<A extends Actions> = {
    [K in FnKeys<A>]: Patches<A>[K];
}[FnKeys<A>];
