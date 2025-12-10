import React, { useEffect, useRef } from 'react';
import { Diagnostic } from '../types';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

interface DiagnosticPanelProps {
  diagnostics: Diagnostic[];
  onDismiss: (id: string) => void;
}

export const DiagnosticPanel: React.FC<DiagnosticPanelProps> = ({ diagnostics, onDismiss }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [diagnostics]);

  if (diagnostics.length === 0) return null;

  return (
    <div className="w-full bg-dark-card border border-white/10 rounded-xl overflow-hidden flex flex-col shadow-xl">
      <div className="px-4 py-3 bg-white/5 border-b border-white/10 flex justify-between items-center">
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">System Diagnostics</h3>
        <span className="text-xs text-gray-500">{diagnostics.length} events</span>
      </div>
      <div ref={scrollRef} className="max-h-48 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {diagnostics.map((diag) => (
          <div 
            key={diag.id} 
            className={`
              relative group flex items-start gap-3 p-3 rounded-lg border-l-4 transition-all hover:bg-white/5
              ${diag.type === 'error' ? 'border-red-500 bg-red-500/10' : 
                diag.type === 'warning' ? 'border-yellow-500 bg-yellow-500/10' : 
                'border-neon-cyan bg-neon-cyan/10'}
            `}
          >
            <div className="mt-0.5 shrink-0">
              {diag.type === 'error' ? <AlertCircle size={16} className="text-red-400" /> :
               diag.type === 'warning' ? <AlertCircle size={16} className="text-yellow-400" /> :
               <CheckCircle size={16} className="text-neon-cyan" />}
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-200 font-medium leading-tight">{diag.message}</p>
              <span className="text-[10px] text-gray-500 mt-1 block">
                {new Date(diag.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <button 
              onClick={() => onDismiss(diag.id)}
              className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 text-gray-500 hover:text-white transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};