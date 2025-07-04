'use client';

import { lazy, Suspense, memo, useState, useEffect } from 'react';

// Lazy load only when needed
const SyntaxHighlighter = lazy(() => 
  import('react-syntax-highlighter').then(module => ({
    default: module.Prism
  }))
);

// Import style as a regular import to avoid complex lazy loading
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface OptimizedSyntaxHighlighterProps {
  children: string;
  language?: string;
  customStyle?: React.CSSProperties;
  className?: string;
}

// Loading fallback component
const SyntaxHighlighterSkeleton = ({ customStyle }: { customStyle?: React.CSSProperties }) => (
  <div 
    style={{
      backgroundColor: '#1d1f21',
      color: '#c5c8c6',
      padding: '12px',
      fontFamily: 'monospace',
      fontSize: '13px',
      borderRadius: '0px',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      minHeight: '100px',
      ...customStyle
    }}
  >
    <div className="animate-pulse">Loading...</div>
  </div>
);

const OptimizedSyntaxHighlighter = memo(({ 
  children, 
  language = 'json', 
  customStyle = {},
  className 
}: OptimizedSyntaxHighlighterProps) => {
  const defaultStyle = {
    maxHeight: '50rem',
    overflowY: 'auto' as const,
    borderRadius: '0px',
    fontSize: '13px',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    margin: '0',
    padding: '12px',
    ...customStyle
  };

  return (
    <Suspense fallback={<SyntaxHighlighterSkeleton customStyle={defaultStyle} />}>
      <SyntaxHighlighter
        language={language}
        style={atomDark}
        customStyle={defaultStyle}
        className={className}
        showLineNumbers={false}
        wrapLines={false}
        // Only load common languages to reduce bundle size
        codeTagProps={{ style: { fontFamily: 'inherit' } }}
      >
        {children}
      </SyntaxHighlighter>
    </Suspense>
  );
});

OptimizedSyntaxHighlighter.displayName = 'OptimizedSyntaxHighlighter';

export { OptimizedSyntaxHighlighter };