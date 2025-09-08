import { type RefObject, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../types';

interface UseDebouncedSaveOptions {
    /** Debounce delay in milliseconds */
    delay?: number;
    /** Whether the save mechanism is ready */
    isReady?: boolean;
    /** Whether initial data has been loaded */
    hasLoadedInitialData?: boolean;
    /** Whether currently saving */
    isSaving?: boolean;
}

interface UseDebouncedSaveResult {
    /** Whether currently saving */
    isSaving: boolean;
    /** Reference to the last saved data (JSON string) */
    lastSavedRef: RefObject<string>;
}

/**
 * Custom hook for debounced saving of chat history with proper guards
 * Prevents saving until initial data is loaded and handles workspace changes
 */
export function useDebouncedSave(
    data: ChatMessage[],
    saveFunction: (data: ChatMessage[]) => Promise<any>,
    options: UseDebouncedSaveOptions = {}
): UseDebouncedSaveResult {
    const {
        delay = 500,
        isReady = true,
        hasLoadedInitialData = true,
        isSaving: externalIsSaving = false,
    } = options;

    const [isSaving, setIsSaving] = useState(false);
    const saveTimeoutReference = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedReference = useRef<string>('');

    useEffect(() => {
        // Only save if all conditions are met:
        // 1. Save mechanism is ready (e.g., webview ready, initialized)
        // 2. Initial data has been loaded (prevents saving empty state)
        // 3. Not currently saving externally
        // 4. Content has actually changed
        if (isReady && hasLoadedInitialData && !externalIsSaving) {
            // Check if content has actually changed
            const currentDataString = JSON.stringify(data);
            if (currentDataString === lastSavedReference.current) {
                // No actual changes, skip save
                return;
            }

            // Clear any existing timeout
            if (saveTimeoutReference.current) {
                clearTimeout(saveTimeoutReference.current);
            }

            // Set a new timeout to save after the specified delay
            saveTimeoutReference.current = setTimeout(() => {
                // Snapshot data at debounce time to avoid stale closure
                const dataToSave = data;
                const dataString = JSON.stringify(dataToSave);

                // Guard against workspace changes by checking if we're still in valid state
                if (!hasLoadedInitialData) {
                    // Workspace likely changed, bail out
                    saveTimeoutReference.current = null;
                    return;
                }

                // Double-check content changed before saving
                if (dataString !== lastSavedReference.current) {
                    setIsSaving(true);
                    lastSavedReference.current = dataString;

                    saveFunction(dataToSave)
                        .catch(error => {
                            console.error('Failed to save data:', error);
                            // Reset saved reference on error so it can be retried
                            lastSavedReference.current = '';
                        })
                        .finally(() => {
                            setIsSaving(false);
                        });
                }
                saveTimeoutReference.current = null;
            }, delay);
        }

        // Cleanup on unmount or dependency change
        return () => {
            if (saveTimeoutReference.current) {
                clearTimeout(saveTimeoutReference.current);
            }
        };
    }, [data, saveFunction, delay, isReady, hasLoadedInitialData, externalIsSaving]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutReference.current) {
                clearTimeout(saveTimeoutReference.current);
            }
        };
    }, []);

    return {
        isSaving,
        lastSavedRef: lastSavedReference,
    };
}
