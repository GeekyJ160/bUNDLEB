
import React, { useState, useEffect, useMemo } from 'react';
import { ComponentMetadata, FileEntry } from '../types';
import { 
  Box, Sliders, Play, Search, Info, ToggleLeft, 
  Type, Hash, Copy, RotateCcw, Braces, Layers,
  Terminal, Monitor, Sparkles, Check
} from 'lucide-react';

interface PlaygroundProps {
  files: FileEntry[];
  bundledCode: string;
  components: ComponentMetadata[];
}

export const Playground: React.FC<PlaygroundProps> = ({ files, bundledCode, components }) => {
  const [selectedComponent, setSelectedComponent] = useState<ComponentMetadata | null>(components[0] || null);
  const [propValues, setPropValues] = useState<Record<string, any>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Initialize props when component selection changes
  useEffect(() => {
    if (selectedComponent) {
      resetProps();
    }
  }, [selectedComponent]);

  const resetProps = () => {
    if (!selectedComponent) return;
    const initial: Record<string, any> = {};
    selectedComponent.props.forEach(p => {
      initial[p.name] = p.defaultValue !== undefined ? p.defaultValue : (p.type === 'boolean' ? false : p.type === 'number' ? 0 : '');
    });
    setPropValues(initial);
  };

  const constructPlaygroundPreview = (component: ComponentMetadata, props: Record<string, any>) => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; padding: 0; display: flex; items-center; justify-center; min-height: 100vh; background: #fff; }
    #playground-root { padding: 40px; display: flex; align-items: center; justify-content: center; width: 100%; }
    /* Grid background for playground feel */
    body::before {
      content: ""; position: absolute; inset: 0;
      background-image: radial-gradient(#e5e7eb 1px, transparent 1px);
      background-size: 20px 20px; z-index: -1;
    }
  </style>
</head>
<body>
  <div id="playground-root"></div>
  <script type="module">
    // Injected Bundled Code
    ${bundledCode}
    
    const Target = window["${component.name}"] || (typeof ${component.name} !== 'undefined' ? ${component.name} : null);

    if (Target) {
      const root = ReactDOM.createRoot(document.getElementById('playground-root'));
      try {
        root.render(React.createElement(Target, ${JSON.stringify(props)}));
      } catch (e) {
        document.getElementById('playground-root').innerHTML = '<div style="color:red; font-family:sans-serif; text-align:center"><h3>Render Error</h3><p>' + e.message + '</p></div>';
      }
    } else {
       document.getElementById('playground-root').innerHTML = '<div style="color:#666; font-family:sans-serif; text-align:center"><h3>Component Not Found</h3><p>Ensure <b>${component.name}</b> is defined in your code.</p></div>';
    }
  </script>
</body>
</html>`;
    return html;
  };

  useEffect(() => {
    if (!selectedComponent) return;
    const html = constructPlaygroundPreview(selectedComponent, propValues);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedComponent, propValues, bundledCode]);

  const handlePropChange = (name: string, value: any) => {
    setPropValues(prev => ({ ...prev, [name]: value }));
  };

  const copyUsage = () => {
    if (!selectedComponent) return;
    const props = Object.entries(propValues)
      .map(([k, v]) => {
        const val = typeof v === 'string' ? `"${v}"` : `{${v}}`;
        return `${k}=${val}`;
      })
      .join(' ');
    const usage = `<${selectedComponent.name} ${props} />`;
    navigator.clipboard.writeText(usage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (components.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4 p-12 text-center bg-dark-bg/30">
        <div className="p-6 rounded-full bg-white/5 border border-white/10 mb-2">
          <Sparkles size={48} className="text-neon-cyan opacity-40 animate-pulse" />
        </div>
        <h3 className="text-xl font-bold text-white">No Components Detected</h3>
        <p className="max-w-xs text-sm">Head to the <b>AI Insights</b> tab and click <b>Discover Components</b> to find elements you can interact with here.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden font-sans">
      {/* Sidebar: Components & Props */}
      <div className="w-full md:w-80 border-r border-white/10 flex flex-col bg-dark-surface/50 backdrop-blur-sm">
        <div className="p-4 border-b border-white/10 bg-white/5">
          <h3 className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest flex items-center gap-2 mb-3">
            <Layers size={14} className="text-neon-cyan" />
            Select Component
          </h3>
          <select 
            value={selectedComponent?.name || ''}
            onChange={(e) => setSelectedComponent(components.find(c => c.name === e.target.value) || null)}
            className="w-full bg-dark-bg border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:ring-1 focus:ring-neon-cyan/50 text-sm appearance-none cursor-pointer"
          >
            {components.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-8">
          {selectedComponent ? (
            <>
              <div className="space-y-6">
                 <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <Sliders size={14} />
                      Component Props
                    </h4>
                    <button onClick={resetProps} title="Reset to defaults" className="text-gray-500 hover:text-white transition-colors">
                      <RotateCcw size={14} />
                    </button>
                 </div>
                 
                 <div className="space-y-5">
                   {selectedComponent.props.map(prop => (
                     <div key={prop.name} className="space-y-2">
                       <div className="flex items-center justify-between">
                         <label className="text-xs font-bold text-gray-300 flex items-center gap-2">
                           {prop.type === 'string' && <Type size={12} className="text-blue-400" />}
                           {prop.type === 'number' && <Hash size={12} className="text-green-400" />}
                           {prop.type === 'boolean' && <ToggleLeft size={12} className="text-neon-magenta" />}
                           {prop.type === 'enum' && <Braces size={12} className="text-neon-purple" />}
                           {prop.name}
                         </label>
                         <span className="text-[10px] text-gray-600 font-mono italic">{prop.type}</span>
                       </div>
                       
                       {prop.type === 'boolean' ? (
                         <div className="flex items-center gap-2 bg-dark-bg rounded-lg p-1 border border-white/5">
                            <button 
                              onClick={() => handlePropChange(prop.name, true)}
                              className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all ${propValues[prop.name] === true ? 'bg-neon-magenta text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            >TRUE</button>
                            <button 
                              onClick={() => handlePropChange(prop.name, false)}
                              className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all ${propValues[prop.name] === false ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            >FALSE</button>
                         </div>
                       ) : prop.type === 'enum' ? (
                         <select
                           value={propValues[prop.name]}
                           onChange={(e) => handlePropChange(prop.name, e.target.value)}
                           className="w-full bg-dark-bg border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-neon-cyan"
                         >
                           {prop.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                         </select>
                       ) : prop.type === 'number' ? (
                         <input 
                           type="number"
                           value={propValues[prop.name]}
                           onChange={(e) => handlePropChange(prop.name, Number(e.target.value))}
                           className="w-full bg-dark-bg border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-neon-cyan"
                         />
                       ) : (
                         <input 
                           type="text"
                           value={propValues[prop.name]}
                           onChange={(e) => handlePropChange(prop.name, e.target.value)}
                           className="w-full bg-dark-bg border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-neon-cyan"
                         />
                       )}
                       {prop.description && (
                         <p className="text-[10px] text-gray-600 leading-tight border-l border-white/10 pl-2">{prop.description}</p>
                       )}
                     </div>
                   ))}
                 </div>
              </div>
              
              <div className="pt-6 border-t border-white/10">
                 <button 
                    onClick={copyUsage}
                    className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg ${copied ? 'bg-green-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                 >
                   {copied ? <Check size={14} /> : <Copy size={14} />}
                   {copied ? 'Copied Snippet!' : 'Copy JSX Usage'}
                 </button>
              </div>
            </>
          ) : (
            <div className="text-center text-gray-600 text-xs py-10">Select a component to begin tweaking.</div>
          )}
        </div>
      </div>

      {/* Main Area: Preview */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-white shadow-inner">
        <div className="absolute top-4 left-4 z-10 flex items-center gap-3 bg-dark-bg/90 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-2xl">
           <Play size={14} className="text-green-400 fill-current" />
           <span className="text-[10px] font-extrabold text-white uppercase tracking-widest flex items-center gap-2">
             <Monitor size={12} className="text-neon-cyan" />
             Live Renderer
           </span>
        </div>

        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
           <div className="flex items-center gap-1.5 bg-dark-card/90 border border-white/10 px-3 py-1.5 rounded-lg shadow-xl text-[10px] text-gray-400">
             <Terminal size={12} className="text-neon-purple" />
             <span className="font-mono text-neon-purple">{selectedComponent?.name}</span>
           </div>
        </div>
        
        {previewUrl ? (
          <iframe 
            src={previewUrl}
            className="w-full h-full border-none"
            title="Playground Renderer"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-dark-bg text-gray-500 gap-4">
             <RotateCcw className="animate-spin text-neon-cyan" size={32} />
             <span className="text-sm font-bold uppercase tracking-widest animate-pulse">Initializing Playground</span>
          </div>
        )}

        <div className="absolute bottom-4 left-4 z-10 right-4 flex justify-center">
           <div className="bg-dark-card/80 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full text-[10px] text-gray-500 flex items-center gap-3">
             <Info size={12} className="text-neon-cyan" />
             Interactive Sandbox: Props are synced in real-time to the isolated renderer.
           </div>
        </div>
      </div>
    </div>
  );
};
