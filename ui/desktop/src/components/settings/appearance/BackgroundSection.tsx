import React, { useState, useRef } from 'react';
import { useBackground, BackgroundPreset } from '../../../contexts/BackgroundContext';
import { Check, Image, Palette, Sparkles, Sun, Moon, Waves, Upload, X } from 'lucide-react';

const presets: { id: BackgroundPreset; name: string; icon: React.ReactNode; preview: string }[] = [
  { 
    id: 'default', 
    name: 'Default', 
    icon: <Moon className="w-4 h-4" />,
    preview: 'radial-gradient(ellipse 50% 50% at 50% 50%, #111116 0%, #070708 100%)'
  },
  { 
    id: 'stars', 
    name: 'Stars', 
    icon: <Sparkles className="w-4 h-4" />,
    preview: 'radial-gradient(ellipse 50% 50% at 50% 50%, #111116 0%, #070708 100%)'
  },
  { 
    id: 'aurora', 
    name: 'Aurora', 
    icon: <Palette className="w-4 h-4" />,
    preview: 'linear-gradient(135deg, rgba(17, 24, 39, 0.95) 0%, rgba(88, 28, 135, 0.5) 50%, rgba(15, 23, 42, 0.95) 100%)'
  },
  { 
    id: 'sunset', 
    name: 'Sunset', 
    icon: <Sun className="w-4 h-4" />,
    preview: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(88, 28, 135, 0.5) 40%, rgba(194, 65, 12, 0.4) 70%, rgba(15, 23, 42, 0.95) 100%)'
  },
  { 
    id: 'ocean', 
    name: 'Ocean', 
    icon: <Waves className="w-4 h-4" />,
    preview: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(6, 78, 59, 0.5) 50%, rgba(15, 23, 42, 0.95) 100%)'
  },
];

export default function BackgroundSection() {
  const { preset, customConfig, setPreset, setBackgroundImage, clearCustomBackground } = useBackground();
  const [imageUrl, setImageUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setBackgroundImage(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUrlSubmit = () => {
    if (imageUrl.trim()) {
      setBackgroundImage(imageUrl.trim());
      setShowUrlInput(false);
      setImageUrl('');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-text-default mb-1">Background</h3>
        <p className="text-xs text-text-muted mb-4">
          Customize the app background with presets or your own image.
        </p>
      </div>

      {/* Preset Grid */}
      <div className="grid grid-cols-5 gap-2">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={`
              relative flex flex-col items-center justify-center p-3 rounded-lg border transition-all
              ${preset === p.id && preset !== 'custom'
                ? 'border-white/30 bg-white/10'
                : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
              }
            `}
          >
            <div 
              className="w-10 h-10 rounded-md mb-2 border border-white/10"
              style={{ background: p.preview }}
            />
            <span className="text-xs text-text-default">{p.name}</span>
            {preset === p.id && preset !== 'custom' && (
              <div className="absolute top-1 right-1">
                <Check className="w-3 h-3 text-green-400" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Custom Image Section */}
      <div className="pt-4 border-t border-white/10">
        <h4 className="text-sm font-medium text-text-default mb-3 flex items-center gap-2">
          <Image className="w-4 h-4" />
          Custom Image
        </h4>
        
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm text-text-default"
          >
            <Upload className="w-4 h-4" />
            Upload Image
          </button>
          <button
            onClick={() => setShowUrlInput(!showUrlInput)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm text-text-default"
          >
            <Image className="w-4 h-4" />
            From URL
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {showUrlInput && (
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="flex-1 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-sm text-text-default placeholder:text-text-muted focus:outline-none focus:border-white/30"
              onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
            />
            <button
              onClick={handleUrlSubmit}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-text-default transition-colors"
            >
              Apply
            </button>
          </div>
        )}

        {/* Current Custom Background Preview */}
        {preset === 'custom' && customConfig && (
          <div className="mt-4 p-3 rounded-lg border border-white/10 bg-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-muted">Current custom background</span>
              <button
                onClick={clearCustomBackground}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title="Remove custom background"
              >
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>
            {customConfig.type === 'image' && (
              <div 
                className="w-full h-20 rounded-md bg-cover bg-center border border-white/10"
                style={{ backgroundImage: `url("${customConfig.value}")` }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

