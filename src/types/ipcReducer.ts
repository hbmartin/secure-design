import type { Brand } from '../providers/types';

export type WebviewKey = Brand<string, 'WebviewKey'>;

export const PATCH = 'patch';
export const ACT = 'act';

type FnKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never
}[keyof T];

export function isFnKey<T extends object>(prop: string | symbol| number, obj: T): prop is FnKeys<T> {
    return prop in obj && typeof obj[prop as keyof T] === 'function';
}
export interface Action<T extends Actions, K extends FnKeys<T> = FnKeys<T>> {
    type: 'act';
    providerId: WebviewKey;
    key: K;
    params: Patches<T>[K];
}

export interface Patch<A extends Actions, K extends FnKeys<A> = FnKeys<A>> {
    type: 'patch';
    providerId: WebviewKey;
    key: K;
    patch: Patches<A>[K];
}
export interface Actions {
    [key: string]: (...args: any[]) => any;
}

export type Patches<A extends Actions> = {
  [K in FnKeys<A>]: ReturnType<A[K]>;
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

export type StateReducer<S, A extends Actions, K extends FnKeys<A> = FnKeys<A>> = {
    [Key in K]: (prevState: S, patch: Patches<A>[Key]) => S;
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
