import type * as vscode from 'vscode';
import { assertRecordStringString, type StorageAdapter } from 'ai-sdk-react-model-picker';

export class SecureStorageService implements StorageAdapter {
    constructor(private readonly secrets: vscode.SecretStorage) {}
    get(key: string): PromiseLike<Record<string, string> | undefined> {
        return this.secrets.get(key).then(result => {
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
        return this.secrets.store(key, JSON.stringify(value));
    }
    remove(key: string): PromiseLike<void> {
        return this.secrets.delete(key);
    }
}
