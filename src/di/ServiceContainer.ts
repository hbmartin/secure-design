import type * as vscode from 'vscode';
import { CustomAgentService } from '../services/customAgentService';
import { WorkspaceStateService } from '../services/workspaceStateService';
import { ChatController } from '../chat/ChatController';
import ChatMessagesRepository from '../chat/ChatMessagesRepository';
import { getLogger, WebviewApiProvider } from 'react-vscode-webview-ipc/host';
import { ChatSidebarProvider } from '../providers/chatSidebarProvider';
import type { ChatViewEvents } from '../api/viewApi';

/**
 * Service container for dependency injection
 * Resolves circular dependencies and provides clean service creation
 */
export class ServiceContainer implements vscode.Disposable {
    private readonly services = new Map<string, any>();
    private readonly logger = getLogger('ServiceContainer');

    constructor(private readonly context: vscode.ExtensionContext) {}

    /**
     * Initialize all services in the correct order
     */
    initialize(): void {
        this.logger.info('Initializing ServiceContainer...');

        // WSS is initialized in extension.ts
        const workspaceStateService = WorkspaceStateService.getInstance();
        const customAgent = new CustomAgentService(workspaceStateService);

        this.services.set('workspaceStateService', workspaceStateService);
        this.services.set('customAgent', customAgent);

        // Initialize repository
        const chatMessagesRepository = new ChatMessagesRepository(workspaceStateService);
        this.services.set('chatMessagesRepository', chatMessagesRepository);

        const chatApiProvider = new WebviewApiProvider<ChatViewEvents>();
        this.services.set('apiProvider', chatApiProvider);

        // Create ChatController with apiProvider as EventTrigger
        const chatController = new ChatController(
            customAgent,
            chatApiProvider, // apiProvider implements EventTrigger interface
            chatMessagesRepository,
            workspaceStateService
        );
        this.services.set('chatController', chatController);

        // Create UI providers
        const sidebarProvider = new ChatSidebarProvider(
            this.context.extensionUri,
            chatApiProvider,
            chatController,
            chatMessagesRepository
        );
        this.services.set('sidebarProvider', sidebarProvider);

        this.logger.info('ServiceContainer initialization complete');
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
        this.logger.info('Disposing ServiceContainer...');

        for (const [name, service] of this.services) {
            if (service && typeof service.dispose === 'function') {
                try {
                    service.dispose();
                    this.logger.debug(`Disposed service: ${name}`);
                } catch (error) {
                    this.logger.error(`Error disposing service ${name}: ${error}`);
                }
            }
        }

        this.services.clear();
        this.logger.info('ServiceContainer disposed');
    }
}
