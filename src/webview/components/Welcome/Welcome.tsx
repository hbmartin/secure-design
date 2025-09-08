import React from 'react';

interface WelcomeProperties {
    onGetStarted: () => void | Promise<void>;
}

const Welcome: React.FC<WelcomeProperties> = ({ onGetStarted }) => {
    const handleGetStarted = () => {
        void onGetStarted();
    };

    return (
        <div className='welcome-section'>
            <div className='welcome-header'>
                <div className='welcome-logo'>
                    <div className='logo-icon'>✨</div>
                    <h1>Welcome to SecureDesign</h1>
                </div>
                <p className='welcome-subtitle'>Your AI-powered canvas for rapid UI exploration</p>
            </div>

            <div className='welcome-actions'>
                <button onClick={handleGetStarted} className='btn-primary'>
                    Get Started
                </button>
            </div>
        </div>
    );
};

export default Welcome;
