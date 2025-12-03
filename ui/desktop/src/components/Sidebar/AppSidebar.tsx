import React from 'react';
import { 
  Plus, 
  Home,
  History,
  FileText,
  Puzzle, 
  Settings,
  Users,
  Hash,
  ShoppingBag,
} from 'lucide-react';
import { ChatSmart } from '../icons';

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  isCollapsed?: boolean;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, onClick, isCollapsed }) => {
  return (
    <button
      onClick={onClick}
      title={isCollapsed ? label : undefined}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left text-text-default
        ${isCollapsed ? 'justify-center' : ''}
      `}
    >
      <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
        {icon}
      </span>
      {!isCollapsed && (
        <span className="text-sm">{label}</span>
      )}
    </button>
  );
};

interface AppSidebarProps {
  onNewChat: () => void;
  setView: (view: string, options?: any) => void;
  isExpanded: boolean;
  setIsExpanded?: (expanded: boolean) => void;
  position?: 'left' | 'right';
}

const AppSidebar: React.FC<AppSidebarProps> = ({
  onNewChat,
  setView,
  isExpanded,
}) => {
  const isCollapsed = !isExpanded;
  const handleNavigation = (view: string) => {
    setView(view);
  };

  return (
    <div 
      className={`h-full flex flex-col transition-all duration-200 bg-transparent ${
        isCollapsed ? 'w-[60px]' : 'w-[200px]'
      }`}
    >
      {/* Window controls spacer - for macOS traffic lights */}
      <div className="h-11 flex items-center" />

      {/* New Chat Button */}
      <div className={`px-2 mb-2 ${isCollapsed ? 'flex justify-center' : ''}`}>
        <button
          onClick={onNewChat}
          title={isCollapsed ? 'New Chat' : undefined}
          className={`flex items-center gap-3 rounded-lg transition-colors text-text-default ${
            isCollapsed 
              ? 'w-10 h-10 justify-center' 
              : 'w-full px-3 py-2.5'
          }`}
        >
          <Plus className="w-5 h-5" />
          {!isCollapsed && <span className="text-sm">New Chat</span>}
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        <SidebarItem
          icon={<Home className="w-5 h-5" />}
          label="Home"
          onClick={() => handleNavigation('home')}
          isCollapsed={isCollapsed}
        />
        <SidebarItem
          icon={<ChatSmart className="w-5 h-5" />}
          label="Chat"
          onClick={() => handleNavigation('chat')}
          isCollapsed={isCollapsed}
        />
        <SidebarItem
          icon={<History className="w-5 h-5" />}
          label="History"
          onClick={() => handleNavigation('sessions')}
          isCollapsed={isCollapsed}
        />
        <SidebarItem
          icon={<FileText className="w-5 h-5" />}
          label="Recipes"
          onClick={() => handleNavigation('recipes')}
          isCollapsed={isCollapsed}
        />
        <SidebarItem
          icon={<ShoppingBag className="w-5 h-5" />}
          label="Marketplace"
          onClick={() => handleNavigation('schedules')}
          isCollapsed={isCollapsed}
        />
        <SidebarItem
          icon={<Puzzle className="w-5 h-5" />}
          label="Extensions"
          onClick={() => handleNavigation('extensions')}
          isCollapsed={isCollapsed}
        />
        <SidebarItem
          icon={<Users className="w-5 h-5" />}
          label="Peers"
          onClick={() => handleNavigation('peers')}
          isCollapsed={isCollapsed}
        />
        <SidebarItem
          icon={<Hash className="w-5 h-5" />}
          label="Channels"
          onClick={() => handleNavigation('channels')}
          isCollapsed={isCollapsed}
        />
        <SidebarItem
          icon={<Settings className="w-5 h-5" />}
          label="Settings"
          onClick={() => handleNavigation('settings')}
          isCollapsed={isCollapsed}
        />
      </nav>
    </div>
  );
};

export default AppSidebar;

