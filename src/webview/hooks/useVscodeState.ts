import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWebviewApi } from '../contexts/WebviewContext';
import {
    ACT,
    type Patch,
    PATCH,
    type Action,
    type WebviewKey,
    type StateReducer,
    isFnKey,
} from '../../types/ipcReducer';

type PostAction<A extends object> = Pick<Action<A>, 'key' | 'params'>;

function isMyPatchMessage<A extends object>(msg: any, id: WebviewKey): msg is Patch<A> {
    return (
        msg !== undefined &&
        typeof msg === 'object' &&
        'providerId' in msg &&
        'type' in msg &&
        'key' in msg &&
        'patch' in msg &&
        msg.type === PATCH &&
        typeof msg.providerId === 'string' &&
        msg.providerId === id
    );
}

const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);

export function useVscodeState<S, A extends object>(
    providerId: WebviewKey,
    postReducer: StateReducer<S, A>,
    initialState: S | (() => S)
): readonly [S, A] {
    const [state, setState] = useState<S>(
        typeof initialState === 'function' ? (initialState as () => S)() : initialState
    );
    const { vscode } = useWebviewApi();
    const validKeys = useMemo(
        () => new Set(Object.keys(postReducer).filter(k => !dangerousKeys.has(k))),
        [postReducer]
    );

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            const { data } = event;
            if (isMyPatchMessage<A>(data, providerId)) {
                if (
                    validKeys.has(String(data.key)) &&
                    Object.prototype.hasOwnProperty.call(postReducer, data.key) &&
                    typeof postReducer[data.key] === 'function'
                ) {
                    const patchFn = postReducer[data.key];
                    setState(prev => patchFn(prev, data.patch));
                } else {
                    throw new Error(
                        `Could not find a function for ${String(data.key)} in postReducer`
                    );
                }
            }
        };
        window.addEventListener('message', handler);
        return () => {
            window.removeEventListener('message', handler);
        };
    }, [postReducer, providerId]);

    const postAction = useCallback(
        (arg: PostAction<A>) => {
            if (vscode === undefined) {
                throw new Error('Vscode api is undefined');
            }

            vscode.postMessage({
                type: ACT,
                providerId: providerId,
                key: arg.key,
                params: arg.params,
            } satisfies Action<A>);
        },
        [vscode, providerId]
    );

    const actor = new Proxy({} as A, {
        get(_, prop) {
            if (typeof prop !== 'string' && typeof prop !== 'symbol') {
                throw new Error(`Invalid action type: ${String(prop)}`);
            }
            if (typeof prop === 'string' && dangerousKeys.has(prop)) {
                throw new Error(`Dangerous action key is blocked: ${prop}`);
            }
            if (!isFnKey(prop, postReducer)) {
                throw new Error(`Unknown or invalid action: ${String(prop)}`);
            }
            return (...args: unknown[]) => {
                const params = args as A[typeof prop] extends (...args: unknown[]) => any
                    ? Parameters<A[typeof prop]>
                    : never;

                postAction({
                    key: prop,
                    params,
                } satisfies PostAction<A>);
            };
        },
    });

    return [state, actor] as const;
}
