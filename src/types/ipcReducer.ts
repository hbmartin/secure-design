import type { Brand } from '../providers/types';

export type WebviewKey = Brand<string, 'WebviewKey'>;

export const PATCH = 'patch';
export const ACT = 'act';

export type FnKeys<T> = {
    [K in keyof T]: T[K] extends (...args: unknown[]) => any ? K : never;
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
export interface Action<T extends Actions, K extends FnKeys<T> = FnKeys<T>> {
    readonly type: typeof ACT;
    readonly providerId: WebviewKey;
    readonly key: K;
    readonly params: T[K] extends (...a: infer A) => any ? Readonly<A> : never;
}

export interface Patch<A extends Actions, K extends FnKeys<A> = FnKeys<A>> {
    readonly type: typeof PATCH;
    readonly providerId: WebviewKey;
    readonly key: K;
    readonly patch: Patches<A>[K];
}
export interface Actions {
    [key: string]: (...args: any[]) => any;
}

type Patches<A extends Actions> = {
    [K in FnKeys<A>]: ReturnType<A[K]>;
};

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

export type StateReducer<S, A extends Actions, K extends FnKeys<A> = FnKeys<A>> = {
    [Key in K]: (prevState: S, patch: Patches<A>[Key]) => S;
};

export type IpcProviderCall<T extends Actions> = {
    [P in FnKeys<T>]: {
        readonly key: P;
        readonly params: T[P] extends (...a: infer A) => any ? Readonly<A> : never;
    };
}[FnKeys<T>];

export type IpcProviderResult<A extends Actions> = {
    [K in FnKeys<A>]: Patches<A>[K];
}[FnKeys<A>];

export interface IpcProviderCallFor<A extends Actions, K extends FnKeys<A>> {
    readonly key: K;
    readonly params: Readonly<Parameters<A[K]>>;
}

export type IpcProviderResultFor<A extends Actions, K extends FnKeys<A>> = Patches<A>[K];
