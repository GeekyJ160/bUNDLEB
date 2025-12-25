import React, { useCallback, useState } from 'react';
import { Upload, FileCode, FolderInput } from 'lucide-react';

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
}

const IGNORE_LIST = [
  'node_modules', '.git', '.svn', '.DS_Store', 'thumbs.db', 
  '.next', '.cache', '.vscode', '.idea', 'package-lock.json', 
  'yarn.lock', 'pnpm-lock.yaml'
];

export const DropZone: React.FC<DropZoneProps> = ({ onFilesSelected }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const getFile = (entry: any): Promise<File> => {
    return new Promise((resolve) => {
      entry.file((file: File) => {
        resolve(file);
      });
    });
  };

  const scanEntry = async (entry: any): Promise<File[]> => {
    if (IGNORE_LIST.some(ignored => entry.name.toLowerCase() === ignored)) {
      return [];
    }

    if (entry.isFile) {
      return [await getFile(entry)];
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let allEntries: any[] = [];
      
      const readBatch = async (): Promise<any[]> => {
        return new Promise((resolve) => {
          reader.readEntries((entries: any[]) => resolve(entries));
        });
      };

      let batch = await readBatch();
      while (batch.length > 0) {
        allEntries = [...allEntries, ...batch];
        batch = await readBatch();
      }

      const files: File[] = [];
      for (const childEntry of allEntries) {
        files.push(...(await scanEntry(childEntry)));
      }
      return files;
    }
    return [];
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setIsScanning(true);

    try {
      const items = e.dataTransfer.items;
      let resultFiles: File[] = [];

      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry?.();
            if (entry) {
              resultFiles = [...resultFiles, ...await scanEntry(entry)];
            } else {
              const file = item.getAsFile();
              if (file) resultFiles.push(file);
            }
          }
        }
      } else if (e.dataTransfer.files) {
        resultFiles = Array.from(e.dataTransfer.files);
      }

      if (resultFiles.length > 0) {
        onFilesSelected(resultFiles);
      }
    } catch (error) {
      console.error('Error scanning dropped items:', error);
    } finally {
      setIsScanning(false);
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
      
      <div className="z-20 flex flex-col items-center gap-4">
        <div className={`p-4 rounded-full transition-colors duration-300 ${isDragOver ? 'bg-neon-magenta text-white' : 'bg-dark-bg text-neon-cyan'}`}>
          {isScanning ? (
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          ) : isDragOver ? (
            <FolderInput size={32} className="animate-bounce" />
          ) : (
            <Upload size={32} />
          )}
        </div>
        
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-white">
            {isScanning ? 'Scanning directory...' : isDragOver ? 'Drop folder here' : 'Drop project folder'}
          </h3>
          <p className="text-gray-400 text-sm max-w-xs mx-auto">
            Drop your code workspace. We'll automatically filter out binary and junk files.
          </p>
        </div>
      </div>
    </div>
  );
};