import React, { useEffect, useState, useRef } from 'react';
import { LintIssue } from '../types';

interface AnnotatedCodeViewProps {
  code: string;
  issues: LintIssue[];
  selectedIssueIndex: number | null;
}

export const AnnotatedCodeView: React.FC<AnnotatedCodeViewProps> = ({ code, issues, selectedIssueIndex }) => {
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const LINE_HEIGHT = 24; // px, must match CSS

  useEffect(() => {
    let mounted = true;
    const loadPrism = async () => {
      try {
        // @ts-ignore
        const PrismModule = await import('prismjs');
        // Handle both default export and namespace export
        // @ts-ignore
        const Prism = PrismModule.default || PrismModule;

        if (mounted) {
          // Safety check: ensure languages definition exists
          const grammar = Prism.languages?.javascript || Prism.languages?.clike;
          if (grammar) {
            const html = Prism.highlight(code, grammar, 'javascript');
            setHighlightedHtml(html);
          } else {
            // Fallback if grammar not loaded
             setHighlightedHtml(code.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
          }
        }
      } catch (e) {
        console.warn('Prism failed to load, falling back to plain text', e);
        if (mounted) setHighlightedHtml(code.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      }
    };
    loadPrism();
    return () => { mounted = false; };
  }, [code]);

  // Scroll to line when issue selected
  useEffect(() => {
    if (selectedIssueIndex !== null && issues[selectedIssueIndex] && containerRef.current) {
      const line = issues[selectedIssueIndex].line;
      if (line) {
        const top = (line - 1) * LINE_HEIGHT;
        containerRef.current.scrollTo({ top: top - 100, behavior: 'smooth' });
      }
    }
  }, [selectedIssueIndex, issues]);

  const lineCount = code.split('\n').length;

  return (
    <div className="relative w-full h-full bg-[#1d1f21] overflow-hidden flex text-sm font-mono border border-white/10 rounded-lg">
      {/* Line Numbers */}
      <div className="flex-none w-12 bg-[#1d1f21] border-r border-white/10 text-right text-gray-600 select-none py-4">
        {Array.from({ length: lineCount }).map((_, i) => (
          <div key={i} style={{ height: LINE_HEIGHT }} className="px-2 leading-[24px]">
            {i + 1}
          </div>
        ))}
      </div>

      {/* Code Area */}
      <div ref={containerRef} className="flex-1 relative overflow-auto py-4 custom-scrollbar">
        <div className="relative min-w-max">
          
          {/* Issue Highlights Layer (Background) */}
          <div className="absolute top-0 left-0 w-full pointer-events-none">
            {issues.map((issue, idx) => {
              if (!issue.line) return null;
              const isSelected = idx === selectedIssueIndex;
              const colorClass = issue.severity === 'error' 
                ? (isSelected ? 'bg-red-500/30 border-l-4 border-red-500' : 'bg-red-500/10')
                : issue.severity === 'warning'
                ? (isSelected ? 'bg-yellow-500/30 border-l-4 border-yellow-500' : 'bg-yellow-500/10')
                : (isSelected ? 'bg-blue-500/30 border-l-4 border-blue-500' : 'bg-blue-500/10');

              return (
                <div
                  key={idx}
                  className={`absolute w-full transition-colors duration-300 ${colorClass}`}
                  style={{
                    top: (issue.line - 1) * LINE_HEIGHT,
                    height: LINE_HEIGHT,
                  }}
                />
              );
            })}
          </div>

          {/* Syntax Highlighted Code Layer (Foreground) */}
          <pre 
            className="m-0 p-0 bg-transparent !font-mono text-gray-300 pointer-events-none"
            style={{ lineHeight: `${LINE_HEIGHT}px` }}
          >
            <code 
              className="language-javascript"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }} 
            />
          </pre>
        </div>
      </div>
    </div>
  );
};