import React, { useEffect, useRef, useState } from 'react';
import { useBackground, BackgroundPreset } from '../../../contexts/BackgroundContext';
import { Check, Palette, Sparkles, Sun, Moon, Waves, Upload, Image, ExternalLink, X } from 'lucide-react';
import { fileToResizedDataUrl } from '../../../utils/imageDataUrl';

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
  const { preset, setPreset } = useBackground();
  const [homeBgPreview, setHomeBgPreview] = useState<string | null>(null);
  const [homeBgUrl, setHomeBgUrl] = useState('');
  const [showHomeBgUrlInput, setShowHomeBgUrlInput] = useState(false);
  const homeFileInputRef = useRef<HTMLInputElement>(null);

  const HOME_BG_VERSION_KEY = 'home_background_image_version';
  const HOME_BG_MODE_KEY = 'home_background_mode'; // 'disk' | 'url'
  const HOME_BG_URL_KEY = 'home_background_url';

  // Load current Home background (preview only). This does NOT affect global app background.
  useEffect(() => {
    const load = async () => {
      const mode = localStorage.getItem(HOME_BG_MODE_KEY);
      const url = localStorage.getItem(HOME_BG_URL_KEY);
      if (mode === 'url' && url) {
        setHomeBgPreview(url);
        setHomeBgUrl(url);
        return;
      }

      const disk = await window.electron.getHomeBackgroundImage();
      if (disk) {
        setHomeBgPreview(disk);
        return;
      }

      // Legacy fallback (best-effort migrate)
      const legacy = localStorage.getItem('home_background_image');
      if (legacy) {
        setHomeBgPreview(legacy);
        const res = await window.electron.saveHomeBackgroundImage(legacy);
        if (res?.success) {
          localStorage.removeItem('home_background_image');
          localStorage.setItem(HOME_BG_MODE_KEY, 'disk');
          localStorage.removeItem(HOME_BG_URL_KEY);
          localStorage.setItem(HOME_BG_VERSION_KEY, Date.now().toString());
        }
        return;
      }

      setHomeBgPreview(null);
    };

    void load();
  }, []);

  const bumpHomeBgVersion = () => {
    localStorage.setItem(HOME_BG_VERSION_KEY, Date.now().toString());
    // Same-window notification (Hub listens to this too)
    window.dispatchEvent(new CustomEvent('background-image-updated'));
  };

  const handleHomeBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    void (async () => {
      try {
        const dataUrl = await fileToResizedDataUrl(file, {
          maxDimension: 1920,
          mimeType: 'image/jpeg',
          quality: 0.82,
        });

        const res = await window.electron.saveHomeBackgroundImage(dataUrl);
        if (!res?.success) {
          await window.electron.showMessageBox({
            type: 'error',
            title: 'Could not save background image',
            message: 'Failed to save the background image.',
            detail: res?.error || 'Try a smaller image (or crop it) and upload again.',
          });
          return;
        }

        // Ensure URL mode/legacy are cleared
        localStorage.removeItem('home_background_image');
        localStorage.setItem(HOME_BG_MODE_KEY, 'disk');
        localStorage.removeItem(HOME_BG_URL_KEY);
        setHomeBgUrl('');
        setShowHomeBgUrlInput(false);

        setHomeBgPreview(dataUrl);
        bumpHomeBgVersion();
      } catch (err) {
        console.error('Failed to process Home background upload:', err);
        await window.electron.showMessageBox({
          type: 'error',
          title: 'Failed to use image',
          message: 'We could not process that image.',
          detail: 'Please try a different image file.',
        });
      }
    })();
  };

  const handleHomeBgUrlApply = () => {
    const url = homeBgUrl.trim();
    if (!url) return;
    // Home-only: store URL (small) and render it only on Hub
    localStorage.setItem(HOME_BG_MODE_KEY, 'url');
    localStorage.setItem(HOME_BG_URL_KEY, url);
    localStorage.removeItem('home_background_image');
    setHomeBgPreview(url);
    setShowHomeBgUrlInput(false);
    bumpHomeBgVersion();
  };

  const handleHomeBgRemove = () => {
    void window.electron.deleteHomeBackgroundImage();
    localStorage.removeItem('home_background_image');
    localStorage.removeItem(HOME_BG_MODE_KEY);
    localStorage.removeItem(HOME_BG_URL_KEY);
    setHomeBgUrl('');
    setShowHomeBgUrlInput(false);
    setHomeBgPreview(null);
    bumpHomeBgVersion();
    if (homeFileInputRef.current) homeFileInputRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-text-default mb-1">Background</h3>
        <p className="text-xs text-text-muted mb-4">
          Customize the app background with presets.
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

      {/* Home-only background image */}
      <div className="pt-4 border-t border-white/10">
        <h4 className="text-sm font-medium text-text-default mb-1">Home page background image</h4>
        <p className="text-xs text-text-muted mb-3">
          Shows only on the Home screen. Chat/Team keep the default background.
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => homeFileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm text-text-default"
            type="button"
          >
            <Upload className="w-4 h-4" />
            Upload
          </button>
          <button
            onClick={() => setShowHomeBgUrlInput((v) => !v)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm text-text-default"
            type="button"
          >
            <ExternalLink className="w-4 h-4" />
            From URL
          </button>
          {homeBgPreview && (
            <button
              onClick={handleHomeBgRemove}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm text-text-default"
              type="button"
              title="Remove"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <input
          ref={homeFileInputRef}
          type="file"
          accept="image/*"
          onChange={handleHomeBgUpload}
          className="hidden"
        />

        {showHomeBgUrlInput && (
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Image className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={homeBgUrl}
                onChange={(e) => setHomeBgUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-white/10 bg-white/5 text-sm text-text-default placeholder:text-text-muted focus:outline-none focus:border-white/30"
                onKeyDown={(e) => e.key === 'Enter' && handleHomeBgUrlApply()}
              />
            </div>
            <button
              onClick={handleHomeBgUrlApply}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-text-default transition-colors"
              type="button"
            >
              Apply
            </button>
          </div>
        )}

        {homeBgPreview && (
          <div className="mt-4 rounded-lg overflow-hidden border border-white/10">
            <img
              src={homeBgPreview}
              alt="Home background preview"
              className="w-full h-24 object-cover"
            />
          </div>
        )}
      </div>
    </div>
  );
}

