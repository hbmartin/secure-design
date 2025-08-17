interface Command {
    command: string;
}

export interface ChangeProvider extends Command {
    command: 'changeProvider';
    model: string;
    providerId: string;
}

export function ChangeProvider(model: string, providerId: string): ChangeProvider {
    return {
        command: 'changeProvider',
        model,
        providerId
    };
}