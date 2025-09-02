import { getLogger } from '../services/logger';
import type { WorkspaceStateService } from '../services/workspaceStateService';
import type { ChatMessage } from '../types';
import BaseRepository from '../types/BaseRepository';

const CHAT_HISTORY_KEY_PREFIX = 'securedesign.chatHistory';

class ChatMessagesRepository extends BaseRepository<ChatMessage[] | undefined> {
    private readonly logger = getLogger('ChatMessagesRepository');
    constructor(private readonly workspace: WorkspaceStateService) {
        super(workspace.get(CHAT_HISTORY_KEY_PREFIX));
    }

    public async saveChatHistory(chatHistory: ChatMessage[]): Promise<void> {
        try {
            await this.workspace.update(
                CHAT_HISTORY_KEY_PREFIX,
                chatHistory.length > 0 ? chatHistory : undefined
            );
            super.setData(chatHistory);
        } catch (error) {
            this.logger.error('Failed to save chat history:', { error });
            throw error;
        }
    }

    public getChatHistory(): ChatMessage[] | undefined {
        return super.getData();
    }

    public async clearChatHistory(): Promise<void> {
        return this.saveChatHistory([]);
    }

    public async appendMessage(message: ChatMessage): Promise<void> {
        const history = this.getChatHistory();
        if (history !== undefined) {
            return this.saveChatHistory([...history, message]);
        }
        return this.saveChatHistory([message]);
    }
}

export default ChatMessagesRepository;
