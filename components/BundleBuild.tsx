
import React, { useState, useRef, useCallback } from 'react';
import { 
  Smartphone, Apple, Image as ImageIcon, 
  Download, Upload, Layout, Monitor,
  Settings, Zap, Info, Smartphone as AndroidIcon,
  Circle, Square, Layers, Palette, RotateCw
} from 'lucide-react';
import { FileEntry } from '../types';

interface BundleBuildProps {
  files: FileEntry[];
  bundledCode: string;
}

const ANDROID_ICON_SIZES = [
  { name: 'ldpi', size: 36, usage: 'Small icons' },
  { name: 'mdpi', size: 48, usage: 'Baseline' },
  { name: 'hdpi', size: 72, usage: 'High density' },
  { name: 'xhdpi', size: 96, usage: 'Extra high density' },
  { name: 'xxhdpi', size: 144, usage: 'Web store' },
  { name: 'xxxhdpi', size: 192, usage: 'Launcher icon' },
  { name: 'play_store', size: 512, usage: 'Store listing' },
];

const IOS_ICON_SIZES = [
  { name: 'iPhone App', size: 120, usage: '@2x' },
  { name: 'iPhone App', size: 180, usage: '@3x' },
  { name: 'iPad App', size: 76, usage: 'iPad' },
  { name: 'iPad App', size: 152, usage: 'iPad @2x' },
  { name: 'App Store', size: 1024, usage: 'Marketing' },
];

export const BundleBuild: React.FC<BundleBuildProps> = ({ files, bundledCode }) => {
  const [platform, setPlatform] = useState<'android' | 'ios'>('android');
  const [appName, setAppName] = useState('MyBlitzApp');
  const [packageName, setPackageName] = useState('com.bundleblitz.app');
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDraggingIcon, setIsDraggingIcon] = useState(false);
  const [iconShape, setIconShape] = useState<'circle' | 'square' | 'rounded'>('rounded');
  const iconInputRef = useRef<HTMLInputElement>(null);

  const processIconFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setIconPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processIconFile(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingIcon(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingIcon(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingIcon(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processIconFile(file);
  }, []);

  const generateAssets = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      alert('Asset package generation simulation complete. In a real environment, this would download a ZIP containing AndroidManifest.xml, Info.plist, and resized icons.');
    }, 2000);
  };

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-3">
            <Smartphone className="text-neon-cyan" size={24} />
            BundleBuild <span className="text-xs bg-neon-cyan/10 text-neon-cyan px-2 py-0.5 rounded ml-2">v1.0-BETA</span>
          </h2>
          <p className="text-gray-500 text-sm mt-1">Package your web bundle for iOS & Android distribution.</p>
        </div>
        <div className="flex gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
          <button 
            onClick={() => setPlatform('android')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${platform === 'android' ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'text-gray-400 hover:text-white'}`}
          >
            <AndroidIcon size={14} /> Android
          </button>
          <button 
            onClick={() => setPlatform('ios')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${platform === 'ios' ? 'bg-white text-black shadow-lg shadow-white/20' : 'text-gray-400 hover:text-white'}`}
          >
            <Apple size={14} /> iOS
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        {/* Left Col: Config */}
        <div className="lg:col-span-4 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2">
          {/* App Metadata Card */}
          <div className="bg-dark-card border border-white/10 rounded-2xl p-6 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
              <Settings size={14} className="text-neon-cyan" /> App Manifest Data
            </h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400">Display Name</label>
                <input 
                  type="text" 
                  value={appName} 
                  onChange={(e) => setAppName(e.target.value)}
                  className="w-full bg-dark-bg border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-neon-cyan/50"
                  placeholder="Blitz App"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400">Package Identifier</label>
                <input 
                  type="text" 
                  value={packageName} 
                  onChange={(e) => setPackageName(e.target.value)}
                  className="w-full bg-dark-bg border border-white/10 rounded-lg p-2.5 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-neon-magenta/50"
                  placeholder="com.example.app"
                />
              </div>
            </div>
          </div>

          {/* Icon Designer Card */}
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`bg-dark-card border rounded-2xl p-6 space-y-6 transition-all duration-300 relative overflow-hidden ${isDraggingIcon ? 'border-neon-magenta ring-2 ring-neon-magenta/20 bg-neon-magenta/5' : 'border-white/10'}`}
          >
            {isDraggingIcon && (
              <div className="absolute inset-0 bg-neon-magenta/10 flex items-center justify-center z-10 pointer-events-none backdrop-blur-[2px]">
                <div className="flex flex-col items-center gap-2 animate-bounce">
                  <Upload size={32} className="text-neon-magenta" />
                  <span className="text-xs font-black text-neon-magenta uppercase tracking-tighter">Drop to update icon</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
                <Palette size={14} className="text-neon-magenta" /> Asset Designer
              </h3>
              <button 
                onClick={() => iconInputRef.current?.click()}
                className="text-[10px] font-bold text-neon-cyan flex items-center gap-1 hover:underline"
              >
                <Upload size={12} /> Upload Icon
              </button>
              <input type="file" ref={iconInputRef} className="hidden" accept="image/*" onChange={handleIconUpload} />
            </div>

            <div className="flex flex-col items-center gap-6">
              <div className={`relative w-32 h-32 bg-dark-bg border border-white/10 flex items-center justify-center overflow-hidden transition-all duration-300 shadow-2xl ${iconShape === 'circle' ? 'rounded-full' : iconShape === 'rounded' ? 'rounded-3xl' : 'rounded-none'}`}>
                {iconPreview ? (
                  <img src={iconPreview} className="w-full h-full object-cover" alt="App Icon" />
                ) : (
                  <ImageIcon size={48} className="text-gray-700" />
                )}
                <div className="absolute inset-0 border-2 border-white/5 pointer-events-none"></div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setIconShape('rounded')}
                  className={`p-2 rounded-lg border transition-all ${iconShape === 'rounded' ? 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan' : 'bg-white/5 border-white/10 text-gray-500'}`}
                >
                  <Square size={16} />
                </button>
                <button 
                  onClick={() => setIconShape('circle')}
                  className={`p-2 rounded-lg border transition-all ${iconShape === 'circle' ? 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan' : 'bg-white/5 border-white/10 text-gray-500'}`}
                >
                  <Circle size={16} />
                </button>
                <button 
                  onClick={() => setIconShape('square')}
                  className={`p-2 rounded-lg border transition-all ${iconShape === 'square' ? 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan' : 'bg-white/5 border-white/10 text-gray-500'}`}
                >
                  <Layout size={16} />
                </button>
              </div>
            </div>
            <p className="text-[9px] text-gray-600 text-center italic">Tip: You can also drag and drop an image file anywhere on this card.</p>
          </div>

          <button 
            onClick={generateAssets}
            disabled={isGenerating}
            className="w-full bg-gradient-to-r from-neon-magenta to-neon-purple text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-neon-magenta/20 disabled:opacity-50"
          >
            {isGenerating ? <RotateCw className="animate-spin" size={18} /> : <Download size={18} />}
            Generate {platform.toUpperCase()} Assets
          </button>
        </div>

        {/* Right Col: Asset Grid & Preview */}
        <div className="lg:col-span-8 flex flex-col gap-6 overflow-hidden">
          {/* Asset Grid (Android Studio Style) */}
          <div className="bg-dark-card border border-white/10 rounded-2xl p-6 flex-1 flex flex-col overflow-hidden">
             <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2 mb-6">
                <Layers size={14} className="text-blue-400" /> Target Resolution Matrix
              </h3>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
                {(platform === 'android' ? ANDROID_ICON_SIZES : IOS_ICON_SIZES).map((asset) => (
                  <div key={asset.name + asset.size} className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col items-center gap-3 group hover:border-white/20 transition-all">
                    <div className={`w-12 h-12 bg-dark-bg border border-white/10 flex items-center justify-center overflow-hidden ${platform === 'ios' ? 'rounded-xl' : iconShape === 'circle' ? 'rounded-full' : iconShape === 'rounded' ? 'rounded-lg' : ''}`}>
                      {iconPreview ? (
                        <img src={iconPreview} className="w-full h-full object-cover" alt="Icon Preview" />
                      ) : (
                        <Zap size={20} className="text-gray-800" />
                      )}
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] font-black text-white leading-tight uppercase">{asset.name}</div>
                      <div className="text-[9px] text-gray-500 font-mono mt-1">{asset.size} x {asset.size}</div>
                      <div className="text-[8px] text-neon-cyan uppercase mt-1 opacity-0 group-hover:opacity-100 transition-opacity">{asset.usage}</div>
                    </div>
                  </div>
                ))}
              </div>
          </div>

          {/* Device Mockup Preview */}
          <div className="bg-dark-card border border-white/10 rounded-2xl p-6 h-64 flex flex-col items-center justify-center relative overflow-hidden group">
            <div className="absolute top-4 left-6">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
                <Monitor size={14} className="text-green-400" /> Interaction Preview
              </h3>
            </div>
            
            <div className="relative w-28 h-52 bg-black rounded-[2rem] border-4 border-gray-800 shadow-2xl flex flex-col overflow-hidden">
              <div className="h-4 bg-black w-full flex justify-center items-end">
                <div className="w-10 h-1 bg-gray-900 rounded-full mb-1"></div>
              </div>
              <div className="flex-1 bg-white/10 relative p-4 flex flex-col items-center justify-center">
                {/* Simulated Home Screen */}
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({length: 8}).map((_, i) => (
                    <div key={i} className="w-5 h-5 bg-white/5 rounded-md"></div>
                  ))}
                  <div className={`w-5 h-5 flex items-center justify-center overflow-hidden animate-bounce ${platform === 'ios' ? 'rounded-md' : iconShape === 'circle' ? 'rounded-full' : iconShape === 'rounded' ? 'rounded-sm' : ''}`}>
                    {iconPreview ? (
                      <img src={iconPreview} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-neon-cyan"></div>
                    )}
                  </div>
                </div>
                <div className="text-[6px] text-white/40 mt-1 font-bold">{appName}</div>
              </div>
              <div className="h-4 bg-black w-full flex justify-center items-center">
                 <div className="w-6 h-0.5 bg-gray-700 rounded-full"></div>
              </div>
            </div>

            <div className="absolute bottom-4 right-6 flex items-center gap-2 text-[10px] text-gray-500">
              <Info size={12} />
              Simulated {platform} home screen deployment.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
