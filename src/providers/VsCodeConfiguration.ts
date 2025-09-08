import * as vscode from 'vscode';
import type { ModelConfigWithProvider, ProviderId } from './types';
import { ProviderService } from './ProviderService';

export const PROVIDER_KEY = 'aiModelProvider';
export const MODEL_KEY = 'aiModel';

export function getProvider(): ProviderId {
    const service = ProviderService.getInstance();
    const config = vscode.workspace.getConfiguration(service.configPrefix);
    const stored = config.get<string>(PROVIDER_KEY);
    if (stored === undefined) {
        return ProviderService.defaultProvider;
    }
    try {
        // Validate against the registry; fall back if unknown
        service.getProviderMetadata(stored as ProviderId);
        return stored as ProviderId;
    } catch {
        return ProviderService.defaultProvider;
    }
}

export function getModel(): ModelConfigWithProvider {
    const service = ProviderService.getInstance();
    const provider = getProvider();
    const config = vscode.workspace.getConfiguration(service.configPrefix);
    const stored = config.get<string>(MODEL_KEY);
    const modelsWithProvider =
        stored === undefined
            ? service.getDefaultModelForProvider(getProvider())
            : service.getModelForProvider(provider, stored);
    if (modelsWithProvider === undefined) {
        throw new Error(`No stored model and no default model set for ${provider}`);
    }
    return modelsWithProvider;
}

export async function setModel(providerId: ProviderId, modelId: string): Promise<void> {
    const service = ProviderService.getInstance();
    const config = vscode.workspace.getConfiguration(service.configPrefix);
    const mcwp = service.getModelForProvider(providerId, modelId);
    if (!mcwp) {
        throw new Error(`Model "${modelId}" is not registered for provider "${providerId}"`);
    }
    await Promise.all([
        config.update(PROVIDER_KEY, providerId, vscode.ConfigurationTarget.Global),
        config.update(MODEL_KEY, modelId, vscode.ConfigurationTarget.Global),
    ]);
}
