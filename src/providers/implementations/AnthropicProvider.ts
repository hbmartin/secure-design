/**
 * Anthropic Provider Implementation
 * Handles Anthropic's Claude models
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { AIProvider } from '../types';
import type { 
  ProviderMetadata, 
  ModelConfig, 
  ProviderConfig, 
  ValidationResult, 
  ModelDetectionParams, 
  ProviderInstanceParams 
} from '../types';

export class AnthropicProvider extends AIProvider {
  readonly metadata: ProviderMetadata = {
    id: 'anthropic',
    name: 'Anthropic',
    apiKeyConfigKey: 'anthropicApiKey',
    configureCommand: 'securedesign.configureApiKey',
    description: 'Anthropic Claude models for conversational AI',
    documentationUrl: 'https://docs.anthropic.com/'
  };

  readonly models: ModelConfig[] = [
    {
      id: 'claude-4-opus-20250514',
      displayName: 'Claude 4 Opus',
      maxTokens: 200000,
      supportsVision: true
    },
    {
      id: 'claude-4-sonnet-20250514',
      displayName: 'Claude 4 Sonnet',
      maxTokens: 200000,
      supportsVision: true
    },
    {
      id: 'claude-3-7-sonnet-20250219',
      displayName: 'Claude 3.7 Sonnet',
      maxTokens: 200000,
      supportsVision: true
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      displayName: 'Claude 3.5 Sonnet',
      isDefault: true,
      maxTokens: 200000,
      supportsVision: true
    },
    {
      id: 'claude-3-opus-20240229',
      displayName: 'Claude 3 Opus',
      maxTokens: 200000,
      supportsVision: true
    },
    {
      id: 'claude-3-sonnet-20240229',
      displayName: 'Claude 3 Sonnet',
      maxTokens: 200000,
      supportsVision: true
    },
    {
      id: 'claude-3-haiku-20240307',
      displayName: 'Claude 3 Haiku',
      maxTokens: 200000,
      supportsVision: true
    }
  ];

  detectFromModel(params: ModelDetectionParams): boolean {
    return params.model.startsWith('claude-');
  }

  createInstance(params: ProviderInstanceParams): any {
    const apiKey = params.config.config.get<string>(this.metadata.apiKeyConfigKey);
    if (!apiKey) {
      throw new Error(this.getCredentialsErrorMessage());
    }

    params.config.outputChannel.appendLine('Anthropic API key is configured.');

    const anthropic = createAnthropic({
      apiKey
    });

    params.config.outputChannel.appendLine(`Using Anthropic model: ${params.model}`);
    return anthropic(params.model);
  }

  validateCredentials(config: ProviderConfig): ValidationResult {
    const apiKey = config.config.get<string>(this.metadata.apiKeyConfigKey);
    
    if (!apiKey) {
      return {
        isValid: false,
        error: 'Anthropic API key is not configured'
      };
    }

    // Anthropic API key prefix validation is now a warning, not a blocker.
    // See Anthropic documentation for current formats: https://docs.anthropic.com/claude/reference/authentication
    let warning: string | undefined;
    if (!apiKey.startsWith('sk-ant-')) {
      warning = 'Warning: Anthropic API keys usually start with "sk-ant-". Please verify your key format with the official documentation.';
    }
    // Validation passes, but may include a warning.
    return {
      isValid: true,
      warning
    };

    if (apiKey.length < 20) {
      return {
        isValid: false,
        error: 'Anthropic API key appears to be too short'
      };
    }

    return {
      isValid: true
    };
  }
}