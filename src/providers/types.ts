/**
 * Provider System Types
 * Defines the interfaces and types for the AI provider registry system
 */

import type * as vscode from 'vscode';

/**
 * Supported AI provider identifiers
 */
export type ProviderId = 'anthropic' | 'openai' | 'openrouter' | 'google' | 'bedrock' | 'moonshot';

/**
 * Configuration for a specific AI model
 */
export interface ModelConfig {
    /** Unique model identifier (e.g., 'claude-3-5-sonnet-20241022') */
    id: string;
    /** Human-readable model name (e.g., 'Claude 3.5 Sonnet') */
    displayName: string;
    /** Whether this is the default model for the provider */
    isDefault?: boolean;
    /** Maximum tokens supported by the model */
    maxTokens?: number;
    /** Whether the model supports vision/images */
    supportsVision?: boolean;
    /** Additional model-specific configuration */
    metadata?: Record<string, any>;
}

/**
 * Provider configuration from VS Code settings
 */
export interface ProviderConfig {
    /** VS Code configuration object */
    config: vscode.WorkspaceConfiguration;
    /** Output channel for logging */
    outputChannel: vscode.OutputChannel;
}

/**
 * Credentials validation result
 */
export interface ValidationResult {
    /** Whether credentials are valid */
    isValid: boolean;
    /** Error message if validation failed */
    error?: string;
    /** Warning message for partial validation */
    warning?: string;
}

/**
 * Provider metadata and configuration
 */
export interface ProviderMetadata {
    /** Unique provider identifier */
    id: ProviderId;
    /** Human-readable provider name */
    name: string;
    /** VS Code setting key for the primary API key */
    apiKeyConfigKey: string;
    /** VS Code command to configure this provider */
    configureCommand: string;
    /** Additional configuration keys this provider requires */
    additionalConfigKeys?: string[];
    /** Provider description */
    description?: string;
    /** Provider documentation URL */
    documentationUrl?: string;
}

/**
 * Provider instance creation parameters
 */
export interface ProviderInstanceParams {
    /** The model to use */
    model: string;
    /** Provider configuration */
    config: ProviderConfig;
    /** Additional instance-specific options */
    options?: Record<string, any>;
}

/**
 * Model detection parameters
 */
export interface ModelDetectionParams {
    /** The model string to analyze */
    model: string;
    /** Current provider setting (for fallback) */
    currentProvider?: ProviderId;
}

/**
 * Abstract base class for AI providers
 * Implements the Strategy pattern for different AI service providers
 */
export abstract class AIProvider {
    /** Provider metadata */
    abstract readonly metadata: ProviderMetadata;

    /** Available models for this provider */
    abstract readonly models: ModelConfig[];

    /**
     * Detect if this provider should handle the given model
     * @param params Model detection parameters
     * @returns true if this provider handles the model
     */
    abstract detectFromModel(params: ModelDetectionParams): boolean;

    /**
     * Create an AI SDK model instance
     * @param params Provider instance parameters
     * @returns AI SDK model instance
     */
    abstract createInstance(params: ProviderInstanceParams): any;

    /**
     * Validate provider credentials
     * @param config Provider configuration
     * @returns Validation result
     */
    abstract validateCredentials(config: ProviderConfig): ValidationResult;

    /**
     * Get the default model for this provider
     * @returns Default model configuration
     */
    getDefaultModel(): ModelConfig {
        const defaultModel = this.models.find(m => m.isDefault);
        if (!defaultModel) {
            throw new Error(`No default model defined for provider ${this.metadata.id}`);
        }
        return defaultModel;
    }

    /**
     * Get model configuration by ID
     * @param modelId Model identifier
     * @returns Model configuration or undefined if not found
     */
    getModel(modelId: string): ModelConfig | undefined {
        return this.models.find(m => m.id === modelId);
    }

    /**
     * Get human-readable display name for a model
     * @param modelId Model identifier
     * @returns Display name or the model ID if not found
     */
    getModelDisplayName(modelId: string): string {
        const model = this.getModel(modelId);
        return model?.displayName || modelId;
    }

    /**
     * Check if provider has required credentials configured
     * @param config Provider configuration
     * @returns true if credentials are present
     */
    hasCredentials(config: ProviderConfig): boolean {
        const primaryKey = config.config.get<string>(this.metadata.apiKeyConfigKey);
        if (!primaryKey) {
            return false;
        }

        // Check additional config keys if any
        if (this.metadata.additionalConfigKeys) {
            return this.metadata.additionalConfigKeys.every(key => config.config.get<string>(key));
        }

        return true;
    }

    /**
     * Get provider-specific error message for missing credentials
     * @returns Error message string
     */
    getCredentialsErrorMessage(): string {
        return `${this.metadata.name} credentials not configured. Please run "${this.metadata.configureCommand}" command.`;
    }
}

/**
 * Provider registry interface
 */
export interface IProviderRegistry {
    /**
     * Register a provider
     * @param provider Provider instance to register
     */
    register(provider: AIProvider): void;

    /**
     * Get provider by ID
     * @param providerId Provider identifier
     * @returns Provider instance or undefined
     */
    getProvider(providerId: ProviderId): AIProvider | undefined;

    /**
     * Get provider that should handle the given model
     * @param params Model detection parameters
     * @returns Provider instance or undefined
     */
    getProviderForModel(params: ModelDetectionParams): AIProvider | undefined;

    /**
     * Get all registered providers
     * @returns Array of all providers
     */
    getAllProviders(): AIProvider[];

    /**
     * Get all available models across all providers
     * @returns Array of all model configurations
     */
    getAllModels(): ModelConfig[];
}

/**
 * Provider service interface for high-level operations
 */
export interface IProviderService {
    /**
     * Create a model instance for the given model string
     * @param model Model identifier
     * @param config Provider configuration
     * @returns AI SDK model instance
     */
    createModel(model: string, config: ProviderConfig): any;

    /**
     * Get provider metadata for a model
     * @param model Model identifier
     * @returns Provider metadata
     */
    getProviderForModel(model: string): ProviderMetadata | undefined;

    /**
     * Validate credentials for a specific model
     * @param model Model identifier
     * @param config Provider configuration
     * @returns Validation result
     */
    validateCredentialsForModel(model: string, config: ProviderConfig): ValidationResult;

    /**
     * Get display name for a model
     * @param model Model identifier
     * @returns Human-readable model name
     */
    getModelDisplayName(model: string): string;

    /**
     * Get all available providers
     * @returns Array of provider metadata
     */
    getAvailableProviders(): ProviderMetadata[];

    /**
     * Get all available models
     * @returns Array of model configurations with provider info
     */
    getAvailableModels(): Array<ModelConfig & { providerId: ProviderId }>;
}
