import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { DropZone } from './components/DropZone';
import { Visualizer } from './components/Visualizer';
import { DiagnosticPanel } from './components/DiagnosticPanel';
import { AnnotatedCodeView } from './components/AnnotatedCodeView';
import { FileEntry, Diagnostic, BundleStats, ViewMode, LintIssue } from './types';
import { analyzeBundleWithGemini, lintBundleWithGemini } from './services/geminiService';
import { 
  Zap, Download, Copy, Trash2, LayoutTemplate, 
  Activity, Sparkles, Code, FileText, Settings, Play,
  FileJson, Palette, File as FileGeneric, Braces, AlignLeft,
  Bug, AlertTriangle, Check, Info as InfoIcon
} from 'lucide-react';

const STORAGE_KEY_CODE = 'bundle_blitz_code';
const STORAGE_KEY_FILES = 'bundle_blitz_files';

const getFileTypeInfo = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return { Icon: Code, color: 'text-yellow-400', label: 'Script' };
    case 'css':
    case 'scss':
    case 'less':
      return { Icon: Palette, color: 'text-blue-400', label: 'Style' };
    case 'html':
    case 'htm':
      return { Icon: LayoutTemplate, color: 'text-orange-400', label: 'Layout' };
    case 'json':
      return { Icon: FileJson, color: 'text-green-400', label: 'Data' };
    case 'txt':
    case 'md':
    case 'csv':
      return { Icon: FileText, color: 'text-gray-300', label: 'Text' };
    default:
      return { Icon: FileGeneric, color: 'text-gray-500', label: 'File' };
  }
};

const constructPreview = (files: FileEntry[]) => {
  const htmlFile = files.find(f => f.name.endsWith('.html'));
  const cssFiles = files.filter(f => f.name.endsWith('.css'));
  const jsFiles = files.filter(f => /\.(js|ts|jsx|tsx)$/.test(f.name));

  let html = htmlFile ? htmlFile.content : `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BundleBlitz Preview</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; padding: 2rem; color: #333; background: #fff; }
    h1 { color: #111; }
  </style>
</head>
<body>
  <div id="root"></div>
  ${jsFiles.length > 0 && !htmlFile ? '<h1>Preview Mode</h1><p>Running scripts...</p>' : ''}
</body>
</html>`;

  // Inject CSS
  if (cssFiles.length) {
    const styles = cssFiles.map(f => f.content).join('\n');
    if (html.includes('</head>')) {
      html = html.replace('</head>', `<style>\n${styles}\n</style>\n</head>`);
    } else {
      html = html + `<style>\n${styles}\n</style>`;
    }
  }

  // Inject JS
  if (jsFiles.length) {
    const scripts = jsFiles.map(f => f.content).join('\n');
    const scriptTag = `<script type="module">\n${scripts}\n</script>`;
    if (html.includes('</body>')) {
      html = html.replace('</body>', `${scriptTag}\n</body>`);
    } else {
      html = html + scriptTag;
    }
  }

  return html;
};

const App: React.FC = () => {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [bundledCode, setBundledCode] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.EDITOR);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // AI State
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [lintIssues, setLintIssues] = useState<LintIssue[]>([]);
  const [activeAiTab, setActiveAiTab] = useState<'analysis' | 'lint'>('analysis');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isLintLoading, setIsLintLoading] = useState(false);
  const [selectedLintIssue, setSelectedLintIssue] = useState<number | null>(null);

  const [enableTranspilation, setEnableTranspilation] = useState(false);
  const [enableFormatting, setEnableFormatting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const addDiagnostic = (message: string, type: Diagnostic['type'] = 'info') => {
    setDiagnostics(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      type,
      message,
      timestamp: Date.now()
    }]);
  };

  // Restore state from LocalStorage on mount
  useEffect(() => {
    const savedCode = localStorage.getItem(STORAGE_KEY_CODE);
    const savedFiles = localStorage.getItem(STORAGE_KEY_FILES);
    let restoredCount = 0;

    if (savedFiles) {
      try {
        const parsedFiles = JSON.parse(savedFiles);
        if (Array.isArray(parsedFiles) && parsedFiles.length > 0) {
          setFiles(parsedFiles);
          restoredCount = parsedFiles.length;
        }
      } catch (e) {
        console.error('Failed to parse saved files', e);
      }
    }

    if (savedCode) {
      setBundledCode(savedCode);
      addDiagnostic(`Restored previous session: ${restoredCount} files and bundled output loaded.`, 'info');
    }
  }, []);

  // Update preview URL when switching to preview tab or files change
  useEffect(() => {
    if (viewMode === ViewMode.PREVIEW) {
      const html = constructPreview(files);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);

      // Cleanup
      return () => URL.revokeObjectURL(url);
    }
  }, [files, viewMode]);

  const handleFilesSelected = async (selectedFiles: File[]) => {
    setIsProcessing(true);
    const newFileEntries: FileEntry[] = [];
    
    try {
      for (const file of selectedFiles) {
        const text = await file.text();
        const ext = file.name.split('.').pop()?.toLowerCase();

        // Type specific checks
        if (ext === 'json') {
          try {
            JSON.parse(text);
            // addDiagnostic(`Validated JSON: ${file.name}`, 'info');
          } catch (e) {
            addDiagnostic(`Invalid JSON format detected in ${file.name}`, 'warning');
          }
        } else if (['js', 'ts', 'jsx', 'tsx'].includes(ext || '')) {
          if (text.includes('eval(')) {
            addDiagnostic(`Security Warning: 'eval' usage detected in ${file.name}`, 'warning');
          }
        }

        newFileEntries.push({
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          size: file.size,
          content: text,
          type: file.type
        });
      }
      
      setFiles(prev => [...prev, ...newFileEntries]);
      addDiagnostic(`Successfully loaded ${selectedFiles.length} file(s).`, 'info');
    } catch (err) {
      addDiagnostic('Failed to read one or more files.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBundle = useCallback(async () => {
    if (files.length === 0) {
      addDiagnostic('No files to bundle.', 'warning');
      return;
    }

    setIsProcessing(true);
    
    // Allow UI to update to "processing" state
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const header = `/**\n * BundleBlitz ⚡\n * Generated: ${new Date().toISOString()}\n * Files: ${files.length}\n */\n\n`;
      
      // Concatenate files
      // IMPORTANT: Non-script files must be wrapped in comments or strings to keep bundle.js valid JavaScript
      let content = files.map(f => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        const isScript = ['js', 'ts', 'jsx', 'tsx'].includes(ext || '');
        
        let fileContent = f.content;
        
        if (!isScript) {
          // Escape closing comments to avoid breaking the block
          const safeContent = f.content.replace(/\*\//g, '* /');
          fileContent = `/*\n[Non-Script File: ${f.name}]\n\n${safeContent}\n*/`;
        }

        return `// --- BEGIN ${f.name} (${f.size} bytes) ---\n${fileContent}\n// --- END ${f.name} ---\n`;
      }).join('\n');
      
      let finalCode = header + content;

      // 1. Transpilation (Babel)
      if (enableTranspilation) {
        addDiagnostic('Loading Babel for transpilation...', 'info');
        try {
          // Dynamic import to prevent app load failure
          // @ts-ignore
          const Babel = await import('@babel/standalone');
          
          // Handle different module formats (ESM vs UMD wrapped)
          const transformFn = Babel.transform || (Babel as any).default?.transform;

          if (transformFn) {
            const result = transformFn(finalCode, {
              presets: ['env'],
              filename: 'bundle.js',
              retainLines: true,
            });
            
            if (result.code) {
              finalCode = result.code;
              addDiagnostic('Transpilation to ES5 successful.', 'info');
            }
          } else {
            throw new Error('Babel transform function not found in loaded module.');
          }
        } catch (babelError: any) {
          console.error(babelError);
          // Don't block the bundle, just warn
          addDiagnostic(`Transpilation skipped: ${babelError.message || 'Syntax Error or Module Error'}`, 'warning');
        }
      }

      // 2. Formatting (Prettier)
      if (enableFormatting) {
        addDiagnostic('Formatting code with Prettier...', 'info');
        try {
          // @ts-ignore
          const prettier = await import('prettier');
          // @ts-ignore
          const parserBabelMod = await import('prettier/plugins/babel');
          // @ts-ignore
          const parserEstreeMod = await import('prettier/plugins/estree');
          
          const prettierFormat = prettier.format || (prettier as any).default?.format;
          
          // Ensure we get the default export for plugins if necessary (common in ESM CDN builds)
          const parserBabel = parserBabelMod.default || parserBabelMod;
          const parserEstree = parserEstreeMod.default || parserEstreeMod;

          if (prettierFormat) {
             finalCode = await prettierFormat(finalCode, {
              parser: 'babel',
              plugins: [parserBabel, parserEstree],
              semi: true,
              singleQuote: true,
              printWidth: 80,
            });
            addDiagnostic('Code formatted successfully.', 'info');
          } else {
            throw new Error('Prettier format function not found.');
          }
        } catch (fmtError: any) {
          console.error(fmtError);
          addDiagnostic(`Formatting failed: ${fmtError.message || 'Unknown error'}`, 'warning');
        }
      }
      
      setBundledCode(finalCode);
      addDiagnostic(`Bundle created successfully! Total size: ${finalCode.length} bytes.`, 'info');
      setViewMode(ViewMode.EDITOR);
      
      // Reset AI states when new bundle is created
      setAiAnalysis('');
      setLintIssues([]);
      setSelectedLintIssue(null);

      // Save to LocalStorage
      try {
        localStorage.setItem(STORAGE_KEY_CODE, finalCode);
        localStorage.setItem(STORAGE_KEY_FILES, JSON.stringify(files));
      } catch (e) {
        console.warn('LocalStorage quota exceeded', e);
        addDiagnostic('Auto-save failed: Storage quota exceeded.', 'warning');
      }

    } catch (err) {
      console.error(err);
      addDiagnostic('Error during bundling process.', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [files, enableTranspilation, enableFormatting]);

  const handleDownload = () => {
    if (!bundledCode) return;
    const blob = new Blob([bundledCode], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bundle.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addDiagnostic('Download started.', 'info');
  };

  const handleCopy = () => {
    if (!bundledCode) return;
    navigator.clipboard.writeText(bundledCode)
      .then(() => addDiagnostic('Bundled code copied to clipboard.', 'info'))
      .catch(() => addDiagnostic('Failed to copy to clipboard.', 'error'));
  };

  const handleClear = () => {
    setFiles([]);
    setBundledCode('');
    setDiagnostics([]);
    setAiAnalysis('');
    setLintIssues([]);
    setSelectedLintIssue(null);
    localStorage.removeItem(STORAGE_KEY_CODE);
    localStorage.removeItem(STORAGE_KEY_FILES);
    addDiagnostic('Workspace cleared.', 'info');
  };

  const handleAiAnalyze = async () => {
    if (!bundledCode) {
      addDiagnostic('Please bundle files before running AI analysis.', 'warning');
      return;
    }
    setViewMode(ViewMode.AI_INSIGHTS);
    setActiveAiTab('analysis');
    setIsAiLoading(true);
    try {
      const result = await analyzeBundleWithGemini(bundledCode);
      setAiAnalysis(result);
      addDiagnostic('AI Analysis completed.', 'info');
    } catch (error) {
      addDiagnostic('AI Analysis failed. Check API configuration.', 'error');
      setAiAnalysis('Analysis failed. Please ensure the API Key is configured correctly in the environment.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAiLint = async () => {
    if (!bundledCode) {
      addDiagnostic('Please bundle files before running AI Linter.', 'warning');
      return;
    }
    setViewMode(ViewMode.AI_INSIGHTS);
    setActiveAiTab('lint');
    setIsLintLoading(true);
    setSelectedLintIssue(null);
    try {
      const issues = await lintBundleWithGemini(bundledCode);
      setLintIssues(issues);
      addDiagnostic(`AI Linting completed. Found ${issues.length} issues.`, 'info');
    } catch (error) {
      addDiagnostic('AI Linting failed. Check API configuration.', 'error');
    } finally {
      setIsLintLoading(false);
    }
  };

  const stats: BundleStats = {
    fileCount: files.length,
    totalSize: files.reduce((acc, f) => acc + f.size, 0),
    linesOfCode: bundledCode.split('\n').length
  };

  return (
    <div className="min-h-screen pb-20 relative overflow-hidden">
      {/* Background Decor */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-0">
         <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-neon-cyan/5 rounded-full blur-[100px]" />
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-neon-magenta/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2 flex items-center gap-3">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-neon-magenta animate-pulse-fast">
                BundleBlitz
              </span>
              <Zap className="text-neon-cyan fill-current" size={40} />
            </h1>
            <p className="text-gray-400 text-lg max-w-2xl">
              High-performance single-file bundler. Drag, drop, and deploy.
            </p>
          </div>
          
          <div className="flex gap-4">
            <div className="bg-dark-card border border-white/10 px-4 py-2 rounded-lg text-sm">
              <span className="block text-gray-500 text-xs uppercase font-bold">Files</span>
              <span className="text-white font-mono text-xl">{stats.fileCount}</span>
            </div>
            <div className="bg-dark-card border border-white/10 px-4 py-2 rounded-lg text-sm">
              <span className="block text-gray-500 text-xs uppercase font-bold">Size</span>
              <span className="text-neon-cyan font-mono text-xl">
                {(stats.totalSize / 1024).toFixed(2)} KB
              </span>
            </div>
          </div>
        </header>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Input & Controls */}
          <div className="lg:col-span-4 space-y-6">
            <DropZone onFilesSelected={handleFilesSelected} />

            {/* File List */}
            {files.length > 0 && (
              <div className="bg-dark-card border border-white/10 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-white/10 flex justify-between items-center">
                  <h3 className="font-bold text-gray-200">Selected Files</h3>
                  <span className="text-xs text-gray-500 font-mono">{files.length} items</span>
                </div>
                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                  {files.map((f, i) => {
                    const { Icon, color, label } = getFileTypeInfo(f.name);
                    return (
                      <div key={f.id} className="px-4 py-3 border-b border-white/5 flex justify-between items-center hover:bg-white/5 transition-colors group">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <Icon size={16} className={`${color} shrink-0`} />
                          <div className="flex flex-col min-w-0">
                             <span className="text-sm text-gray-300 truncate group-hover:text-white transition-colors">{f.name}</span>
                             <span className="text-xs text-gray-600 font-mono uppercase">{label}</span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 font-mono shrink-0">{(f.size / 1024).toFixed(1)}KB</span>
                      </div>
                    );
                  })}
                </div>
                <div className="p-4 bg-white/5 flex flex-col gap-3">
                  
                  {/* Build Configuration */}
                  <div className="mb-2 px-1">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Build Configuration</h4>
                    <div className="space-y-3">
                      {/* Transpilation Toggle */}
                      <label className="flex items-center gap-3 cursor-pointer group select-none">
                        <div className="relative">
                          <input 
                            type="checkbox" 
                            checked={enableTranspilation}
                            onChange={(e) => setEnableTranspilation(e.target.checked)}
                            className="sr-only peer" 
                          />
                          <div className="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-neon-cyan"></div>
                        </div>
                        <span className="text-sm text-gray-300 flex items-center gap-2 group-hover:text-white transition-colors">
                          <Settings size={16} className="text-neon-cyan" />
                          <div>
                            <span className="block font-medium">Transpile to ES5</span>
                            <span className="block text-xs text-gray-500">Use Babel for compatibility</span>
                          </div>
                        </span>
                      </label>

                      {/* Formatting Toggle */}
                      <label className="flex items-center gap-3 cursor-pointer group select-none">
                        <div className="relative">
                          <input 
                            type="checkbox" 
                            checked={enableFormatting}
                            onChange={(e) => setEnableFormatting(e.target.checked)}
                            className="sr-only peer" 
                          />
                          <div className="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-neon-magenta"></div>
                        </div>
                        <span className="text-sm text-gray-300 flex items-center gap-2 group-hover:text-white transition-colors">
                          <AlignLeft size={16} className="text-neon-magenta" />
                          <div>
                            <span className="block font-medium">Format Code (Prettier)</span>
                            <span className="block text-xs text-gray-500">Format using Prettier</span>
                          </div>
                        </span>
                      </label>
                    </div>
                  </div>
                  
                  <div className="border-t border-white/10 my-1"></div>

                  <button
                    onClick={handleBundle}
                    disabled={isProcessing || files.length === 0}
                    className="w-full py-3 rounded-lg bg-gradient-to-r from-neon-cyan to-neon-purple text-dark-bg font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-neon-cyan/20"
                  >
                    {isProcessing ? <Activity className="animate-spin" size={20} /> : <Zap size={20} />}
                    Bundle Files
                  </button>
                  <button
                    onClick={handleClear}
                    className="w-full py-3 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/30 transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 size={18} />
                    Clear Workspace
                  </button>
                </div>
              </div>
            )}

            <DiagnosticPanel diagnostics={diagnostics} onDismiss={(id) => setDiagnostics(prev => prev.filter(d => d.id !== id))} />
          </div>

          {/* Right Column: Output & Tools */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Tabs */}
            <div className="flex items-center gap-2 p-1 bg-dark-card border border-white/10 rounded-xl w-fit">
              {[
                { id: ViewMode.EDITOR, label: 'Code Editor', icon: Code },
                { id: ViewMode.VISUALIZER, label: 'Visualizer', icon: LayoutTemplate },
                { id: ViewMode.AI_INSIGHTS, label: 'AI Insights', icon: Sparkles },
                { id: ViewMode.PREVIEW, label: 'Live Preview', icon: Play },
              ].map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setViewMode(mode.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                    ${viewMode === mode.id 
                      ? 'bg-white/10 text-neon-cyan shadow-sm' 
                      : 'text-gray-400 hover:text-white hover:bg-white/5'}
                  `}
                >
                  <mode.icon size={16} />
                  {mode.label}
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 min-h-[500px] bg-dark-card border border-white/10 rounded-xl overflow-hidden relative shadow-2xl">
              {viewMode === ViewMode.EDITOR && (
                <div className="h-full flex flex-col">
                  <div className="flex justify-between items-center p-4 border-b border-white/10 bg-white/5">
                    <span className="text-gray-400 text-sm font-mono flex items-center gap-2">
                      bundle.js 
                      {enableTranspilation && <span className="text-xs bg-neon-cyan/10 text-neon-cyan px-2 py-0.5 rounded border border-neon-cyan/20">ES5</span>}
                    </span>
                    <div className="flex gap-2">
                      <button 
                        onClick={handleCopy}
                        disabled={!bundledCode}
                        className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-neon-cyan transition-colors disabled:opacity-50"
                        title="Copy Code"
                      >
                        <Copy size={18} />
                      </button>
                      <button 
                        onClick={handleDownload}
                        disabled={!bundledCode}
                        className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-neon-cyan transition-colors disabled:opacity-50"
                        title="Download Bundle"
                      >
                        <Download size={18} />
                      </button>
                    </div>
                  </div>
                  <textarea 
                    value={bundledCode} 
                    readOnly 
                    placeholder="// Bundled code will appear here..."
                    className="flex-1 w-full bg-dark-bg p-4 font-mono text-sm text-gray-300 focus:outline-none resize-none"
                  />
                </div>
              )}

              {viewMode === ViewMode.VISUALIZER && (
                <div className="h-full p-6 overflow-y-auto">
                  <Visualizer files={files} />
                </div>
              )}

              {viewMode === ViewMode.AI_INSIGHTS && (
                <div className="h-full p-6 flex flex-col">
                  {!bundledCode ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4">
                       <Code size={48} className="opacity-20" />
                       <p>Bundle your files first to enable AI analysis.</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-4">
                           <h3 className="text-xl font-bold text-white flex items-center gap-2">
                             <Sparkles size={20} className="text-neon-purple" />
                             AI Insights
                           </h3>
                           <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
                              <button
                                onClick={() => setActiveAiTab('analysis')}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeAiTab === 'analysis' ? 'bg-neon-purple text-white shadow' : 'text-gray-400 hover:text-white'}`}
                              >
                                Deep Analysis
                              </button>
                              <button
                                onClick={() => setActiveAiTab('lint')}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeAiTab === 'lint' ? 'bg-neon-cyan text-dark-bg shadow' : 'text-gray-400 hover:text-white'}`}
                              >
                                Smart Linter
                              </button>
                           </div>
                        </div>
                        
                        {activeAiTab === 'analysis' ? (
                          <button
                            onClick={handleAiAnalyze}
                            disabled={isAiLoading}
                            className="px-4 py-2 bg-neon-purple/20 text-neon-purple border border-neon-purple/50 rounded-lg hover:bg-neon-purple/30 transition-all flex items-center gap-2 text-sm font-bold"
                          >
                            {isAiLoading ? <Activity className="animate-spin" size={16} /> : <Sparkles size={16} />}
                            {aiAnalysis ? 'Re-Analyze' : 'Run Analysis'}
                          </button>
                        ) : (
                          <button
                            onClick={handleAiLint}
                            disabled={isLintLoading}
                            className="px-4 py-2 bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 rounded-lg hover:bg-neon-cyan/30 transition-all flex items-center gap-2 text-sm font-bold"
                          >
                            {isLintLoading ? <Activity className="animate-spin" size={16} /> : <Bug size={16} />}
                            {lintIssues.length > 0 ? 'Re-Lint' : 'Run Linter'}
                          </button>
                        )}
                      </div>
                      
                      <div className="flex-1 bg-dark-bg/50 rounded-xl border border-white/5 overflow-hidden relative">
                        {activeAiTab === 'analysis' ? (
                          <div className="p-6 h-full overflow-y-auto custom-scrollbar">
                            {isAiLoading ? (
                              <div className="space-y-4 animate-pulse">
                                <div className="h-4 bg-white/10 rounded w-3/4"></div>
                                <div className="h-4 bg-white/10 rounded w-1/2"></div>
                                <div className="h-4 bg-white/10 rounded w-5/6"></div>
                              </div>
                            ) : aiAnalysis ? (
                              <div className="whitespace-pre-wrap font-sans text-gray-300 leading-relaxed">
                                {aiAnalysis}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center h-full text-gray-500 italic text-center">
                                <Sparkles size={40} className="mb-4 opacity-20" />
                                <p>Click "Run Analysis" to get a deep architectural review <br/> and security assessment.</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="h-full flex flex-col">
                             {isLintLoading ? (
                              <div className="p-6 space-y-4 animate-pulse">
                                <div className="h-10 bg-white/10 rounded w-full"></div>
                                <div className="h-10 bg-white/10 rounded w-full"></div>
                                <div className="h-10 bg-white/10 rounded w-full"></div>
                              </div>
                            ) : lintIssues.length > 0 ? (
                              <div className="flex h-full">
                                {/* Left Pane: Issue List */}
                                <div className="w-1/3 border-r border-white/10 overflow-y-auto custom-scrollbar bg-dark-card/50">
                                  <table className="w-full text-left text-sm text-gray-400">
                                    <thead className="bg-white/5 text-gray-200 sticky top-0 backdrop-blur-sm z-10">
                                      <tr>
                                        <th className="p-3 font-semibold text-xs uppercase">Issues ({lintIssues.length})</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                      {lintIssues.map((issue, idx) => (
                                        <tr 
                                          key={idx} 
                                          onClick={() => setSelectedLintIssue(idx)}
                                          className={`cursor-pointer transition-colors ${selectedLintIssue === idx ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                        >
                                          <td className="p-3">
                                            <div className="flex items-center justify-between mb-1">
                                              {issue.severity === 'error' ? (
                                                <span className="inline-flex items-center gap-1 text-red-400 text-xs font-bold uppercase">
                                                  <AlertTriangle size={10} /> Error
                                                </span>
                                              ) : issue.severity === 'warning' ? (
                                                <span className="inline-flex items-center gap-1 text-yellow-400 text-xs font-bold uppercase">
                                                  <AlertTriangle size={10} /> Warn
                                                </span>
                                              ) : (
                                                <span className="inline-flex items-center gap-1 text-blue-400 text-xs font-bold uppercase">
                                                  <InfoIcon size={10} /> Info
                                                </span>
                                              )}
                                              <span className="font-mono text-xs text-gray-600">L{issue.line || '?'}</span>
                                            </div>
                                            <div className="text-gray-300 line-clamp-2 text-xs mb-1">{issue.message}</div>
                                            {issue.suggestion && (
                                              <div className="text-neon-cyan/60 italic text-[10px] line-clamp-1">Tip: {issue.suggestion}</div>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                {/* Right Pane: Annotated Code View */}
                                <div className="flex-1 h-full overflow-hidden bg-[#1d1f21] relative">
                                  <AnnotatedCodeView 
                                    code={bundledCode} 
                                    issues={lintIssues} 
                                    selectedIssueIndex={selectedLintIssue} 
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center h-full text-gray-500 italic text-center p-6">
                                <Bug size={40} className="mb-4 opacity-20" />
                                <p>Click "Run Linter" to check for syntax errors, <br/> bugs, and bad practices.</p>
                                {lintIssues.length === 0 && !isLintLoading && activeAiTab === 'lint' && (
                                  <p className="mt-2 text-green-500/50 text-xs font-bold flex items-center gap-1 justify-center">
                                    <Check size={14} /> No issues found! Clean code.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {viewMode === ViewMode.PREVIEW && (
                <div className="h-full w-full bg-white rounded-xl overflow-hidden relative">
                  {files.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4 bg-dark-card border-none">
                      <Play size={48} className="opacity-20" />
                      <p>Add files to generate a live preview.</p>
                    </div>
                  ) : (
                    <iframe 
                      src={previewUrl || ''} 
                      className="w-full h-full border-none bg-white"
                      title="Live Preview"
                      sandbox="allow-scripts allow-modals allow-same-origin"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
