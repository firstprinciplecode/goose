import React from 'react';
import { User, Cog, Palette } from 'lucide-react';
import { cn } from '../../utils';

interface SettingsTab {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface SettingsTabNavigationProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const SettingsTabNavigation: React.FC<SettingsTabNavigationProps> = ({
  activeTab,
  onTabChange,
}) => {
  const tabs: SettingsTab[] = [
    {
      id: 'profile',
      label: 'Profile',
      icon: User,
    },
    {
      id: 'system',
      label: 'System',
      icon: Cog,
    },
    {
      id: 'interface',
      label: 'Interface',
      icon: Palette,
    },
  ];

  return (
    <div className="flex items-center gap-1">
      {tabs.map((tab) => {
        const IconComponent = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors rounded-md',
              isActive
                ? 'text-text-default bg-background-muted'
                : 'text-text-muted hover:text-text-default hover:bg-background-muted/50'
            )}
          >
            <IconComponent className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default SettingsTabNavigation;

