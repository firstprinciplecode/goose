import { ScrollArea } from '../ui/scroll-area';
import { View, ViewOptions } from '../../utils/navigationUtils';
import { ExtensionConfig } from '../../api';
import { MainPanelLayout } from '../Layout/MainPanelLayout';
import { useState, useEffect } from 'react';
import SettingsTabNavigation from './SettingsTabNavigation';
import ProfileSection from './profile/ProfileSection';
import SystemSection from './system/SystemSection';
import InterfaceSection from './interface/InterfaceSection';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';

export type SettingsViewOptions = {
  deepLinkConfig?: ExtensionConfig;
  showEnvVars?: boolean;
  section?: string;
};

export default function SettingsView({
  onClose,
  setView,
  viewOptions,
}: {
  onClose: () => void;
  setView: (view: View, viewOptions?: ViewOptions) => void;
  viewOptions: SettingsViewOptions;
}) {
  const [activeTab, setActiveTab] = useState('profile');
  const [compactMode, setCompactMode] = useState(() => {
    // Check URL hash params first (for separate window)
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.split('?')[1] || '');
    if (hashParams.get('compact') === 'true') {
      return true;
    }
    const stored = localStorage.getItem('settings_compact_mode');
    return stored === 'true';
  });

  // Determine initial tab based on section prop
  useEffect(() => {
    if (viewOptions.section) {
      // Map section names to tab values
      const sectionToTab: Record<string, string> = {
        update: 'interface',
        models: 'system',
        modes: 'interface',
        sharing: 'profile',
        styles: 'interface',
        tools: 'system',
        app: 'interface',
        chat: 'interface',
        profile: 'profile',
        system: 'system',
        interface: 'interface',
      };

      const targetTab = sectionToTab[viewOptions.section];
      if (targetTab) {
        setActiveTab(targetTab);
      }
    }
  }, [viewOptions.section]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleCompactModeToggle = async (checked: boolean) => {
    // Always update state first for immediate UI feedback
    setCompactMode(checked);
    localStorage.setItem('settings_compact_mode', String(checked));
    
    if (checked) {
      // Open settings in a separate window when toggled ON
      try {
        // Check if we're already in a compact window
        const hash = window.location.hash;
        const hashParams = new URLSearchParams(hash.split('?')[1] || '');
        if (hashParams.get('compact') === 'true') {
          // Already in compact window, nothing to do
          return;
        }
        
        // Check if createSettingsWindow is available
        if (window.electron && typeof window.electron.createSettingsWindow === 'function') {
          const result = await window.electron.createSettingsWindow();
          if (result && result.success) {
            console.log('Settings window opened:', result.windowId);
          } else {
            console.error('Failed to open settings window:', result?.error);
          }
        } else {
          console.warn('createSettingsWindow not available, using inline compact mode');
        }
      } catch (error) {
        console.error('Error creating settings window:', error);
      }
    }
  };

  return (
    <>
      <MainPanelLayout removeTopPadding={true}>
        <div className="flex-1 flex flex-col min-h-0">
          {/* Spacer for top bar */}
          <div className="h-16"></div>
          
          {/* Tab Navigation - positioned further down */}
          <div className="mb-6 pl-[76px] pr-8 flex items-center justify-between gap-4">
            <div className="rounded-lg p-1 border border-border">
              <SettingsTabNavigation 
                activeTab={activeTab} 
                onTabChange={setActiveTab} 
              />
            </div>
            {/* Compact Mode Toggle - only show if not already in compact window */}
            {(() => {
              const hash = window.location.hash;
              const hashParams = new URLSearchParams(hash.split('?')[1] || '');
              return hashParams.get('compact') !== 'true';
            })() && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Switch
                  id="compact-mode"
                  checked={compactMode}
                  onCheckedChange={handleCompactModeToggle}
                />
                <Label htmlFor="compact-mode" className="text-sm text-text-muted cursor-pointer">
                  Compact view
                </Label>
              </div>
            )}
          </div>

          {/* Content Area */}
          <div className="flex-1 min-h-0 relative">
            <ScrollArea className="h-full w-full">
              <div className={compactMode ? "px-10 pb-10 max-w-4xl mx-auto" : "px-10 pb-10"}>
                {activeTab === 'profile' && (
                  <div className="focus-visible:outline-none focus-visible:ring-0">
                    <ProfileSection compactMode={compactMode} />
                  </div>
                )}

                {activeTab === 'system' && (
                  <div className="focus-visible:outline-none focus-visible:ring-0">
                    <SystemSection setView={setView} compactMode={compactMode} />
                  </div>
                )}

                {activeTab === 'interface' && (
                  <div className="focus-visible:outline-none focus-visible:ring-0">
                    <InterfaceSection compactMode={compactMode} />
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </MainPanelLayout>
    </>
  );
}
