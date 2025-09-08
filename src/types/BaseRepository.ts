type Listener<T> = (data: T) => void;
type Unsubscribe = () => void;

class BaseRepository<Data> {
    protected data: Data;
    private readonly listeners: Set<Listener<Data>> = new Set();

    constructor(initialData: Data) {
        this.data = initialData;
    }

    /**
     * Subscribe to data changes
     * @param listener Callback function that will be called with new data
     * @returns Unsubscribe function to remove the listener
     */
    subscribe(listener: Listener<Data>): Unsubscribe {
        this.listeners.add(listener);

        // Return unsubscribe function
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Get the current data
     */
    protected getData(): Data {
        return this.data;
    }

    /**
     * Update the data and notify all listeners
     * @param newData The new data to set
     */
    protected setData(newData: Data): void {
        if (this.data === newData) {
            return; // No change, skip notification
        }
        this.data = newData;
        this.notifyListeners();
    }

    /**
     * Notify all listeners of the current data
     */
    private notifyListeners(): void {
        for (const listener of this.listeners) {
            try {
                listener(this.data);
            } catch (error) {
                console.error(
                    `Failed to notify listener: ${listener.name ?? listener.toString()}`,
                    { error }
                );
            }
        }
    }
}

export default BaseRepository;
