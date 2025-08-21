import type * as vscode from 'vscode';
import { CustomAgentService } from '../services/customAgentService';
import { WorkspaceStateService } from '../services/workspaceStateService';
import { ProviderService } from '../providers/ProviderService';
import { ChatController } from '../controllers/ChatController';
import { WebviewApiProvider } from '../providers/WebviewApiProvider';
import { ChatSidebarProvider } from '../providers/chatSidebarProvider';
import { Logger } from '../services/logger';

/**
 * Service container for dependency injection
 * Resolves circular dependencies and provides clean service creation
 */
export class ServiceContainer implements vscode.Disposable {
    private readonly services = new Map<string, any>();

    constructor(private readonly context: vscode.ExtensionContext) {}

    /**
     * Initialize all services in the correct order
     */
    initialize(): void {
        Logger.info('Initializing ServiceContainer...');

        // Initialize base services first
        const workspaceStateService = WorkspaceStateService.getInstance();
        const providerService = ProviderService.getInstance();
        const customAgent = new CustomAgentService();

        this.services.set('workspaceStateService', workspaceStateService);
        this.services.set('providerService', providerService);
        this.services.set('customAgent', customAgent);

        // Create WebviewApiProvider first
        const apiProvider = new WebviewApiProvider(workspaceStateService);
        this.services.set('apiProvider', apiProvider);

        // Create ChatController with apiProvider as EventTrigger
        const chatController = new ChatController(
            customAgent,
            workspaceStateService,
            providerService,
            apiProvider // apiProvider implements EventTrigger interface
        );
        this.services.set('chatController', chatController);

        // Complete the wiring using proper initialization method
        apiProvider.initializeChatController(chatController);

        // Create UI providers
        const sidebarProvider = new ChatSidebarProvider(this.context.extensionUri, apiProvider);
        this.services.set('sidebarProvider', sidebarProvider);

        Logger.info('ServiceContainer initialization complete');
    }

    // setChatController method removed - now using proper initialization method

    /**
     * Get a service by name with type safety
     */
    get<T>(serviceName: string): T {
        const service = this.services.get(serviceName);
        if (!service) {
            throw new Error(`Service '${serviceName}' not found in container`);
        }
        return service as T;
    }

    /**
     * Check if a service exists
     */
    has(serviceName: string): boolean {
        return this.services.has(serviceName);
    }

    /**
     * Dispose all services that implement dispose
     */
    dispose(): void {
        Logger.info('Disposing ServiceContainer...');

        for (const [name, service] of this.services) {
            if (service && typeof service.dispose === 'function') {
                try {
                    service.dispose();
                    Logger.debug(`Disposed service: ${name}`);
                } catch (error) {
                    Logger.error(`Error disposing service ${name}: ${error}`);
                }
            }
        }

        this.services.clear();
        Logger.info('ServiceContainer disposed');
    }
}
