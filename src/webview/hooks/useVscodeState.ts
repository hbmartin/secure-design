import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWebviewApi } from '../contexts/WebviewContext';
import {
    ACT,
    type Patch,
    PATCH,
    type Action,
    type WebviewKey,
    type StateReducer,
    isFnKey as isFunctionKey,
} from '../../types/ipcReducer';

type PostAction<A extends object> = Pick<Action<A>, 'key' | 'params'>;

function isMyPatchMessage<A extends object>(message: any, id: WebviewKey): message is Patch<A> {
    return (
        message !== null &&
        message !== undefined &&
        typeof message === 'object' &&
        'providerId' in message &&
        'type' in message &&
        'key' in message &&
        'patch' in message &&
        message.type === PATCH &&
        typeof message.providerId === 'string' &&
        message.providerId === id
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
                    const patchFunction = postReducer[data.key];
                    setState(previous => patchFunction(previous, data.patch));
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
        (argument: PostAction<A>) => {
            if (vscode === undefined) {
                throw new Error('Vscode api is undefined');
            }

            vscode.postMessage({
                type: ACT,
                providerId: providerId,
                key: argument.key,
                params: argument.params,
            } satisfies Action<A>);
        },
        [vscode, providerId]
    );

    const actor = new Proxy({} as A, {
        get(_, property) {
            if (typeof property !== 'string' && typeof property !== 'symbol') {
                throw new TypeError(`Invalid action type: ${String(property)}`);
            }
            if (typeof property === 'string' && dangerousKeys.has(property)) {
                throw new Error(`Dangerous action key is blocked: ${property}`);
            }
            if (!isFunctionKey(property, postReducer)) {
                throw new Error(`Unknown or invalid action: ${String(property)}`);
            }
            return (...arguments_: unknown[]) => {
                const parameters = arguments_ as A[typeof property] extends (...arguments_: unknown[]) => any
                    ? Parameters<A[typeof property]>
                    : never;

                postAction({
                    key: property,
                    params: parameters,
                } satisfies PostAction<A>);
            };
        },
    });

    return [state, actor] as const;
}
