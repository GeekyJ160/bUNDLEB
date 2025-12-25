import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { 
  createHashRouter, 
  RouterProvider, 
  Routes, 
  Route, 
  Link, 
  useLocation, 
  Navigate,
  useNavigate
} from 'react-router-dom';
import { DropZone } from './components/DropZone';
import { Visualizer } from './components/Visualizer';
import { DiagnosticPanel } from './components/DiagnosticPanel';
import { AnnotatedCodeView } from './components/AnnotatedCodeView';
import { DiffView } from './components/DiffView';
import { Playground } from './components/Playground';
import { FileEntry, Diagnostic, BundleStats, LintIssue, ComponentMetadata } from './types';
import { analyzeBundleWithGemini, lintBundleWithGemini, refactorBundleWithGemini, discoverComponentsWithGemini } from './services/geminiService';
import { performStaticLint } from './services/eslintService';
import { 
  Zap, Download, Copy, Trash2, LayoutTemplate, 
  Activity, Sparkles, Code, FileText, Settings, Play,
  FileJson, Palette, File as FileGeneric, Braces, AlignLeft,
  Bug, AlertTriangle, Check, Info as InfoIcon, FileCode2,
  Globe, Paintbrush, RotateCw, GitCompare, Boxes, ExternalLink,
  ChevronRight, ClipboardCheck, AlertCircle, ListFilter,
  ShieldCheck, Cpu, SearchCode, BookOpen, StickyNote
} from 'lucide-react';

const STORAGE_KEY_CODE = 'bundle_blitz_code';
const STORAGE_KEY_FILES = 'bundle_blitz_files';

const getFileTypeInfo = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js': case 'jsx': case 'ts': case 'tsx': case 'mjs':
      return { Icon: FileCode2, color: 'text-yellow-400', bg: 'bg-yellow-400/10', label: 'JavaScript' };
    case 'css': case 'scss': case 'less': case 'sass':
      return { Icon: Paintbrush, color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Style' };
    case 'html': case 'htm':
      return { Icon: Globe, color: 'text-orange-400', bg: 'bg-orange-400/10', label: 'HTML' };
    case 'json':
      return { Icon: FileJson, color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'JSON Config' };
    case 'md':
      return { Icon: BookOpen, color: 'text-pink-400', bg: 'bg-pink-400/10', label: 'Markdown Doc' };
    case 'txt':
      return { Icon: StickyNote, color: 'text-amber-400', bg: 'bg-orange-400/10', label: 'Plain Text' };
    case 'csv':
      return { Icon: FileText, color: 'text-green-300', bg: 'bg-green-300/10', label: 'CSV Data' };
    default:
      return { Icon: FileGeneric, color: 'text-gray-500', bg: 'bg-gray-500/10', label: ext?.toUpperCase() || 'FILE' };
  }
};

const isBinaryFile = async (file: File): Promise<boolean> => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 8192));
  let nonPrintableCount = 0;
  
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === 0) return true; 
    if (byte < 7 || (byte > 13 && byte < 32)) nonPrintableCount++;
  }
  
  return (nonPrintableCount / bytes.length) > 0.1;
};

const constructPreview = (files: FileEntry[]) => {
  const htmlFile = files.find(f => /\.(html|htm)$/i.test(f.name));
  const cssFiles = files.filter(f => /\.(css|scss|less)$/i.test(f.name));
  const jsFiles = files.filter(f => /\.(js|ts|jsx|tsx|mjs)$/i.test(f.name));

  let htmlContent = htmlFile ? htmlFile.content : '';

  // Ensure there's some content even if no HTML file is provided
  if (!htmlContent) {
    htmlContent = '<div id="root"></div>';
  }

  // Check for existing structural elements
  const hasDocType = /<!DOCTYPE html/i.test(htmlContent);
  const hasHtmlTag = /<html/i.test(htmlContent);
  const hasHeadTag = /<head/i.test(htmlContent);
  const hasBodyTag = /<body/i.test(htmlContent);
  const hasTitleTag = /<title/i.test(htmlContent);

  let finalHtml = htmlContent;

  // 1. Ensure basic HTML5 structure if missing
  if (!hasDocType && !hasHtmlTag) {
    finalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BundleBlitz Preview</title>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
  } else {
    // Inject essential tags into existing structure
    if (!hasHeadTag) {
      finalHtml = finalHtml.replace(/<html[^>]*>/i, (m) => `${m}\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>BundleBlitz Preview</title>\n</head>`);
    } else {
      // Add missing meta/title tags if <head> exists but they are missing
      if (!/<meta[^>]*charset/i.test(finalHtml)) {
        finalHtml = finalHtml.replace(/<head[^>]*>/i, (m) => `${m}\n  <meta charset="UTF-8">`);
      }
      if (!/<meta[^>]*viewport/i.test(finalHtml)) {
        finalHtml = finalHtml.replace(/<head[^>]*>/i, (m) => `${m}\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">`);
      }
      if (!hasTitleTag) {
        finalHtml = finalHtml.replace(/<head[^>]*>/i, (m) => `${m}\n  <title>BundleBlitz Preview</title>`);
      }
    }
  }

  // 2. Prepare Styles (Normalized + User Styles)
  const baseStyles = `
    :root { 
      font-family: system-ui, -apple-system, sans-serif; 
      line-height: 1.5; 
      background-color: #ffffff; 
      color: #0f172a; 
    } 
    @media (prefers-color-scheme: dark) { 
      :root { background-color: #0f172a; color: #f1f5f9; } 
    }
    body { margin: 0; padding: 0; }
  `;
  const userStyles = cssFiles.map(f => `/* --- ${f.name} --- */\n${f.content}`).join('\n');
  const styleBlock = `<style>\n${baseStyles}\n${userStyles}\n</style>`;
  
  // Inject style block into <head>
  if (finalHtml.toLowerCase().includes('</head>')) {
    finalHtml = finalHtml.replace(/<\/head>/i, `${styleBlock}\n</head>`);
  } else {
    finalHtml = finalHtml.replace(/<body[^>]*>/i, (match) => `<head>${styleBlock}</head>\n${match}`);
  }

  // 3. Prepare Scripts (Module-based to support import/export syntax)
  if (jsFiles.length > 0) {
    const scripts = jsFiles.map(f => `// --- ${f.name} ---\n${f.content}`).join('\n');
    const scriptBlock = `<script type="module">\n${scripts.replace(/<\/script>/g, '<\\/script>')}\n</script>`;
    
    // Inject scripts at end of <body>
    if (finalHtml.toLowerCase().includes('</body>')) {
      finalHtml = finalHtml.replace(/<\/body>/i, `${scriptBlock}\n</body>`);
    } else {
      finalHtml += `\n${scriptBlock}`;
    }
  }

  return finalHtml;
};

const BundleBlitz: React.FC = () => {
  const location = useLocation();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [bundledCode, setBundledCode] = useState<string>('');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [renderedAnalysis, setRenderedAnalysis] = useState<string>('');
  const [lintIssues, setLintIssues] = useState<LintIssue[]>([]);
  const [discoveredComponents, setDiscoveredComponents] = useState<ComponentMetadata[]>([]);
  const [activeAiTab, setActiveAiTab] = useState<'analysis' | 'lint' | 'discover'>('analysis');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isLintLoading, setIsLintLoading] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  
  const [bundleType, setBundleType] = useState<'JS' | 'HTML'>('JS');
  const [enableTranspilation, setEnableTranspilation] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const addDiagnostic = (message: string, type: Diagnostic['type'] = 'info') => {
    setDiagnostics(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      type,
      message,
      timestamp: Date.now()
    }]);
  };

  useEffect(() => {
    const savedCode = localStorage.getItem(STORAGE_KEY_CODE);
    const savedFiles = localStorage.getItem(STORAGE_KEY_FILES);
    if (savedFiles) {
      try {
        const parsedFiles = JSON.parse(savedFiles);
        if (Array.isArray(parsedFiles)) setFiles(parsedFiles);
      } catch (e) {}
    }
    if (savedCode) setBundledCode(savedCode);
  }, []);

  useEffect(() => {
    if (location.pathname === '/preview') {
      const html = constructPreview(files);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [files, location.pathname]);

  // Handle markdown rendering for analysis
  useEffect(() => {
    if (!aiAnalysis) {
      setRenderedAnalysis('');
      return;
    }
    const render = async () => {
      try {
        const { marked } = await import('marked');
        const html = await marked.parse(aiAnalysis);
        setRenderedAnalysis(html);
      } catch (e) {
        setRenderedAnalysis(aiAnalysis);
      }
    };
    render();
  }, [aiAnalysis]);

  const runEslint = useCallback((code: string) => {
    if (!code) return;
    const messages = performStaticLint(code);
    
    if (messages.length === 0) {
      addDiagnostic("ESLint: No static style issues found.", "info");
      return;
    }

    messages.forEach((msg, idx) => {
      const severity = msg.severity === 2 ? 'error' : 'warning';
      addDiagnostic(`[ESLint] Line ${msg.line}: ${msg.message} (${msg.ruleId})`, severity);
    });
  }, []);

  const handleFilesSelected = async (selectedFiles: File[]) => {
    setIsProcessing(true);
    const newFileEntries: FileEntry[] = [];
    let binaryCount = 0;

    try {
      for (const file of selectedFiles) {
        if (await isBinaryFile(file)) {
          binaryCount++;
          continue;
        }
        
        const text = await file.text();
        const ext = file.name.split('.').pop()?.toLowerCase();
        
        // Granular diagnostics for .json, .txt, .md
        if (!text || text.trim().length === 0) {
          let msg = `File "${file.name}" is empty.`;
          if (ext === 'json') msg = `JSON configuration file "${file.name}" is completely empty.`;
          if (ext === 'md') msg = `Markdown documentation "${file.name}" has no content.`;
          if (ext === 'txt') msg = `Plain text file "${file.name}" is blank.`;
          addDiagnostic(msg, 'warning');
        } else if (ext === 'json') {
          try {
            const parsed = JSON.parse(text);
            if (Object.keys(parsed).length === 0 && !Array.isArray(parsed)) {
              addDiagnostic(`JSON file "${file.name}" is just an empty object.`, 'info');
            }
          } catch (jsonErr) {
            addDiagnostic(`Invalid JSON in "${file.name}": ${(jsonErr as Error).message}`, 'error');
          }
        } else if (ext === 'md') {
          if (!text.includes('#') && !text.includes('- ') && !text.includes('* ')) {
            addDiagnostic(`Markdown document "${file.name}" appears to lack standard formatting (headers/lists).`, 'info');
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
      
      if (newFileEntries.length > 0) {
        setFiles(prev => [...prev, ...newFileEntries]);
        addDiagnostic(`Successfully added ${newFileEntries.length} file(s) to workspace.`);
      }
      
      if (binaryCount > 0) {
        addDiagnostic(`Skipped ${binaryCount} binary/system metadata file(s).`, 'warning');
      }
    } catch (err) { 
      addDiagnostic('Error reading files from drop event.', 'error'); 
    } finally { 
      setIsProcessing(false); 
    }
  };

  const handleBundle = useCallback(async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    try {
      let finalCode = '';
      if (bundleType === 'HTML') {
        finalCode = constructPreview(files);
      } else {
        const jsFiles = files.filter(f => /\.(js|ts|jsx|tsx|mjs|cjs)$/i.test(f.name));
        
        if (jsFiles.length === 0) {
           addDiagnostic("No JS/TS source files found. Bundling remaining text assets as generic source.", "warning");
           finalCode = files.map(f => `// --- ${f.name} ---\n${f.content}\n`).join('\n');
        } else {
           finalCode = jsFiles.map(f => `// --- ${f.name} ---\n${f.content}\n`).join('\n');
        }
        
        if (enableTranspilation && jsFiles.length > 0) {
          try {
            const Babel = await import('@babel/standalone');
            const sanitizedCode = finalCode.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
            
            const res = Babel.transform(sanitizedCode, { 
              presets: ['env', 'react'], 
              filename: 'bundle.js', 
              retainLines: true 
            });
            if (res.code) finalCode = res.code;
          } catch (babelError) {
            const msg = (babelError as Error).message;
            throw new Error(`Syntax Error in workspace code: ${msg.split('\n')[0]}. Ensure you are not bundling non-JS files.`);
          }
        }
      }

      setBundledCode(finalCode);
      addDiagnostic(`Workspace bundled successfully as ${bundleType}.`);
      
      runEslint(finalCode);
      
      localStorage.setItem(STORAGE_KEY_CODE, finalCode);
      localStorage.setItem(STORAGE_KEY_FILES, JSON.stringify(files));
    } catch (err) { 
      console.error(err);
      addDiagnostic(`${(err as Error).message}`, 'error'); 
    } finally { setIsProcessing(false); }
  }, [files, enableTranspilation, bundleType, runEslint]);

  const handleCopy = () => {
    if (!bundledCode) return;
    navigator.clipboard.writeText(bundledCode);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    addDiagnostic('Bundle copied to clipboard.');
  };

  const handleAiAudit = async () => {
    if (!bundledCode) {
      addDiagnostic("Bundle your code first before auditing.", "warning");
      return;
    }
    setActiveAiTab('analysis');
    setIsAiLoading(true);
    try {
      const analysis = await analyzeBundleWithGemini(bundledCode);
      setAiAnalysis(analysis);
      addDiagnostic("AI code audit complete.");
    } catch (e) {
      addDiagnostic(`Audit failed: ${(e as Error).message}`, 'error');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAiLint = async () => {
    if (!bundledCode) {
      addDiagnostic("Bundle your code first before linting.", "warning");
      return;
    }
    setActiveAiTab('lint');
    setIsLintLoading(true);
    try {
      const issues = await lintBundleWithGemini(bundledCode);
      setLintIssues(issues);
      addDiagnostic(`AI linting complete. Found ${issues.length} issues.`);
    } catch (e) {
      addDiagnostic(`Linting failed: ${(e as Error).message}`, 'error');
    } finally {
      setIsLintLoading(false);
    }
  };

  const handleAiDiscover = async () => {
    if (!bundledCode) {
      addDiagnostic("Bundle your code first before scanning.", "warning");
      return;
    }
    setActiveAiTab('discover');
    setIsDiscovering(true);
    try {
      const components = await discoverComponentsWithGemini(bundledCode);
      setDiscoveredComponents(components);
      addDiagnostic(`Component discovery complete. Identified ${components.length} components.`);
    } catch (e) {
      addDiagnostic(`Discovery failed: ${(e as Error).message}`, 'error');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div className="min-h-screen pb-20 relative overflow-hidden font-sans">
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-0">
         <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-neon-cyan/5 rounded-full blur-[100px]" />
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-neon-magenta/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight flex items-center gap-3">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-neon-magenta animate-pulse-fast">BundleBlitz</span>
              <Zap className="text-neon-cyan fill-current" size={40} />
            </h1>
            <p className="text-gray-400 text-lg">Instant playgrounds from your components.</p>
          </div>
          <div className="flex gap-4">
            <div className="bg-dark-card border border-white/10 px-4 py-2 rounded-lg text-sm text-white">Files: {files.length}</div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <DropZone onFilesSelected={handleFilesSelected} />

            {files.length > 0 && (
              <div className="bg-dark-card border border-white/10 rounded-xl overflow-hidden flex flex-col max-h-[300px] shadow-2xl">
                <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                  <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
                    <Braces size={14} className="text-neon-cyan" /> Workspace Assets
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {files.map((file) => {
                    const { Icon, color, bg } = getFileTypeInfo(file.name);
                    return (
                      <div key={file.id} className="group flex items-center justify-between p-3 border-b border-white/5 hover:bg-white/10 transition-all">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2 rounded-lg ${bg} ${color} shrink-0`}>
                            <Icon size={16} />
                          </div>
                          <span className="text-sm text-gray-200 font-medium truncate">{file.name}</span>
                        </div>
                        <button onClick={() => handleRemoveFile(file.id)} className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-red-400 rounded-md">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {files.length > 0 && (
              <div className="bg-dark-card border border-white/10 rounded-xl overflow-hidden p-4">
                 <div className="space-y-3 mb-6">
                    <div className="flex bg-gray-800 rounded-lg p-1">
                      <button onClick={()=>setBundleType('JS')} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${bundleType==='JS'?'bg-white/10 text-white':'text-gray-400'}`}>JS</button>
                      <button onClick={()=>setBundleType('HTML')} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${bundleType==='HTML'?'bg-orange-500/20 text-orange-400':'text-gray-400'}`}>HTML</button>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input type="checkbox" className="accent-neon-cyan" checked={enableTranspilation} onChange={e=>setEnableTranspilation(e.target.checked)} />
                      <span className="text-xs text-gray-300">Transpile (Babel)</span>
                    </label>
                 </div>
                 <button onClick={handleBundle} disabled={isProcessing} className="w-full py-3 bg-gradient-to-r from-neon-cyan to-neon-purple rounded-lg text-dark-bg font-bold flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(0,250,255,0.2)]">
                    {isProcessing ? <Activity className="animate-spin" size={18} /> : <Zap size={18} />} 
                    Bundle Code
                 </button>
              </div>
            )}
            <DiagnosticPanel diagnostics={diagnostics} onDismiss={id=>setDiagnostics(prev=>prev.filter(d=>d.id!==id))} />
          </div>

          <div className="lg:col-span-8 flex flex-col gap-6">
            <nav className="flex items-center gap-2 p-1 bg-dark-card border border-white/10 rounded-xl w-fit shadow-xl">
              {[
                { path: '/editor', label: 'Code', icon: Code },
                { path: '/visualizer', label: 'Stats', icon: LayoutTemplate },
                { path: '/ai-insights', label: 'AI Insights', icon: Sparkles },
                { path: '/playground', label: 'Playground', icon: Boxes },
                { path: '/preview', label: 'Preview', icon: Play },
              ].map(tab => (
                <Link key={tab.path} to={tab.path} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${location.pathname===tab.path?'bg-white/10 text-neon-cyan shadow-neon-cyan/10':'text-gray-400 hover:text-white'}`}>
                  <tab.icon size={16} />{tab.label}
                </Link>
              ))}
            </nav>

            <div className="flex-1 min-h-[600px] bg-dark-card border border-white/10 rounded-xl overflow-hidden relative shadow-2xl flex flex-col">
              <Routes>
                <Route path="/" element={<Navigate to="/editor" replace />} />
                <Route path="/editor" element={
                  <div className="flex-1 flex flex-col relative">
                    {bundledCode && (
                      <div className="absolute top-4 right-4 z-10 flex gap-2">
                        <button onClick={handleCopy} className="p-2 bg-dark-bg/80 border border-white/10 rounded-lg text-gray-400 hover:text-neon-cyan transition-colors">
                          {isCopied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                        </button>
                      </div>
                    )}
                    <textarea value={bundledCode} readOnly className="flex-1 w-full h-full bg-dark-bg p-6 font-mono text-sm text-gray-300 focus:outline-none resize-none leading-relaxed custom-scrollbar" placeholder="// Bundle your workspace to see output..." />
                  </div>
                } />
                <Route path="/visualizer" element={<Visualizer files={files} />} />
                <Route path="/playground" element={<Playground files={files} bundledCode={bundledCode} components={discoveredComponents} />} />
                <Route path="/ai-insights" element={
                  <div className="flex flex-col h-full">
                    <div className="p-6 bg-white/[0.02] border-b border-white/10">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-1">
                          <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Cpu size={20} className="text-neon-cyan" />
                            AI Insight Dashboard
                          </h2>
                          <p className="text-xs text-gray-400">Gemini-powered code analysis and real-time intelligence.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button 
                            onClick={handleAiAudit} 
                            disabled={isAiLoading}
                            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${isAiLoading ? 'bg-white/5 text-gray-500' : 'bg-neon-purple/20 text-neon-purple border border-neon-purple/30 hover:bg-neon-purple hover:text-white'}`}
                          >
                            {isAiLoading ? <Activity size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                            Audit Code
                          </button>
                          <button 
                            onClick={handleAiLint} 
                            disabled={isLintLoading}
                            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${isLintLoading ? 'bg-white/5 text-gray-500' : 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30 hover:bg-neon-cyan hover:text-white'}`}
                          >
                            {isLintLoading ? <Activity size={14} className="animate-spin" /> : <Bug size={14} />}
                            AI Linter
                          </button>
                          <button 
                            onClick={handleAiDiscover} 
                            disabled={isDiscovering}
                            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${isDiscovering ? 'bg-white/5 text-gray-500' : 'bg-neon-magenta/20 text-neon-magenta border border-neon-magenta/30 hover:bg-neon-magenta hover:text-white'}`}
                          >
                            {isDiscovering ? <Activity size={14} className="animate-spin" /> : <SearchCode size={14} />}
                            Scan Components
                          </button>
                        </div>
                      </div>
                      <div className="mt-8 flex gap-4 border-b border-white/5 overflow-x-auto">
                        <button 
                          onClick={() => setActiveAiTab('analysis')}
                          className={`pb-3 text-xs font-bold transition-all px-2 ${activeAiTab === 'analysis' ? 'text-neon-purple border-b-2 border-neon-purple' : 'text-gray-500 hover:text-white'}`}
                        >
                          Combined Report
                        </button>
                        <button 
                          onClick={() => setActiveAiTab('discover')}
                          className={`pb-3 text-xs font-bold transition-all px-2 ${activeAiTab === 'discover' ? 'text-neon-magenta border-b-2 border-neon-magenta' : 'text-gray-500 hover:text-white'}`}
                        >
                          UI Registry ({discoveredComponents.length})
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-dark-bg/20">
                      {activeAiTab === 'analysis' && (
                        <div className="space-y-8 h-full">
                          {!aiAnalysis && lintIssues.length === 0 && !isAiLoading && !isLintLoading && (
                            <div className="h-full flex flex-col items-center justify-center text-center gap-6 opacity-40 py-20">
                              <Sparkles size={64} className="text-gray-600 animate-pulse" />
                              <div className="space-y-2">
                                <h3 className="text-xl font-bold text-white">No Insight Data Yet</h3>
                                <p className="text-sm max-w-sm mx-auto">Click "Audit" or "Lint" in the dashboard above to start the intelligence engine.</p>
                              </div>
                            </div>
                          )}

                          {lintIssues.length > 0 && (
                            <section className="space-y-4">
                              <div className="flex items-center gap-2 mb-4">
                                <Bug size={18} className="text-neon-cyan" />
                                <h3 className="text-sm font-extrabold uppercase tracking-widest text-white">Linting Analysis</h3>
                              </div>
                              <div className="grid grid-cols-1 gap-3">
                                {lintIssues.map((issue, idx) => (
                                  <div key={idx} className={`p-4 rounded-xl border flex gap-4 transition-all hover:scale-[1.01] ${issue.severity === 'error' ? 'bg-red-500/5 border-red-500/20' : 'bg-yellow-500/5 border-yellow-500/20'}`}>
                                    <div className="mt-1">
                                      {issue.severity === 'error' ? <AlertCircle size={18} className="text-red-500" /> : <AlertTriangle size={18} className="text-yellow-500" />}
                                    </div>
                                    <div className="flex-1 space-y-2">
                                      <div className="flex items-center gap-3">
                                        <span className={`text-[10px] font-bold uppercase tracking-widest ${issue.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
                                          {issue.severity}
                                        </span>
                                        {issue.line && <span className="text-[10px] text-gray-500 font-mono bg-white/5 px-2 py-0.5 rounded">Line {issue.line}</span>}
                                      </div>
                                      <p className="text-sm text-gray-200 leading-relaxed">{issue.message}</p>
                                      {issue.suggestion && (
                                        <div className="text-xs text-gray-400 bg-black/40 p-3 rounded-lg border border-white/5">
                                          <div className="flex items-center gap-2 text-neon-cyan font-bold mb-1">
                                            <Sparkles size={12} />
                                            AI Suggestion
                                          </div>
                                          {issue.suggestion}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}

                          {renderedAnalysis && (
                            <section className="space-y-4 pt-6 border-t border-white/10">
                              <div className="flex items-center gap-2 mb-4">
                                <ShieldCheck size={18} className="text-neon-purple" />
                                <h3 className="text-sm font-extrabold uppercase tracking-widest text-white">Architectural Audit</h3>
                              </div>
                              <div className="bg-white/5 p-6 rounded-2xl border border-white/10 shadow-inner">
                                <div className="prose prose-invert prose-sm max-w-none prose-headings:text-neon-purple prose-strong:text-neon-magenta prose-code:text-neon-cyan prose-a:text-neon-cyan" dangerouslySetInnerHTML={{ __html: renderedAnalysis }} />
                              </div>
                            </section>
                          )}
                        </div>
                      )}

                      {activeAiTab === 'discover' && (
                        <div className="h-full">
                          {discoveredComponents.length > 0 ? (
                            <div className="space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {discoveredComponents.map((comp, idx) => (
                                  <div key={idx} className="bg-white/5 border border-white/10 p-5 rounded-2xl hover:border-neon-magenta/50 transition-all group relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-neon-magenta/5 rounded-full blur-3xl -mr-12 -mt-12 group-hover:bg-neon-magenta/20 transition-all"></div>
                                    <div className="flex justify-between items-start mb-3 relative z-10">
                                      <h5 className="font-mono text-neon-magenta font-bold flex items-center gap-2">
                                        <Boxes size={16} />
                                        {comp.name}
                                      </h5>
                                    </div>
                                    <p className="text-xs text-gray-400 line-clamp-2 mb-6 h-8">{comp.description || 'UI Component found in source.'}</p>
                                    <div className="flex flex-wrap gap-1 relative z-10">
                                      {comp.props.slice(0, 4).map(p => (
                                        <span key={p.name} className="text-[9px] bg-black/40 px-2 py-1 rounded text-gray-500 border border-white/5 flex items-center gap-1">
                                          <div className={`w-1 h-1 rounded-full ${p.type === 'string' ? 'bg-blue-400' : p.type === 'number' ? 'bg-green-400' : 'bg-neon-magenta'}`}></div>
                                          {p.name}
                                        </span>
                                      ))}
                                      {comp.props.length > 4 && <span className="text-[9px] text-gray-600 px-2 py-1">+{comp.props.length - 4} more</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="flex gap-4">
                                <Link to="/playground" className="flex-1 py-4 bg-gradient-to-r from-neon-magenta to-neon-purple text-white font-bold rounded-xl text-center hover:brightness-110 transition-all shadow-xl shadow-neon-magenta/20 flex items-center justify-center gap-2">
                                  <Boxes size={18} />
                                  Open Interactive Playground
                                </Link>
                              </div>
                            </div>
                          ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center gap-6 opacity-40 py-20">
                              <Boxes size={64} className="text-gray-600" />
                              <div className="space-y-2">
                                <h3 className="text-xl font-bold text-white">Component Registry Empty</h3>
                                <p className="text-sm max-w-xs mx-auto">Run "Scan Components" to detect exports and automatically build playgrounds.</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                } />
                <Route path="/preview" element={<iframe src={previewUrl || ''} className="w-full h-full bg-white border-none" />} />
              </Routes>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const router = createHashRouter([
  {
    path: "/*",
    element: <BundleBlitz />,
  },
], {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  }
});

const App: React.FC = () => <RouterProvider router={router} />;
export default App;