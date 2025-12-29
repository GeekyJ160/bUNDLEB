
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
import { FileEntry, Diagnostic, BundleStats, LintIssue, ComponentMetadata, ViewMode } from './types';
import { analyzeBundleWithGemini, lintBundleWithGemini, refactorBundleWithGemini, discoverComponentsWithGemini } from './services/geminiService';
import { performStaticLint } from './services/eslintService';
import { 
  Zap, Download, Copy, Trash2, LayoutTemplate, 
  Activity, Sparkles, Code, FileText, Settings, Play,
  FileJson, Palette, File as FileGeneric, Braces, AlignLeft,
  Bug, AlertTriangle, Check, Info as InfoIcon, FileCode2,
  Globe, Paintbrush, RotateCw, GitCompare, Boxes, ExternalLink,
  ChevronRight, ClipboardCheck, AlertCircle, ListFilter,
  ShieldCheck, Cpu, SearchCode, BookOpen, StickyNote, Wand2,
  FileDown, ChevronDown, FileType, AlignJustify
} from 'lucide-react';

const STORAGE_KEY_CODE = 'bundle_blitz_code';
const STORAGE_KEY_FILES = 'bundle_blitz_files';
const STORAGE_KEY_FORMAT = 'bundle_blitz_format';

/**
 * Utility to construct a standalone HTML bundle
 */
const constructPreview = (files: FileEntry[]) => {
  const htmlFile = files.find(f => /\.(html|htm)$/i.test(f.name));
  const cssFiles = files.filter(f => /\.(css|scss|less)$/i.test(f.name));
  const jsFiles = files.filter(f => /\.(js|ts|jsx|tsx|mjs)$/i.test(f.name));

  let htmlContent = htmlFile ? htmlFile.content : '';

  if (!htmlContent) {
    htmlContent = '<div id="root"></div>';
  }

  const hasDocType = /<!DOCTYPE html/i.test(htmlContent);
  const hasHtmlTag = /<html/i.test(htmlContent);
  const hasHeadTag = /<head/i.test(htmlContent);
  const hasBodyTag = /<body/i.test(htmlContent);
  const hasTitleTag = /<title/i.test(htmlContent);

  let finalHtml = htmlContent;

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
  } else if (!hasHeadTag && hasHtmlTag) {
    finalHtml = finalHtml.replace(/<html[^>]*>/i, (m) => `${m}\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>BundleBlitz Preview</title>\n</head>`);
  }

  const baseStyles = `
    :root { font-family: system-ui, sans-serif; line-height: 1.5; color: #1a1a1a; }
    body { margin: 0; padding: 20px; background: #fff; }
  `;
  const userStyles = cssFiles.map(f => `/* --- ${f.name} --- */\n${f.content}`).join('\n');
  const styleBlock = `<style>\n${baseStyles}\n${userStyles}\n</style>`;
  
  if (finalHtml.toLowerCase().includes('</head>')) {
    finalHtml = finalHtml.replace(/<\/head>/i, `${styleBlock}\n</head>`);
  } else {
    finalHtml = finalHtml.replace(/<body[^>]*>/i, (match) => `<head>${styleBlock}</head>\n${match}`);
  }

  if (jsFiles.length > 0) {
    const scripts = jsFiles.map(f => `// --- ${f.name} ---\n${f.content}`).join('\n');
    const scriptBlock = `<script type="module">\n${scripts.replace(/<\/script>/g, '<\\/script>')}\n</script>`;
    
    if (finalHtml.toLowerCase().includes('</body>')) {
      finalHtml = finalHtml.replace(/<\/body>/i, `${scriptBlock}\n</body>`);
    } else {
      finalHtml += `\n${scriptBlock}`;
    }
  }

  return finalHtml;
};

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
      return { Icon: StickyNote, color: 'text-amber-400', bg: 'bg-amber-400/10', label: 'Plain Text' };
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

const MainApp: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [bundledCode, setBundledCode] = useState<string>('');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bundleType, setBundleType] = useState<'JS' | 'HTML'>('JS');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isAutoFormat, setIsAutoFormat] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [lintIssues, setLintIssues] = useState<LintIssue[]>([]);
  const [discoveredComponents, setDiscoveredComponents] = useState<ComponentMetadata[]>([]);
  const [activeAiTab, setActiveAiTab] = useState<'analysis' | 'lint' | 'discover'>('analysis');
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    const savedCode = localStorage.getItem(STORAGE_KEY_CODE);
    const savedFiles = localStorage.getItem(STORAGE_KEY_FILES);
    const savedFormat = localStorage.getItem(STORAGE_KEY_FORMAT);
    if (savedCode) setBundledCode(savedCode);
    if (savedFiles) {
      try {
        setFiles(JSON.parse(savedFiles));
      } catch (e) {
        console.error("Failed to parse saved files", e);
      }
    }
    if (savedFormat !== null) setIsAutoFormat(savedFormat === 'true');
  }, []);

  const addDiagnostic = useCallback((message: string, type: Diagnostic['type'] = 'info') => {
    setDiagnostics(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      type,
      message,
      timestamp: Date.now()
    }]);
  }, []);

  const formatCode = async (code: string, type: 'JS' | 'HTML'): Promise<string> => {
    try {
      setIsFormatting(true);
      // @ts-ignore
      const prettier = await import('prettier');
      // @ts-ignore
      const babelPlugin = await import('prettier/plugins/babel');
      // @ts-ignore
      const estreePlugin = await import('prettier/plugins/estree');
      // @ts-ignore
      const htmlPlugin = await import('prettier/plugins/html');
      // @ts-ignore
      const postcssPlugin = await import('prettier/plugins/postcss');

      const formatted = await prettier.format(code, {
        parser: type === 'JS' ? 'babel' : 'html',
        plugins: [babelPlugin, estreePlugin, htmlPlugin, postcssPlugin],
        semi: true,
        singleQuote: true,
        printWidth: 100,
        tabWidth: 2,
      });
      setIsFormatting(false);
      return formatted;
    } catch (e: any) {
      console.error('Formatting failed:', e);
      addDiagnostic(`Formatting failed: ${e.message}`, 'error');
      setIsFormatting(false);
      return code;
    }
  };

  const runBundler = useCallback(async (targetFiles: FileEntry[], type: 'JS' | 'HTML', forceFormat: boolean = false) => {
    if (targetFiles.length === 0) {
      setBundledCode('');
      setPreviewUrl(null);
      return;
    }
    
    let result = '';
    if (type === 'JS') {
      result = targetFiles
        .filter(f => /\.(js|jsx|ts|tsx)$/.test(f.name))
        .map(f => `// File: ${f.name}\n${f.content}`)
        .join('\n\n');
      if (!result) {
        addDiagnostic("No JS/TS files found in bundle selection.", "warning");
        result = "// No source files detected.";
      }
    } else {
      result = constructPreview(targetFiles);
    }
    
    // Apply formatting if enabled or forced
    if (isAutoFormat || forceFormat) {
      result = await formatCode(result, type);
    }

    setBundledCode(result);
    localStorage.setItem(STORAGE_KEY_CODE, result);
    localStorage.setItem(STORAGE_KEY_FILES, JSON.stringify(targetFiles));

    // Update preview URL for iframe
    const html = type === 'HTML' ? result : constructPreview(targetFiles);
    const blob = new Blob([html], { type: 'text/html' });
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(blob));

  }, [addDiagnostic, previewUrl, isAutoFormat]);

  const handleFilesSelected = async (selectedFiles: File[]) => {
    setIsProcessing(true);
    addDiagnostic(`Processing ${selectedFiles.length} files...`, 'info');
    
    const entries: FileEntry[] = [];
    for (const file of selectedFiles) {
      if (await isBinaryFile(file)) {
        addDiagnostic(`Skipped binary file: ${file.name}`, 'warning');
        continue;
      }

      const content = await file.text();
      entries.push({
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size,
        content,
        type: file.type || 'text/plain'
      });
    }

    const updatedFiles = [...files, ...entries];
    setFiles(updatedFiles);
    await runBundler(updatedFiles, bundleType);
    setIsProcessing(false);
    
    if (location.pathname === '/') {
      navigate('/visualizer');
    }
  };

  const removeFile = (id: string) => {
    const updated = files.filter(f => f.id !== id);
    setFiles(updated);
    runBundler(updated, bundleType);
    addDiagnostic("File removed from workspace.", "info");
  };

  const clearFiles = () => {
    if (files.length === 0) return;
    if (window.confirm("Are you sure you want to clear all tasks and files from the workspace?")) {
      setFiles([]);
      setBundledCode('');
      setAiAnalysis('');
      setLintIssues([]);
      setDiscoveredComponents([]);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      localStorage.removeItem(STORAGE_KEY_CODE);
      localStorage.removeItem(STORAGE_KEY_FILES);
      addDiagnostic("Workspace cleared completely.", "info");
      navigate('/');
    }
  };

  const toggleBundleType = (type: 'JS' | 'HTML') => {
    setBundleType(type);
    runBundler(files, type);
    addDiagnostic(`Switched bundle output to ${type}.`, "info");
  };

  const toggleAutoFormat = () => {
    const newVal = !isAutoFormat;
    setIsAutoFormat(newVal);
    localStorage.setItem(STORAGE_KEY_FORMAT, String(newVal));
    addDiagnostic(`Auto-formatting ${newVal ? 'enabled' : 'disabled'}.`, "info");
    if (newVal) runBundler(files, bundleType);
  };

  const manualFormat = async () => {
    const formatted = await formatCode(bundledCode, bundleType);
    setBundledCode(formatted);
    addDiagnostic("Manual formatting complete.", "info");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(bundledCode);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    addDiagnostic("Bundle copied to clipboard.", "info");
  };

  const handleExport = async (format: 'html' | 'txt' | 'pdf' | 'md') => {
    setIsExportMenuOpen(false);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `bundleblitz-${timestamp}`;
    
    try {
      if (format === 'html') {
        const content = bundleType === 'HTML' ? bundledCode : constructPreview(files);
        const blob = new Blob([content], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.html`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (format === 'txt') {
        const blob = new Blob([bundledCode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (format === 'md') {
        const markdown = `# BundleBlitz Export\n\nGenerated on: ${new Date().toLocaleString()}\n\n\`\`\`${bundleType.toLowerCase()}\n${bundledCode}\n\`\`\``;
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.md`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (format === 'pdf') {
        addDiagnostic("Generating PDF document...", "info");
        // @ts-ignore
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF();
        doc.setFont("courier", "normal");
        doc.setFontSize(8);
        const splitText = doc.splitTextToSize(bundledCode, 180);
        
        let y = 10;
        doc.text("BundleBlitz Export", 10, y);
        y += 10;
        
        for (let i = 0; i < splitText.length; i++) {
          if (y > 280) {
            doc.addPage();
            y = 10;
          }
          doc.text(splitText[i], 10, y);
          y += 4;
        }
        doc.save(`${fileName}.pdf`);
      }
      addDiagnostic(`Successfully exported as ${format.toUpperCase()}.`, "info");
    } catch (err: any) {
      addDiagnostic(`Export failed: ${err.message}`, "error");
    }
  };

  const runAiAnalysis = async () => {
    if (!bundledCode) return;
    setIsAiLoading(true);
    try {
      const result = await analyzeBundleWithGemini(bundledCode);
      setAiAnalysis(result);
      addDiagnostic("AI architecture analysis complete.", "info");
    } catch (err: any) {
      addDiagnostic(err.message, "error");
    } finally {
      setIsAiLoading(false);
    }
  };

  const runAiLint = async () => {
    if (!bundledCode) return;
    setIsAiLoading(true);
    try {
      const result = await lintBundleWithGemini(bundledCode);
      setLintIssues(result);
      addDiagnostic(`AI linting complete. Found ${result.length} potential issues.`, "info");
    } catch (err: any) {
      addDiagnostic(err.message, "error");
    } finally {
      setIsAiLoading(false);
    }
  };

  const runAiDiscovery = async () => {
    if (!bundledCode) return;
    setIsAiLoading(true);
    try {
      const result = await discoverComponentsWithGemini(bundledCode);
      setDiscoveredComponents(result);
      addDiagnostic(`AI component discovery complete. Found ${result.length} targets.`, "info");
    } catch (err: any) {
      addDiagnostic(err.message, "error");
    } finally {
      setIsAiLoading(false);
    }
  };

  const activeView = location.pathname.split('/')[1] || '';

  return (
    <div className="min-h-screen bg-dark-bg text-gray-100 flex flex-col">
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-dark-surface/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-neon-magenta to-neon-cyan rounded-xl flex items-center justify-center shadow-lg shadow-neon-magenta/20">
            <Zap className="text-white fill-white" size={20} />
          </div>
          <h1 className="text-xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
            BUNDLEBLITZ
          </h1>
        </div>

        <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
          <Link to="/" className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeView === '' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}>
            <LayoutTemplate size={14} /> Upload
          </Link>
          <Link to="/visualizer" className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeView === 'visualizer' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}>
            <Activity size={14} /> Visualizer
          </Link>
          <Link to="/editor" className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeView === 'editor' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}>
            <Code size={14} /> Code
          </Link>
          <Link to="/insights" className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeView === 'insights' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}>
            <Sparkles size={14} /> AI Insights
          </Link>
          <Link to="/playground" className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeView === 'playground' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}>
            <Boxes size={14} /> Playground
          </Link>
          <Link to="/preview" className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeView === 'preview' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}>
            <Play size={14} /> Preview
          </Link>
        </nav>
      </header>

      <main className="flex-1 overflow-hidden flex flex-row">
        {/* Workspace Sidebar */}
        <aside className="w-72 border-r border-white/10 bg-dark-surface/30 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
              <Braces size={12} className="text-neon-cyan" /> Workspace
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-dark-bg px-2 py-0.5 rounded text-neon-cyan border border-neon-cyan/20">{files.length}</span>
              {files.length > 0 && (
                <button 
                  onClick={clearFiles}
                  className="p-1 hover:text-red-500 text-gray-600 transition-all"
                  title="Clear All Files"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
          
          {/* Bundle Controls */}
          <div className="p-4 space-y-4 bg-dark-bg/40 border-b border-white/10">
            <div className="space-y-2">
              <h4 className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Output Format</h4>
              <div className="flex bg-dark-bg/80 rounded-lg p-1 border border-white/10 shadow-inner">
                <button 
                  onClick={() => toggleBundleType('JS')}
                  className={`flex-1 py-1.5 rounded-md text-[10px] font-black transition-all flex items-center justify-center gap-1.5 ${bundleType === 'JS' ? 'bg-white/10 text-yellow-400' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  <FileCode2 size={12} /> JS
                </button>
                <button 
                  onClick={() => toggleBundleType('HTML')}
                  className={`flex-1 py-1.5 rounded-md text-[10px] font-black transition-all flex items-center justify-center gap-1.5 ${bundleType === 'HTML' ? 'bg-white/10 text-orange-400' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  <Globe size={12} /> HTML
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlignJustify size={12} className="text-neon-cyan" />
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Auto-Format</span>
              </div>
              <button 
                onClick={toggleAutoFormat}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ${isAutoFormat ? 'bg-neon-cyan' : 'bg-gray-700'}`}
              >
                <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${isAutoFormat ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {files.length === 0 ? (
              <div className="p-8 text-center text-gray-600 text-xs italic">
                Workspace is empty.
              </div>
            ) : (
              files.map(file => {
                const { Icon, color, bg, label } = getFileTypeInfo(file.name);
                return (
                  <div key={file.id} className="group flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-all cursor-default">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-1.5 rounded ${bg} ${color}`}>
                        <Icon size={14} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium truncate text-gray-300">{file.name}</span>
                        <span className="text-[9px] text-gray-600">{label}</span>
                      </div>
                    </div>
                    <button onClick={() => removeFile(file.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 text-gray-600 transition-all">
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
          
          <div className="p-4 border-t border-white/10 bg-white/5">
             <DiagnosticPanel diagnostics={diagnostics} onDismiss={(id) => setDiagnostics(prev => prev.filter(d => d.id !== id))} />
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6 bg-dark-bg/20">
          <Routes>
            <Route path="/" element={
              <div className="max-w-4xl mx-auto space-y-8">
                <div className="text-center space-y-4 pt-10">
                  <h2 className="text-5xl font-black text-white tracking-tight">Project Analysis Reimagined</h2>
                  <p className="text-gray-400 max-w-xl mx-auto text-lg">Drop your project directory to visualize dependencies, analyze bundle size, and get AI-powered architecture insights.</p>
                </div>
                <DropZone onFilesSelected={handleFilesSelected} />
                {files.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-dark-card border border-white/10 p-6 rounded-2xl shadow-xl">
                      <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest mb-1">Total Files</div>
                      <div className="text-3xl font-black text-neon-cyan">{files.length}</div>
                    </div>
                    <div className="bg-dark-card border border-white/10 p-6 rounded-2xl shadow-xl">
                      <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest mb-1">Uncompressed Size</div>
                      <div className="text-3xl font-black text-neon-magenta">{(files.reduce((a, b) => a + b.size, 0) / 1024).toFixed(1)} KB</div>
                    </div>
                    <div className="bg-dark-card border border-white/10 p-6 rounded-2xl shadow-xl">
                      <div className="text-gray-500 text-[10px] font-black uppercase tracking-widest mb-1">Bundle Type</div>
                      <div className="text-3xl font-black text-white">{bundleType}</div>
                    </div>
                  </div>
                )}
              </div>
            } />
            <Route path="/visualizer" element={<Visualizer files={files} />} />
            <Route path="/editor" element={
              <div className="h-full flex flex-col gap-4 relative">
                <div className="absolute top-4 right-8 z-10 flex gap-2">
                  {isFormatting && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-dark-surface border border-neon-cyan/30 rounded-lg text-neon-cyan text-[10px] font-bold">
                      <RotateCw className="animate-spin" size={12} /> FORMATTING...
                    </div>
                  )}

                  {!isAutoFormat && (
                    <button 
                      onClick={manualFormat}
                      disabled={isFormatting || !bundledCode}
                      className="p-2 bg-dark-surface/80 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-all shadow-xl backdrop-blur-md flex items-center gap-2 px-3 disabled:opacity-50"
                      title="Format Code Now"
                    >
                      <AlignJustify size={18} />
                      <span className="text-[10px] font-bold">FORMAT</span>
                    </button>
                  )}

                  <button 
                    onClick={handleCopy}
                    className="p-2 bg-dark-surface/80 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-all shadow-xl backdrop-blur-md flex items-center gap-2 px-3"
                    title="Copy Bundle Code"
                  >
                    {isCopied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                    <span className="text-[10px] font-bold">{isCopied ? 'COPIED' : 'COPY'}</span>
                  </button>
                  
                  <div className="relative">
                    <button 
                      onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                      className="p-2 bg-neon-cyan/10 border border-neon-cyan/30 rounded-lg text-neon-cyan hover:bg-neon-cyan/20 transition-all shadow-xl backdrop-blur-md flex items-center gap-2 px-3"
                      title="Export Bundle"
                    >
                      <FileDown size={18} />
                      <span className="text-[10px] font-bold">EXPORT</span>
                      <ChevronDown size={14} className={`transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {isExportMenuOpen && (
                      <div className="absolute top-full mt-2 right-0 w-48 bg-dark-card border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 backdrop-blur-xl">
                        <button onClick={() => handleExport('html')} className="w-full px-4 py-3 text-left text-xs text-gray-300 hover:bg-white/10 flex items-center gap-3 transition-colors">
                          <Globe size={14} className="text-orange-400" /> Web Bundle (.html)
                        </button>
                        <button onClick={() => handleExport('txt')} className="w-full px-4 py-3 text-left text-xs text-gray-300 hover:bg-white/10 flex items-center gap-3 transition-colors">
                          <FileText size={14} className="text-yellow-400" /> Plain Text (.txt)
                        </button>
                        <button onClick={() => handleExport('md')} className="w-full px-4 py-3 text-left text-xs text-gray-300 hover:bg-white/10 flex items-center gap-3 transition-colors">
                          <BookOpen size={14} className="text-pink-400" /> Markdown (.md)
                        </button>
                        <button onClick={() => handleExport('pdf')} className="w-full px-4 py-3 text-left text-xs text-gray-300 hover:bg-white/10 flex items-center gap-3 border-t border-white/5 transition-colors">
                          <FileType size={14} className="text-red-400" /> PDF Document (.pdf)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 bg-dark-card border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                   <textarea 
                    value={bundledCode}
                    readOnly
                    className="w-full h-full bg-dark-bg p-8 font-mono text-sm text-gray-300 resize-none focus:outline-none custom-scrollbar leading-relaxed"
                    placeholder="Workspace output will appear here after adding files..."
                   />
                </div>
              </div>
            } />
            <Route path="/preview" element={
              <div className="h-full bg-white rounded-2xl overflow-hidden shadow-2xl relative">
                {previewUrl ? (
                  <iframe src={previewUrl} className="w-full h-full border-none" title="Live Preview" />
                ) : (
                  <div className="w-full h-full bg-dark-bg flex items-center justify-center text-gray-500 italic">
                    Add files to generate a preview.
                  </div>
                )}
              </div>
            } />
            <Route path="/insights" element={
              <div className="h-full flex flex-col gap-6">
                <div className="flex items-center gap-4 bg-white/5 p-2 rounded-xl w-fit border border-white/5">
                  <button onClick={() => setActiveAiTab('analysis')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeAiTab === 'analysis' ? 'bg-neon-cyan text-black shadow-lg shadow-neon-cyan/20' : 'text-gray-400 hover:text-white'}`}>General Analysis</button>
                  <button onClick={() => setActiveAiTab('lint')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeAiTab === 'lint' ? 'bg-neon-magenta text-white shadow-lg shadow-neon-magenta/20' : 'text-gray-400 hover:text-white'}`}>Smart Lint</button>
                  <button onClick={() => setActiveAiTab('discover')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeAiTab === 'discover' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'text-gray-400 hover:text-white'}`}>Component Discovery</button>
                </div>
                <div className="flex-1 bg-dark-card border border-white/10 rounded-2xl p-8 overflow-auto shadow-2xl relative">
                  {isAiLoading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-dark-card/80 backdrop-blur-sm z-10">
                      <RotateCw className="animate-spin text-neon-cyan" size={48} />
                      <span className="text-sm font-black text-neon-cyan animate-pulse tracking-widest">GEMINI IS PROCESSING...</span>
                    </div>
                  ) : null}
                  
                  {activeAiTab === 'analysis' && (
                    <div className="space-y-6">
                      {!aiAnalysis && (
                        <div className="flex flex-col items-center justify-center py-20 text-center gap-6">
                          <Cpu size={64} className="text-gray-700" />
                          <div className="space-y-2">
                            <h3 className="text-xl font-bold">Architecture Review</h3>
                            <p className="text-gray-500 max-w-xs mx-auto text-sm">Let Gemini analyze your bundle's structure, security, and potential optimization vectors.</p>
                          </div>
                          <button onClick={runAiAnalysis} className="bg-neon-cyan text-black px-8 py-4 rounded-xl font-bold flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-neon-cyan/20"><Cpu size={20} /> Analyze Architecture</button>
                        </div>
                      )}
                      <div className="prose prose-invert max-w-none whitespace-pre-wrap font-sans leading-relaxed">{aiAnalysis}</div>
                    </div>
                  )}
                  {activeAiTab === 'lint' && (
                    <div className="space-y-6">
                       {!lintIssues.length && (
                         <div className="flex flex-col items-center justify-center py-20 text-center gap-6">
                           <Bug size={64} className="text-gray-700" />
                           <div className="space-y-2">
                             <h3 className="text-xl font-bold">Deep Code Linting</h3>
                             <p className="text-gray-500 max-w-xs mx-auto text-sm">Uncover logical flaws, anti-patterns, and style violations with Gemini-powered static analysis.</p>
                           </div>
                           <button onClick={runAiLint} className="bg-neon-magenta text-white px-8 py-4 rounded-xl font-bold flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-neon-magenta/20"><Bug size={20} /> Deep Linting</button>
                         </div>
                       )}
                       <div className="grid grid-cols-1 gap-4">
                         {lintIssues.map((issue, i) => (
                           <div key={i} className="p-5 bg-white/5 border-l-4 border-neon-magenta rounded-xl hover:bg-white/10 transition-all">
                             <div className="flex justify-between items-start mb-2">
                               <div className="font-bold text-white text-sm">{issue.message}</div>
                               <span className="text-[10px] font-black uppercase tracking-widest text-neon-magenta bg-neon-magenta/10 px-2 py-0.5 rounded">{issue.severity}</span>
                             </div>
                             {issue.line && <div className="text-[10px] text-gray-500 font-mono mb-2 bg-black/30 px-2 py-1 rounded w-fit">Line: {issue.line}</div>}
                             {issue.suggestion && (
                               <div className="text-xs text-neon-cyan italic bg-neon-cyan/5 p-3 rounded-lg border border-neon-cyan/10">
                                 <span className="font-bold not-italic mr-2">💡 Suggestion:</span> {issue.suggestion}
                               </div>
                             )}
                           </div>
                         ))}
                       </div>
                    </div>
                  )}
                  {activeAiTab === 'discover' && (
                    <div className="space-y-6">
                       {!discoveredComponents.length && (
                         <div className="flex flex-col items-center justify-center py-20 text-center gap-6">
                           <Boxes size={64} className="text-gray-700" />
                           <div className="space-y-2">
                             <h3 className="text-xl font-bold">UI Registry Discovery</h3>
                             <p className="text-gray-500 max-w-xs mx-auto text-sm">Automatically identify React components and their prop signatures to build interactive playgrounds.</p>
                           </div>
                           <button onClick={runAiDiscovery} className="bg-purple-500 text-white px-8 py-4 rounded-xl font-bold flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-purple-500/20"><Boxes size={20} /> Discover Components</button>
                         </div>
                       )}
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         {discoveredComponents.map((comp, i) => (
                           <div key={i} className="p-5 bg-white/5 border border-white/10 rounded-2xl hover:border-neon-cyan transition-all group">
                             <div className="font-bold text-white flex items-center gap-3 text-sm">
                               <div className="p-2 bg-neon-cyan/10 rounded-lg group-hover:bg-neon-cyan group-hover:text-black transition-all">
                                 <Code size={16} />
                               </div>
                               {comp.name}
                             </div>
                             <div className="text-[10px] text-gray-500 mt-4 flex items-center gap-2">
                               <span className="bg-black/30 px-2 py-1 rounded">{comp.props.length} props identified</span>
                             </div>
                           </div>
                         ))}
                       </div>
                    </div>
                  )}
                </div>
              </div>
            } />
            <Route path="/playground" element={<Playground files={files} bundledCode={bundledCode} components={discoveredComponents} />} />
          </Routes>
        </div>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  const router = useMemo(() => createHashRouter([
    { path: '/*', element: <MainApp /> }
  ], {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true,
    }
  }), []);

  return <RouterProvider router={router} />;
};

export default App;
