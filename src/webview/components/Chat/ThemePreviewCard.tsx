import React, { useState, useEffect } from 'react';
import ThemePreviewHeader from './ThemePreviewHeader';
import ColorPalette from './ColorPalette';
import ThemePreview from './ThemePreview';
import ModeToggle from './ModeToggle';
import { parseThemeCSS, extractColorPalette, type ParsedTheme } from '../../utils/themeParser';
import type { GroupedColors } from './types';

interface ThemePreviewCardProps {
    themeName: string;
    currentCssContent: string | undefined;
    isLoadingCss: boolean;
    cssLoadError?: string;
}

const ThemePreviewCard: React.FC<ThemePreviewCardProps> = ({
    themeName,
    currentCssContent,
    isLoadingCss,
    cssLoadError,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [parsedTheme, setParsedTheme] = useState<ParsedTheme | null>(null);
    const [activeTab, setActiveTab] = useState<'theme' | 'components'>('theme');
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [cssParseError, setCssParseError] = useState<undefined | string>(undefined);

    // Pre-inject minimal CSS to avoid FOUC (Flash of Unstyled Content)
    useEffect(() => {
        const minimalCssId = 'theme-preview-minimal-css';
        const existingStyle = document.getElementById(minimalCssId);

        if (!existingStyle) {
            const minimalStyle = document.createElement('style');
            minimalStyle.id = minimalCssId;
            minimalStyle.textContent = `
        .theme-preview-live {
          background: var(--vscode-editor-background);
          color: var(--vscode-editor-foreground);
          font-family: var(--vscode-font-family);
          border-radius: 4px;
          overflow: hidden;
          min-height: 400px;
          border: 1px solid var(--vscode-panel-border);
        }
      `;
            document.head.appendChild(minimalStyle);
        }

        // Cleanup on unmount
        return () => {
            const styleToRemove = document.getElementById(minimalCssId);
            if (styleToRemove) {
                document.head.removeChild(styleToRemove);
            }
        };
    }, []);

    // Set initial loading state immediately when cssFilePath is provided
    useEffect(() => {
        if (currentCssContent) {
            setIsExpanded(true); // Auto-expand to show loading state
        }
    }, [currentCssContent]);

    // Parse CSS when content is available
    useEffect(() => {
        if (currentCssContent && !isLoadingCss) {
            try {
                const theme = parseThemeCSS(currentCssContent);
                setParsedTheme(theme);
            } catch (error) {
                console.error('Failed to parse theme:', error);
                setCssParseError('Failed to parse theme CSS');
            }
        }
    }, [currentCssContent, isLoadingCss]);

    const handleCopyCSS = () => {
        if (currentCssContent) {
            void navigator.clipboard.writeText(currentCssContent);
        }
    };

    const handleToggleExpanded = () => {
        setIsExpanded(!isExpanded);
    };

    // Convert parsed theme to grouped colors format
    const getGroupedColors = (theme: ParsedTheme): GroupedColors => {
        const palette = extractColorPalette(theme);
        return palette.reduce(
            (acc, color) => {
                if (!acc[color.category]) {
                    acc[color.category] = {};
                }
                acc[color.category][color.name] = color.value;
                return acc;
            },
            {} as Record<string, Record<string, string>>
        );
    };

    if (
        !parsedTheme &&
        !isLoadingCss &&
        cssLoadError !== undefined &&
        cssParseError !== undefined
    ) {
        return null;
    }

    return (
        <>
            <style>
                {`
          .theme-preview-tabs {
            display: flex;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-sideBar-background);
          }

          .theme-preview-tab {
            padding: 8px 12px;
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 11px;
            font-weight: 500;
            opacity: 0.7;
            transition: opacity 0.2s;
            border-bottom: 2px solid transparent;
          }

          .theme-preview-tab:hover {
            opacity: 1;
          }

          .theme-preview-tab.active {
            opacity: 1;
            border-bottom-color: var(--vscode-focusBorder);
          }

          .theme-preview-content {
            padding: 12px;
            background: var(--vscode-editor-background);
          }

          .component-preview-section {
            position: relative;
          }

          .component-preview-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          }

          .component-preview-title {
            font-size: 11px;
            font-weight: 500;
            color: var(--vscode-foreground);
            margin: 0;
          }

          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
            </style>
            <div>
                <ThemePreviewHeader
                    themeName={themeName}
                    isExpanded={isExpanded}
                    onToggleExpanded={handleToggleExpanded}
                    isLoading={isLoadingCss}
                    onCopyCSS={handleCopyCSS}
                />

                {isExpanded && (
                    <>
                        {/* Loading State */}
                        {isLoadingCss && (
                            <div className='theme-preview-content'>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '2rem',
                                        color: 'var(--vscode-descriptionForeground)',
                                        fontSize: '12px',
                                    }}
                                >
                                    <div style={{ marginRight: '8px' }}>
                                        <div
                                            className='loading-spinner'
                                            style={{
                                                width: '16px',
                                                height: '16px',
                                                border: '2px solid var(--vscode-progressBar-background)',
                                                borderTop:
                                                    '2px solid var(--vscode-progressBar-background)',
                                                borderRadius: '50%',
                                                animation: 'spin 1s linear infinite',
                                            }}
                                        />
                                    </div>
                                    Loading theme CSS...
                                </div>
                            </div>
                        )}

                        {/* Error State */}
                        {(cssLoadError !== undefined || cssParseError !== undefined) &&
                            !isLoadingCss && (
                                <div className='theme-preview-content'>
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            padding: '2rem',
                                            color: 'var(--vscode-errorForeground)',
                                            fontSize: '12px',
                                            backgroundColor:
                                                'var(--vscode-inputValidation-errorBackground)',
                                            border: '1px solid var(--vscode-inputValidation-errorBorder)',
                                            borderRadius: '4px',
                                            margin: '8px',
                                        }}
                                    >
                                        ⚠️ {cssLoadError ?? cssParseError}
                                    </div>
                                </div>
                            )}

                        {/* Normal Content */}
                        {!isLoadingCss &&
                            cssLoadError === undefined &&
                            cssParseError === undefined &&
                            parsedTheme && (
                                <>
                                    <div className='theme-preview-tabs'>
                                        <button
                                            className={`theme-preview-tab ${activeTab === 'theme' ? 'active' : ''}`}
                                            onClick={() => setActiveTab('theme')}
                                        >
                                            Theme
                                        </button>
                                        <button
                                            className={`theme-preview-tab ${activeTab === 'components' ? 'active' : ''}`}
                                            onClick={() => setActiveTab('components')}
                                        >
                                            UI Components
                                        </button>
                                    </div>

                                    <div className='theme-preview-content'>
                                        {activeTab === 'theme' && (
                                            <>
                                                {/* Typography Preview */}
                                                <div
                                                    style={{
                                                        marginBottom: '1rem',
                                                        padding: '0.75rem',
                                                        backgroundColor:
                                                            'var(--vscode-editor-background)',
                                                        border: '1px solid var(--vscode-panel-border)',
                                                        borderRadius: '4px',
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: '1fr 1fr 1fr',
                                                            gap: '1rem',
                                                            textAlign: 'center',
                                                        }}
                                                    >
                                                        <div>
                                                            <div
                                                                style={{
                                                                    fontSize: '10px',
                                                                    color: 'var(--vscode-descriptionForeground)',
                                                                    marginBottom: '0.25rem',
                                                                    fontWeight: 500,
                                                                }}
                                                            >
                                                                Sans
                                                            </div>
                                                            <div
                                                                style={{
                                                                    fontSize: '12px',
                                                                    color: 'var(--vscode-foreground)',
                                                                    fontFamily:
                                                                        parsedTheme.fonts?.sans ||
                                                                        'inherit',
                                                                }}
                                                            >
                                                                {parsedTheme.fonts?.sans
                                                                    ?.split(',')[0]
                                                                    ?.trim() || 'Default'}
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <div
                                                                style={{
                                                                    fontSize: '10px',
                                                                    color: 'var(--vscode-descriptionForeground)',
                                                                    marginBottom: '0.25rem',
                                                                    fontWeight: 500,
                                                                }}
                                                            >
                                                                Serif
                                                            </div>
                                                            <div
                                                                style={{
                                                                    fontSize: '12px',
                                                                    color: 'var(--vscode-foreground)',
                                                                    fontFamily:
                                                                        parsedTheme.fonts?.serif ||
                                                                        'inherit',
                                                                }}
                                                            >
                                                                {parsedTheme.fonts?.serif
                                                                    ?.split(',')[0]
                                                                    ?.trim() || 'Default'}
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <div
                                                                style={{
                                                                    fontSize: '10px',
                                                                    color: 'var(--vscode-descriptionForeground)',
                                                                    marginBottom: '0.25rem',
                                                                    fontWeight: 500,
                                                                }}
                                                            >
                                                                Mono
                                                            </div>
                                                            <div
                                                                style={{
                                                                    fontSize: '12px',
                                                                    color: 'var(--vscode-foreground)',
                                                                    fontFamily:
                                                                        parsedTheme.fonts?.mono ||
                                                                        'inherit',
                                                                }}
                                                            >
                                                                {parsedTheme.fonts?.mono
                                                                    ?.split(',')[0]
                                                                    ?.trim() || 'Default'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Color Palette */}
                                                <ColorPalette
                                                    colors={getGroupedColors(parsedTheme)}
                                                />
                                            </>
                                        )}

                                        {activeTab === 'components' && (
                                            <div className='component-preview-section'>
                                                <div className='component-preview-header'>
                                                    <h4 className='component-preview-title'>
                                                        Component Preview
                                                    </h4>
                                                    <ModeToggle
                                                        isDarkMode={isDarkMode}
                                                        onToggle={setIsDarkMode}
                                                    />
                                                </div>
                                                <ThemePreview
                                                    theme={parsedTheme}
                                                    isDarkMode={isDarkMode}
                                                    cssSheet={currentCssContent}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                    </>
                )}
            </div>
        </>
    );
};

export default ThemePreviewCard;
