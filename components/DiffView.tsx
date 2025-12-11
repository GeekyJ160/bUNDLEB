import React, { useEffect, useState, useRef } from 'react';

interface DiffViewProps {
  original: string;
  modified: string;
}

interface DiffPart {
  count?: number;
  value: string;
  added?: boolean;
  removed?: boolean;
}

export const DiffView: React.FC<DiffViewProps> = ({ original, modified }) => {
  const [diffParts, setDiffParts] = useState<DiffPart[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const calculateDiff = async () => {
      try {
        setLoading(true);
        // Dynamic import for diff library
        // @ts-ignore
        const Diff = await import('diff');
        
        if (mounted) {
          // Use diffLines for a readable code comparison
          const result = Diff.diffLines(original, modified);
          setDiffParts(result);
        }
      } catch (e) {
        console.error('Failed to load diff library', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    calculateDiff();
    return () => { mounted = false; };
  }, [original, modified]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400 animate-pulse">
        Calculating differences...
      </div>
    );
  }

  // Render unified diff
  let originalLineNumber = 1;
  let modifiedLineNumber = 1;

  return (
    <div className="w-full h-full bg-[#1d1f21] overflow-auto font-mono text-xs md:text-sm border border-white/10 rounded-lg custom-scrollbar">
      <div className="min-w-max">
        {diffParts.map((part, index) => {
          const lines = part.value.replace(/\n$/, '').split('\n');
          const isAdded = part.added;
          const isRemoved = part.removed;
          const isUnchanged = !isAdded && !isRemoved;

          return lines.map((line, lineIndex) => {
            // Determine line numbers to display
            const showOldNum = !isAdded;
            const showNewNum = !isRemoved;

            const oldNum = showOldNum ? originalLineNumber++ : null;
            const newNum = showNewNum ? modifiedLineNumber++ : null;

            return (
              <div 
                key={`${index}-${lineIndex}`} 
                className={`flex w-full hover:bg-white/5 ${
                  isAdded ? 'bg-green-500/20 text-green-200' : 
                  isRemoved ? 'bg-red-500/20 text-red-300 opacity-60' : 
                  'text-gray-400'
                }`}
              >
                {/* Line Numbers Column */}
                <div className="flex-none w-16 md:w-20 flex text-gray-600 select-none border-r border-white/10 bg-[#151718]">
                  <div className="w-1/2 text-right pr-2">
                     {oldNum || ''}
                  </div>
                  <div className="w-1/2 text-right pr-2 border-l border-white/5">
                     {newNum || ''}
                  </div>
                </div>

                {/* Marker Column */}
                <div className="flex-none w-6 text-center select-none opacity-50">
                  {isAdded ? '+' : isRemoved ? '-' : ''}
                </div>

                {/* Code Column */}
                <div className="flex-1 whitespace-pre pr-4 break-all">
                  {line}
                </div>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
};