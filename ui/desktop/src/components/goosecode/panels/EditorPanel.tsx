import React, { useMemo } from 'react';
import { Button } from '../../ui/button';
import { X, Play, Save } from 'lucide-react';

export interface Tab {
  id: string;
  name: string;
  content: string;
  isDirty: boolean;
  type: 'html' | 'css' | 'js' | 'json';
}

interface EditorPanelProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  onContentChange: (tabId: string, content: string) => void;
  onRunCode?: () => void;
  onSave?: (tabId: string) => void;
  isRunning?: boolean;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  tabs,
  activeTab,
  onTabChange,
  onTabClose,
  onContentChange,
  onRunCode,
  onSave,
  isRunning = false,
}) => {
  const active = useMemo(() => tabs.find((tab) => tab.id === activeTab) ?? null, [tabs, activeTab]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-[#181818] px-3 py-1.5">
        <div className="flex items-center gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                  isActive
                    ? 'bg-[rgba(255,255,255,0.12)] text-text-default'
                    : 'bg-transparent text-text-muted hover:text-text-default'
                }`}
              >
                <span className="truncate max-w-[120px]">{tab.name}</span>
                {tab.isDirty && <span className="text-[10px] text-yellow-300">●</span>}
                {onTabClose && (
                  <X
                    className="w-3 h-3 opacity-70 hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      onTabClose(tab.id);
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          {onRunCode && (
            <Button
              variant="ghost"
              size="xs"
              shape="round"
              title="Run preview"
              onClick={onRunCode}
              disabled={isRunning}
            >
              <Play className="w-3.5 h-3.5" />
            </Button>
          )}
          {onSave && active && (
            <Button
              variant="ghost"
              size="xs"
              shape="round"
              title="Save file"
              onClick={() => onSave(active.id)}
            >
              <Save className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 bg-black text-[13px] text-green-200">
        {active ? (
          <textarea
            key={active.id}
            value={active.content}
            onChange={(event) => onContentChange(active.id, event.target.value)}
            className="w-full h-full bg-transparent outline-none border-none p-3 font-mono resize-none"
            spellCheck={false}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-text-muted">
            No file selected.
          </div>
        )}
      </div>
    </div>
  );
};
