import { useState, useEffect } from 'react';

const FIRST_TIME_USER_KEY = 'securedesign-first-time-user';

export const useFirstTimeUser = () => {
    const [isFirstTime, setIsFirstTime] = useState<boolean>(true);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    useEffect(() => {
        try {
            const hasVisited = localStorage.getItem(FIRST_TIME_USER_KEY);
            const isFirstTimeUser = hasVisited === null;

            setIsFirstTime(isFirstTimeUser);
            setIsLoading(false);
        } catch (error) {
            console.warn('Failed to check first-time user status:', error);
            // If localStorage fails, assume not first time to avoid showing welcome repeatedly
            setIsFirstTime(false);
            setIsLoading(false);
        }
    }, []);

    const markAsReturningUser = () => {
        try {
            localStorage.setItem(FIRST_TIME_USER_KEY, 'visited');
            setIsFirstTime(false);
        } catch (error) {
            console.warn('Failed to mark user as returning user:', error);
        }
    };

    const resetFirstTimeUser = () => {
        try {
            localStorage.removeItem(FIRST_TIME_USER_KEY);
            setIsFirstTime(true);
        } catch (error) {
            console.warn('Failed to reset first-time user status:', error);
        }
    };

    return {
        isFirstTime,
        isLoading,
        markAsReturningUser,
        resetFirstTimeUser,
    };
};
