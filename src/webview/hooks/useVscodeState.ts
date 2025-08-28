import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWebviewApi } from '../contexts/WebviewContext';
import {
    ACT,
    type Patch,
    PATCH,
    type Action,
    type WebviewKey,
    type StateReducer,
    type BasePatches,
} from '../../types/ipcReducer';

type PostAction<S> = Pick<Action<S>, 'key' | 'params'>;

function isMyPatchMessage<P>(msg: any, id: WebviewKey): msg is Patch<P> {
    return (
        msg !== undefined &&
        typeof msg === 'object' &&
        'providerId' in msg &&
        'type' in msg &&
        'key' in msg &&
        msg.type === PATCH &&
        typeof msg.providerId === 'string' &&
        msg.providerId === id
    );
}

const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);

export function useVscodeState<S, A extends object, P extends BasePatches<A>>(
    providerId: WebviewKey,
    postReducer: StateReducer<S, P>,
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
            if (isMyPatchMessage<P>(data, providerId)) {
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
            if (!Object.prototype.hasOwnProperty.call(postReducer, prop)) {
                throw new Error(`Unknown action: ${String(prop)}`);
            }
            return (...args: any[]) => {
                const key = prop as keyof A;
                // Cast args to the correct parameter type for this specific method
                const params = args as A[keyof A] extends (...args: any[]) => any
                    ? Parameters<A[keyof A]>
                    : never;

                postAction({
                    key,
                    params,
                });
            };
        },
    });

    return [state, actor] as const;
}
