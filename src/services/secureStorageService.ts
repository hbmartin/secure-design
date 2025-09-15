import { assertRecordStringString, type StorageAdapter } from 'ai-sdk-react-model-picker';
import type { WorkspaceStateService } from './workspaceStateService';

export class SecureStorageService implements StorageAdapter {
    constructor(private readonly workspaceState: WorkspaceStateService) {}
    get(key: string): PromiseLike<Record<string, string> | undefined> {
        console.log(`SSS get: ${key}`);
        return this.workspaceState.secureGet(key).then(result => {
            if (result !== undefined) {
                try {
                    const parsed = JSON.parse(result);
                    assertRecordStringString(parsed as unknown);
                    return parsed;
                } catch (error) {
                    console.error(`Could not retrieve secure key ${key}`, { error });
                }
            }
            return undefined;
        });
    }
    set(key: string, value: Record<string, string>): PromiseLike<void> {
        console.log(`SSS set: ${key}`, value);
        return this.workspaceState.secureSet(key, JSON.stringify(value));
    }
    remove(key: string): PromiseLike<void> {
        return this.workspaceState.secureRemove(key);
    }
}
