import React, { useCallback, useState } from 'react';
import { Upload, FileCode, CheckCircle2 } from 'lucide-react';

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
}

export const DropZone: React.FC<DropZoneProps> = ({ onFilesSelected }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  }, [onFilesSelected]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
    }
  }, [onFilesSelected]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative group cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300 ease-out
        flex flex-col items-center justify-center text-center p-12 min-h-[240px] overflow-hidden
        ${isDragOver 
          ? 'border-neon-magenta bg-neon-magenta/10 scale-[1.02] shadow-[0_0_30px_rgba(255,0,255,0.3)]' 
          : 'border-white/20 bg-dark-surface hover:border-neon-cyan/50 hover:bg-dark-surface/80'
        }
      `}
    >
      <input
        type="file"
        multiple
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        onChange={handleInputChange}
      />
      
      {/* Animated Background Gradient */}
      <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full transition-transform duration-1000 ${isDragOver ? 'translate-x-full' : ''}`} />

      <div className="z-20 flex flex-col items-center gap-4">
        <div className={`p-4 rounded-full transition-colors duration-300 ${isDragOver ? 'bg-neon-magenta text-white' : 'bg-dark-bg text-neon-cyan'}`}>
          {isDragOver ? <Upload size={32} className="animate-bounce" /> : <FileCode size={32} />}
        </div>
        
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-white">
            {isDragOver ? 'Drop it like it\'s hot!' : 'Drag & Drop files here'}
          </h3>
          <p className="text-gray-400 text-sm max-w-xs mx-auto">
            or click to browse from your computer. Supports JS, TS, CSS, HTML, JSON.
          </p>
        </div>
      </div>
    </div>
  );
};