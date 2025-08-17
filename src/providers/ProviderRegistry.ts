/**
 * Provider Registry Implementation
 * Central registry for managing AI providers using the Strategy pattern
 */

import type { 
  AIProvider, 
  IProviderRegistry, 
  ProviderId, 
  ModelConfig, 
  ModelDetectionParams 
} from './types';

/**
 * Central registry for AI providers
 * Implements the Registry pattern to manage multiple AI service providers
 */
export class ProviderRegistry implements IProviderRegistry {
  private providers = new Map<ProviderId, AIProvider>();
  
  /**
   * Register a new AI provider
   * @param provider The provider instance to register
   * @throws Error if provider ID is already registered
   */
  register(provider: AIProvider): void {
    const providerId = provider.metadata.id;
    
    if (this.providers.has(providerId)) {
      throw new Error(`Provider with ID '${providerId}' is already registered`);
    }
    
    this.providers.set(providerId, provider);
  }

  /**
   * Get provider by its ID
   * @param providerId The provider identifier
   * @returns Provider instance or undefined if not found
   */
  getProvider(providerId: ProviderId): AIProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Find the appropriate provider for a given model
   * Uses provider detection logic to determine which provider should handle the model
   * @param params Model detection parameters
   * @returns Provider instance or undefined if no provider can handle the model
   */
  getProviderForModel(params: ModelDetectionParams): AIProvider | undefined {
    // First, try explicit provider if specified
    if (params.currentProvider) {
      const explicitProvider = this.providers.get(params.currentProvider);
      if (explicitProvider?.detectFromModel(params)) {
        return explicitProvider;
      }
    }

    // Otherwise, find provider through detection
    for (const provider of this.providers.values()) {
      if (provider.detectFromModel(params)) {
        return provider;
      }
    }

    return undefined;
  }

  /**
   * Get all registered providers
   * @returns Array of all registered providers
   */
  getAllProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all available models across all providers
   * @returns Array of all model configurations with provider info
   */
  getAllModels(): Array<ModelConfig & { providerId: ProviderId }> {
    const allModels: Array<ModelConfig & { providerId: ProviderId }> = [];
    
    for (const provider of this.providers.values()) {
      for (const model of provider.models) {
        allModels.push({
          ...model,
          providerId: provider.metadata.id
        });
      }
    }
    
    return allModels;
  }

  /**
   * Get number of registered providers
   * @returns Number of registered providers
   */
  getProviderCount(): number {
    return this.providers.size;
  }

  /**
   * Check if a provider is registered
   * @param providerId Provider identifier to check
   * @returns true if provider is registered
   */
  hasProvider(providerId: ProviderId): boolean {
    return this.providers.has(providerId);
  }

  /**
   * Remove a provider from the registry
   * @param providerId Provider identifier to remove
   * @returns true if provider was removed, false if not found
   */
  unregister(providerId: ProviderId): boolean {
    return this.providers.delete(providerId);
  }

  /**
   * Clear all registered providers
   */
  clear(): void {
    this.providers.clear();
  }

  /**
   * Get provider IDs
   * @returns Array of registered provider IDs
   */
  getProviderIds(): ProviderId[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Find providers that support a specific feature
   * @param featureCheck Function to check if provider supports the feature
   * @returns Array of providers that support the feature
   */
  findProvidersByFeature(featureCheck: (provider: AIProvider) => boolean): AIProvider[] {
    return Array.from(this.providers.values()).filter(featureCheck);
  }

  /**
   * Get providers that support vision/multimodal capabilities
   * @returns Array of providers with vision-capable models
   */
  getVisionCapableProviders(): AIProvider[] {
    return this.findProvidersByFeature(provider => 
      provider.models.some(model => model.supportsVision)
    );
  }

  /**
   * Get default model for a provider
   * @param providerId Provider identifier
   * @returns Default model configuration or undefined if provider not found
   */
  getDefaultModelForProvider(providerId: ProviderId): ModelConfig | undefined {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return undefined;
    }
    
    try {
      return provider.getDefaultModel();
    } catch {
      return undefined;
    }
  }

  /**
   * Validate registry state
   * @returns Array of validation errors, empty if valid
   */
  validate(): string[] {
    const errors: string[] = [];
    
    if (this.providers.size === 0) {
      errors.push('No providers registered');
    }
    
    for (const provider of this.providers.values()) {
      // Check if provider has at least one model
      if (provider.models.length === 0) {
        errors.push(`Provider '${provider.metadata.id}' has no models defined`);
      }
      
      // Check if provider has a default model
      const hasDefault = provider.models.some(model => model.isDefault);
      if (!hasDefault) {
        errors.push(`Provider '${provider.metadata.id}' has no default model`);
      }
      
      // Check for duplicate model IDs within provider
      const modelIds = provider.models.map(m => m.id);
      const uniqueIds = new Set(modelIds);
      if (modelIds.length !== uniqueIds.size) {
        errors.push(`Provider '${provider.metadata.id}' has duplicate model IDs`);
      }
    }
    
    return errors;
  }
}