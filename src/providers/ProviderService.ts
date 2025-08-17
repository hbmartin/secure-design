/**
 * Provider Service Implementation
 * High-level service for managing AI providers and model operations
 */

import * as vscode from 'vscode';
import { ProviderRegistry } from './ProviderRegistry';
import { AnthropicProvider } from './implementations/AnthropicProvider';
import { OpenAIProvider } from './implementations/OpenAIProvider';
import { OpenRouterProvider } from './implementations/OpenRouterProvider';
import { GoogleProvider } from './implementations/GoogleProvider';
import { BedrockProvider } from './implementations/BedrockProvider';
import { MoonshotProvider } from './implementations/MoonshotProvider';
import type {
    IProviderService,
    ProviderConfig,
    ProviderMetadata,
    ValidationResult,
    ModelConfig,
    ProviderId,
} from './types';

/**
 * High-level service for AI provider operations
 * Provides a unified interface for working with different AI providers
 */
export class ProviderService implements IProviderService {
    private static instance: ProviderService;
    private readonly registry: ProviderRegistry;

    private constructor() {
        this.registry = new ProviderRegistry();
        this.initializeProviders();
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): ProviderService {
        if (!ProviderService.instance) {
            ProviderService.instance = new ProviderService();
        }
        return ProviderService.instance;
    }

    /**
     * Initialize all available providers
     */
    private initializeProviders(): void {
        try {
            // Register all provider implementations
            this.registry.register(new AnthropicProvider());
            this.registry.register(new OpenAIProvider());
            this.registry.register(new OpenRouterProvider());
            this.registry.register(new GoogleProvider());
            this.registry.register(new BedrockProvider());
            this.registry.register(new MoonshotProvider());

            // Validate registry
            const validationErrors = this.registry.validate();
            if (validationErrors.length > 0) {
                console.warn('Provider registry validation issues:', validationErrors);
            }
        } catch (error) {
            console.error('Failed to initialize providers:', error);
            throw new Error(`Provider initialization failed: ${error}`);
        }
    }

    /**
     * Create a model instance for the given model string
     */
    createModel(model: string, config: ProviderConfig): any {
        // Get current provider setting for fallback
        const currentProvider = config.config.get<string>('aiModelProvider') as ProviderId;

        const provider = this.registry.getProviderForModel({
            model,
            currentProvider,
        });

        if (!provider) {
            throw new Error(`No provider found for model: ${model}`);
        }

        // Validate credentials before creating instance
        const validation = provider.validateCredentials(config);
        if (!validation.isValid) {
            throw new Error(validation.error || 'Invalid credentials');
        }

        return provider.createInstance({ model, config });
    }

    /**
     * Get provider metadata for a model
     */
    getProviderForModel(model: string): ProviderMetadata | undefined {
        const config = vscode.workspace.getConfiguration('securedesign');
        const currentProvider = config.get<string>('aiModelProvider') as ProviderId;

        const provider = this.registry.getProviderForModel({
            model,
            currentProvider,
        });

        return provider?.metadata;
    }

    /**
     * Validate credentials for a specific model
     */
    validateCredentialsForModel(model: string, config: ProviderConfig): ValidationResult {
        const currentProvider = config.config.get<string>('aiModelProvider') as ProviderId;

        const provider = this.registry.getProviderForModel({
            model,
            currentProvider,
        });

        if (!provider) {
            return {
                isValid: false,
                error: `No provider found for model: ${model}`,
            };
        }

        return provider.validateCredentials(config);
    }

    /**
     * Get display name for a model
     */
    getModelDisplayName(model: string): string {
        const config = vscode.workspace.getConfiguration('securedesign');
        const currentProvider = config.get<string>('aiModelProvider') as ProviderId;

        const provider = this.registry.getProviderForModel({
            model,
            currentProvider,
        });

        if (!provider) {
            return model; // Fallback to model ID
        }

        return provider.getModelDisplayName(model);
    }

    /**
     * Get all available providers
     */
    getAvailableProviders(): ProviderMetadata[] {
        return this.registry.getAllProviders().map(provider => provider.metadata);
    }

    /**
     * Get all available models
     */
    getAvailableModels(): Array<ModelConfig & { providerId: ProviderId }> {
        return this.registry.getAllModels();
    }

    /**
     * Get provider by ID
     */
    getProvider(providerId: ProviderId): ProviderMetadata | undefined {
        const provider = this.registry.getProvider(providerId);
        return provider?.metadata;
    }

    /**
     * Get models for a specific provider
     */
    getModelsForProvider(providerId: ProviderId): ModelConfig[] {
        const provider = this.registry.getProvider(providerId);
        return provider?.models || [];
    }

    /**
     * Get default model for a provider
     */
    getDefaultModelForProvider(providerId: ProviderId): ModelConfig | undefined {
        return this.registry.getDefaultModelForProvider(providerId);
    }

    /**
     * Check if provider has required credentials
     */
    hasCredentials(providerId: ProviderId, config: ProviderConfig): boolean {
        const provider = this.registry.getProvider(providerId);
        if (!provider) {
            return false;
        }
        return provider.hasCredentials(config);
    }

    /**
     * Get providers that support vision/multimodal capabilities
     */
    getVisionCapableProviders(): ProviderMetadata[] {
        return this.registry.getVisionCapableProviders().map(provider => provider.metadata);
    }

    /**
     * Get provider registry for advanced operations
     */
    getRegistry(): ProviderRegistry {
        return this.registry;
    }

    /**
     * Detect provider from model string
     * This is the main entry point that replaces the scattered detection logic
     */
    detectProviderFromModel(model: string, currentProvider?: ProviderId): ProviderId | undefined {
        const provider = this.registry.getProviderForModel({
            model,
            currentProvider,
        });
        return provider?.metadata.id;
    }

    /**
     * Get error message for missing credentials
     */
    getCredentialsErrorMessage(providerId: ProviderId): string {
        const provider = this.registry.getProvider(providerId);
        if (!provider) {
            return `Provider ${providerId} not found`;
        }
        return provider.getCredentialsErrorMessage();
    }

    /**
     * Validate all providers and return summary
     */
    validateAllProviders(config: ProviderConfig): Array<{
        providerId: ProviderId;
        providerName: string;
        validation: ValidationResult;
    }> {
        const results: Array<{
            providerId: ProviderId;
            providerName: string;
            validation: ValidationResult;
        }> = [];

        for (const provider of this.registry.getAllProviders()) {
            results.push({
                providerId: provider.metadata.id,
                providerName: provider.metadata.name,
                validation: provider.validateCredentials(config),
            });
        }

        return results;
    }

    /**
     * Get registry statistics
     */
    getStats(): {
        providerCount: number;
        modelCount: number;
        visionCapableModels: number;
    } {
        const allModels = this.registry.getAllModels();

        return {
            providerCount: this.registry.getProviderCount(),
            modelCount: allModels.length,
            visionCapableModels: allModels.filter(model => model.supportsVision).length,
        };
    }
}
