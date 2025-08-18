import * as vscode from 'vscode';
import type { ProviderId } from './types';
import { ProviderService } from './ProviderService';

export const PROVIDER_KEY = 'aiModelProvider';

export function getProvider(): ProviderId {
    const config = vscode.workspace.getConfiguration(ProviderService.getInstance().configPrefix);
    const stored = config.get<string>(PROVIDER_KEY);
    return stored !== undefined ? (stored as ProviderId) : ProviderService.defaultProvider;
}
