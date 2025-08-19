import { useEffect, useRef, useState } from 'react';
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
    lastSavedRef: React.MutableRefObject<string>;
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
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedRef = useRef<string>('');

    useEffect(() => {
        // Only save if all conditions are met:
        // 1. Save mechanism is ready (e.g., webview ready, initialized)
        // 2. Initial data has been loaded (prevents saving empty state)
        // 3. Not currently saving externally
        // 4. Content has actually changed
        if (isReady && hasLoadedInitialData && !externalIsSaving) {
            // Check if content has actually changed
            const currentDataStr = JSON.stringify(data);
            if (currentDataStr === lastSavedRef.current) {
                // No actual changes, skip save
                return;
            }

            // Clear any existing timeout
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }

            // Set a new timeout to save after the specified delay
            saveTimeoutRef.current = setTimeout(() => {
                // Snapshot data at debounce time to avoid stale closure
                const dataToSave = data;
                const dataStr = JSON.stringify(dataToSave);

                // Guard against workspace changes by checking if we're still in valid state
                if (!hasLoadedInitialData) {
                    // Workspace likely changed, bail out
                    saveTimeoutRef.current = null;
                    return;
                }

                // Double-check content changed before saving
                if (dataStr !== lastSavedRef.current) {
                    setIsSaving(true);
                    lastSavedRef.current = dataStr;

                    saveFunction(dataToSave)
                        .catch(error => {
                            console.error('Failed to save data:', error);
                            // Reset saved reference on error so it can be retried
                            lastSavedRef.current = '';
                        })
                        .finally(() => {
                            setIsSaving(false);
                        });
                }
                saveTimeoutRef.current = null;
            }, delay);
        }

        // Cleanup on unmount or dependency change
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [data, saveFunction, delay, isReady, hasLoadedInitialData, externalIsSaving]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    return {
        isSaving,
        lastSavedRef,
    };
}
