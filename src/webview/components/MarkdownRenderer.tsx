import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/vs2015.css'; // Dark theme that matches VS Code

interface MarkdownRendererProperties {
    content: string;
    className?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProperties> = ({ content, className }) => {
    return (
        <div className={`markdown-content ${className ?? ''}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                    // Custom rendering for code blocks
                    code: ({ className, children, ...properties }: any) => {
                        const match = /language-(\w+)/.exec(className ?? '');
                        const inline = !className?.includes('language-');
                        return !inline && match ? (
                            <pre className={`language-${match[1]} hljs`}>
                                <code className={className} {...properties}>
                                    {children}
                                </code>
                            </pre>
                        ) : (
                            <code className={`inline-code ${className ?? ''}`} {...properties}>
                                {children}
                            </code>
                        );
                    },
                    // Custom rendering for links to open externally
                    a: ({ children, href, ...properties }) => (
                        <a href={href} target='_blank' rel='noopener noreferrer' {...properties}>
                            {children}
                        </a>
                    ),
                    // Custom rendering for tables
                    table: ({ children, ...properties }) => (
                        <div className='table-wrapper'>
                            <table {...properties}>{children}</table>
                        </div>
                    ),
                    // Custom rendering for blockquotes
                    blockquote: ({ children, ...properties }) => (
                        <blockquote className='markdown-blockquote' {...properties}>
                            {children}
                        </blockquote>
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
};

export default MarkdownRenderer;
