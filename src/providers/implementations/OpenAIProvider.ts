/**
 * OpenAI Provider Implementation
 * Handles OpenAI's GPT models and compatible APIs
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

export class OpenAIProvider extends AIProvider {
    readonly metadata: ProviderMetadata = {
        id: 'openai',
        name: 'OpenAI',
        apiKeyConfigKey: 'openaiApiKey',
        configureCommand: 'securedesign.configureOpenAIApiKey',
        additionalConfigKeys: ['openaiUrl'], // Optional base URL for compatible APIs
        description: 'OpenAI GPT models and compatible APIs',
        documentationUrl: 'https://platform.openai.com/docs/',
    };

    readonly models: ModelConfig[] = [
        {
            id: 'gpt-4.1',
            displayName: 'GPT-4.1',
            maxTokens: 128000,
            supportsVision: true,
        },
        {
            id: 'gpt-4.1-mini',
            displayName: 'GPT-4.1 Mini',
            maxTokens: 128000,
            supportsVision: true,
        },
        {
            id: 'gpt-4.1-nano',
            displayName: 'GPT-4.1 Nano',
            maxTokens: 128000,
            supportsVision: false,
        },
        {
            id: 'gpt-4o',
            displayName: 'GPT-4o',
            isDefault: true,
            maxTokens: 128000,
            supportsVision: true,
        },
        {
            id: 'gpt-4o-mini',
            displayName: 'GPT-4o Mini',
            maxTokens: 128000,
            supportsVision: true,
        },
        {
            id: 'gpt-4-turbo',
            displayName: 'GPT-4 Turbo',
            maxTokens: 128000,
            supportsVision: true,
        },
        {
            id: 'gpt-4',
            displayName: 'GPT-4',
            maxTokens: 8192,
            supportsVision: false,
        },
        {
            id: 'gpt-3.5-turbo',
            displayName: 'GPT-3.5 Turbo',
            maxTokens: 16384,
            supportsVision: false,
        },
    ];


    createInstance(params: ProviderInstanceParams): any {
        const apiKey = params.config.config.get<string>(this.metadata.apiKeyConfigKey);
        const baseURL = params.config.config.get<string>('openaiUrl');

        if (!apiKey) {
            throw new Error(this.getCredentialsErrorMessage());
        }

        params.config.outputChannel.appendLine(
            `OpenAI API key found: ${apiKey.substring(0, 7)}...`
        );

        if (baseURL) {
            params.config.outputChannel.appendLine(`Using custom OpenAI base URL: ${baseURL}`);
        }

        const openai = createOpenAI({
            apiKey: apiKey,
            baseURL: baseURL || undefined,
        });

        params.config.outputChannel.appendLine(`Using OpenAI model: ${params.model}`);
        return openai(params.model);
    }

    validateCredentials(config: ProviderConfig): ValidationResult {
        const apiKey = config.config.get<string>(this.metadata.apiKeyConfigKey);
        const baseURL = config.config.get<string>('openaiUrl');

        if (!apiKey) {
            return {
                isValid: false,
                error: 'OpenAI API key is not configured',
            };
        }

        if (!apiKey.startsWith('sk-')) {
            return {
                isValid: false,
                error: 'OpenAI API keys should start with "sk-"',
            };
        }

        if (apiKey.length < 20) {
            return {
                isValid: false,
                error: 'OpenAI API key appears to be too short',
            };
        }

        // Validate base URL if provided
        if (baseURL) {
            try {
                new URL(baseURL);
                if (!baseURL.startsWith('http')) {
                    return {
                        isValid: false,
                        error: 'OpenAI base URL must start with http:// or https://',
                    };
                }
            } catch {
                return {
                    isValid: false,
                    error: 'OpenAI base URL is not a valid URL',
                };
            }
        }

        return {
            isValid: true,
            warning: baseURL
                ? "Using custom base URL - ensure it's compatible with OpenAI API"
                : undefined,
        };
    }
}
