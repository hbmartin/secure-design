/**
 * Moonshot Provider Implementation
 * Handles Moonshot AI's Kimi models
 */

import { createOpenAI } from '@ai-sdk/openai';
import {
    AIProvider,
    type ProviderMetadata,
    type ModelConfig,
    type ProviderConfig,
    type ValidationResult,
    type ProviderInstanceParams,
} from '../types';
import type { LanguageModel } from 'ai';

export class MoonshotProvider extends AIProvider {
    static readonly metadata: ProviderMetadata = {
        id: 'moonshot',
        name: 'Moonshot AI',
        apiKeyConfigKey: 'moonshotApiKey',
        configureCommand: 'securedesign.configureMoonshotApiKey',
        description: 'Moonshot AI Kimi models with long context capabilities',
        documentationUrl: 'https://platform.moonshot.cn/docs',
    };

    readonly models: ModelConfig[] = [
        {
            id: 'kimi-k2-0711-preview',
            displayName: 'Kimi K2 Preview',
            isDefault: true,
            maxTokens: 1000000,
            supportsVision: true,
        },
        {
            id: 'moonshot-v1-8k',
            displayName: 'Moonshot v1 8K',
            maxTokens: 8192,
            supportsVision: false,
        },
        {
            id: 'moonshot-v1-32k',
            displayName: 'Moonshot v1 32K',
            maxTokens: 32768,
            supportsVision: false,
        },
        {
            id: 'moonshot-v1-128k',
            displayName: 'Moonshot v1 128K',
            maxTokens: 131072,
            supportsVision: false,
        },
    ];

    createInstance(params: ProviderInstanceParams): LanguageModel {
        const apiKey = params.config.config.get<string>(MoonshotProvider.metadata.apiKeyConfigKey);
        if (!apiKey) {
            throw new Error(this.getCredentialsErrorMessage());
        }

        params.config.outputChannel.appendLine(
            `Moonshot API key found: ${apiKey.substring(0, 12)}...`
        );
        params.config.outputChannel.appendLine(
            'Using Moonshot API baseURL: https://api.moonshot.ai/v1'
        );

        const moonshot = createOpenAI({
            apiKey: apiKey,
            baseURL: 'https://api.moonshot.ai/v1',
        });

        params.config.outputChannel.appendLine(`Using Moonshot model: ${params.model}`);
        return moonshot(params.model);
    }

    validateCredentials(config: ProviderConfig): ValidationResult {
        const apiKey = config.config.get<string>(MoonshotProvider.metadata.apiKeyConfigKey);

        if (!apiKey) {
            return {
                isValid: false,
                error: 'Moonshot API key is not configured',
            };
        }

        if (!apiKey.startsWith('sk-')) {
            return {
                isValid: false,
                error: 'Moonshot API keys should start with "sk-"',
            };
        }

        if (apiKey.length < 20) {
            return {
                isValid: false,
                error: 'Moonshot API key appears to be too short',
            };
        }

        return {
            isValid: true,
        };
    }
}
