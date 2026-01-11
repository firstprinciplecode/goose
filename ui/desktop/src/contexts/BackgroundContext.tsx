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

function isDisallowedGlobalImage(config: StoredConfig): boolean {
  return config.preset === 'custom' && config.customConfig?.type === 'image';
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
        // Only Home screen should support background images.
        // If we have an old persisted global image background, clear it.
        if (isDisallowedGlobalImage(config)) {
          localStorage.removeItem(STORAGE_KEY);
          setPresetState('default');
          setCustomConfigState(null);
        } else {
          setPresetState(config.preset);
          setCustomConfigState(config.customConfig);
        }
      }
    } catch (error) {
      console.warn('Failed to load background config:', error);
    }
  }, []);

  // Cross-window sync: if Preferences/Settings is opened in a separate Electron window,
  // changes to localStorage happen there. Listen for storage events so the main app window
  // updates immediately without requiring a restart.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;

      if (!e.newValue) {
        setPresetState('default');
        setCustomConfigState(null);
        return;
      }

      try {
        const config: StoredConfig = JSON.parse(e.newValue);
        if (isDisallowedGlobalImage(config)) {
          // Clear in response to another window attempting to set a global background image.
          localStorage.removeItem(STORAGE_KEY);
          setPresetState('default');
          setCustomConfigState(null);
          return;
        }

        setPresetState(config.preset);
        setCustomConfigState(config.customConfig);
      } catch (error) {
        console.warn('Failed to parse background config from storage event:', error);
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
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
        // Intentionally ignored: background images should only render on the Home screen.
        // Keep the default theme background for all other routes.
        body.classList.remove('custom-background');
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
    // Disabled by design: only Home supports background images.
    console.warn('Global background images are disabled; use the Home background image setting instead.');
    // Avoid leaving the app in a confusing half-state.
    setPresetState('default');
    setCustomConfigState(null);
    localStorage.removeItem(STORAGE_KEY);
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

