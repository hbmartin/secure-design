import type * as vscode from 'vscode';
import { CustomAgentService } from '../services/customAgentService';
import { WorkspaceStateService } from '../services/workspaceStateService';
import { ChatController } from '../chat/ChatController';
import ChatMessagesRepository from '../chat/ChatMessagesRepository';
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
        const customAgent = new CustomAgentService(workspaceStateService);

        this.services.set('workspaceStateService', workspaceStateService);
        this.services.set('customAgent', customAgent);

        // Initialize repository
        const chatMessagesRepository = new ChatMessagesRepository(workspaceStateService);
        this.services.set('chatMessagesRepository', chatMessagesRepository);

        const apiProvider = new WebviewApiProvider();
        this.services.set('apiProvider', apiProvider);

        // Create ChatController with apiProvider as EventTrigger
        const chatController = new ChatController(
            customAgent,
            apiProvider, // apiProvider implements EventTrigger interface
            chatMessagesRepository,
            workspaceStateService
        );
        this.services.set('chatController', chatController);

        // Create UI providers
        const sidebarProvider = new ChatSidebarProvider(
            this.context.extensionUri,
            apiProvider,
            chatController,
            chatMessagesRepository
        );
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
