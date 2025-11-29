import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type BackgroundPreset = 'default' | 'stars' | 'aurora' | 'sunset' | 'ocean' | 'custom';

export interface CustomBackgroundConfig {
  type: 'color' | 'gradient' | 'image';
  value: string; // CSS color, gradient, or image URL
  overlay?: string; // Optional overlay color with alpha
  size?: string;
  position?: string;
  repeat?: string;
  attachment?: string;
}

interface BackgroundContextType {
  preset: BackgroundPreset;
  customConfig: CustomBackgroundConfig | null;
  setPreset: (preset: BackgroundPreset) => void;
  setCustomBackground: (config: CustomBackgroundConfig) => void;
  clearCustomBackground: () => void;
  setBackgroundImage: (imageUrl: string, overlay?: string) => void;
}

const BackgroundContext = createContext<BackgroundContextType | null>(null);

const STORAGE_KEY = 'goose-background-config';

interface StoredConfig {
  preset: BackgroundPreset;
  customConfig: CustomBackgroundConfig | null;
}

export function BackgroundProvider({ children }: { children: ReactNode }) {
  const [preset, setPresetState] = useState<BackgroundPreset>('default');
  const [customConfig, setCustomConfigState] = useState<CustomBackgroundConfig | null>(null);

  // Load saved config on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const config: StoredConfig = JSON.parse(saved);
        setPresetState(config.preset);
        setCustomConfigState(config.customConfig);
      }
    } catch (error) {
      console.warn('Failed to load background config:', error);
    }
  }, []);

  // Save config when it changes
  useEffect(() => {
    try {
      const config: StoredConfig = { preset, customConfig };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
      console.warn('Failed to save background config:', error);
    }
  }, [preset, customConfig]);

  // Apply background to body
  useEffect(() => {
    const body = document.body;
    
    // Remove all background classes
    body.classList.remove(
      'custom-background',
      'bg-preset-stars',
      'bg-preset-aurora',
      'bg-preset-sunset',
      'bg-preset-ocean'
    );
    
    // Clear custom properties
    body.style.removeProperty('--custom-bg-color');
    body.style.removeProperty('--custom-bg-image');
    body.style.removeProperty('--custom-bg-size');
    body.style.removeProperty('--custom-bg-position');
    body.style.removeProperty('--custom-bg-repeat');
    body.style.removeProperty('--custom-bg-attachment');
    body.style.removeProperty('--custom-bg-overlay');

    if (preset === 'default') {
      // Use default theme background
      return;
    }

    if (preset === 'custom' && customConfig) {
      body.classList.add('custom-background');
      
      if (customConfig.type === 'color') {
        body.style.setProperty('--custom-bg-color', customConfig.value);
        body.style.setProperty('--custom-bg-overlay', 'transparent');
      } else if (customConfig.type === 'gradient') {
        body.style.setProperty('--custom-bg-image', customConfig.value);
        body.style.setProperty('--custom-bg-overlay', customConfig.overlay || 'transparent');
      } else if (customConfig.type === 'image') {
        body.style.setProperty('--custom-bg-image', `url("${customConfig.value}")`);
        body.style.setProperty('--custom-bg-overlay', customConfig.overlay || 'rgba(0, 0, 0, 0.4)');
        if (customConfig.size) body.style.setProperty('--custom-bg-size', customConfig.size);
        if (customConfig.position) body.style.setProperty('--custom-bg-position', customConfig.position);
        if (customConfig.repeat) body.style.setProperty('--custom-bg-repeat', customConfig.repeat);
        if (customConfig.attachment) body.style.setProperty('--custom-bg-attachment', customConfig.attachment);
      }
    } else {
      // Apply preset class
      body.classList.add(`bg-preset-${preset}`);
    }
  }, [preset, customConfig]);

  const setPreset = useCallback((newPreset: BackgroundPreset) => {
    setPresetState(newPreset);
    if (newPreset !== 'custom') {
      setCustomConfigState(null);
    }
  }, []);

  const setCustomBackground = useCallback((config: CustomBackgroundConfig) => {
    setPresetState('custom');
    setCustomConfigState(config);
  }, []);

  const clearCustomBackground = useCallback(() => {
    setPresetState('default');
    setCustomConfigState(null);
  }, []);

  const setBackgroundImage = useCallback((imageUrl: string, overlay?: string) => {
    setCustomBackground({
      type: 'image',
      value: imageUrl,
      overlay: overlay || 'rgba(0, 0, 0, 0.4)',
      size: 'cover',
      position: 'center',
      repeat: 'no-repeat',
      attachment: 'fixed',
    });
  }, [setCustomBackground]);

  return (
    <BackgroundContext.Provider
      value={{
        preset,
        customConfig,
        setPreset,
        setCustomBackground,
        clearCustomBackground,
        setBackgroundImage,
      }}
    >
      {children}
    </BackgroundContext.Provider>
  );
}

export function useBackground() {
  const context = useContext(BackgroundContext);
  if (!context) {
    throw new Error('useBackground must be used within a BackgroundProvider');
  }
  return context;
}

