/* eslint-env browser */
import React, { useRef, useEffect, useCallback } from 'react';
import { DockviewReact, DockviewReadyEvent, IDockviewPanelProps, DockviewApi } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import { FileExplorerPanel, FileItem } from './panels/FileExplorerPanel';
import { EditorPanel, Tab } from './panels/EditorPanel';
import { PreviewPanel } from './panels/PreviewPanel';
import { TerminalPanel } from './panels/TerminalPanel';
import { ChatPanel } from './panels/ChatPanel';

const LAYOUT_STORAGE_KEY = 'goosecode-layout';

import { GooseCodeState } from './GooseCodeContext';
import { GooseCodeToolHandlers } from './tools/gooseCodeTools';
import { GooseDockTab } from './tabs/GooseDockTab';

type FrameElement = globalThis.HTMLIFrameElement;

declare global {
  interface Window {
    resetGooseCodeLayout?: () => void;
  }
}

export interface DockviewLayoutProps {
  // File explorer state
  files: FileItem[];
  onToggleFolder: (folderName: string) => void;
  onFileSelect?: (file: FileItem) => void;
  onCreateFile?: (filename: string) => void;
  onCreateFolder?: (foldername: string) => void;

  // Editor state
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  onContentChange: (tabId: string, content: string) => void;
  onRunCode?: () => void;
  onSave?: (tabId: string) => void;
  isRunning?: boolean;

  // Preview state
  previewRef: React.RefObject<FrameElement | null>;
  onRefreshPreview: () => void;

  // Terminal state
  terminalOutput: string[];
  onTerminalCommand: (command: string) => void;

  // Session and IDE state
  sessionId: string;
  workingDir: string;
  ideState: GooseCodeState;
  toolHandlers: GooseCodeToolHandlers;
}

// Component registry for dockview
const components = {
  fileExplorer: (props: IDockviewPanelProps<DockviewLayoutProps>) => (
    <FileExplorerPanel
      files={props.params.files}
      onToggleFolder={props.params.onToggleFolder}
      onFileSelect={props.params.onFileSelect}
      onCreateFile={props.params.onCreateFile}
      onCreateFolder={props.params.onCreateFolder}
    />
  ),
  editor: (props: IDockviewPanelProps<DockviewLayoutProps>) => (
    <EditorPanel
      tabs={props.params.tabs}
      activeTab={props.params.activeTab}
      onTabChange={props.params.onTabChange}
      onTabClose={props.params.onTabClose}
      onContentChange={props.params.onContentChange}
      onRunCode={props.params.onRunCode}
      onSave={props.params.onSave}
      isRunning={props.params.isRunning}
    />
  ),
  preview: (props: IDockviewPanelProps<DockviewLayoutProps>) => (
    <PreviewPanel previewRef={props.params.previewRef} onRefresh={props.params.onRefreshPreview} />
  ),
  terminal: (props: IDockviewPanelProps<DockviewLayoutProps>) => (
    <TerminalPanel
      output={props.params.terminalOutput}
      onCommand={props.params.onTerminalCommand}
    />
  ),
  chat: (props: IDockviewPanelProps<DockviewLayoutProps>) => (
    <ChatPanel
      sessionId={props.params.sessionId}
      workingDir={props.params.workingDir}
      ideState={props.params.ideState}
      toolHandlers={props.params.toolHandlers}
    />
  ),
};

export const DockviewLayout: React.FC<DockviewLayoutProps> = (props) => {
  const apiRef = useRef<DockviewApi | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load saved layout from localStorage
  const loadLayout = useCallback((api: DockviewApi) => {
    try {
      const savedLayout = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (savedLayout) {
        const layout = JSON.parse(savedLayout);
        api.fromJSON(layout);
        return true;
      }
    } catch (error) {
      console.error('Failed to load layout:', error);
    }
    return false;
  }, []);

  // Create default layout
  const createDefaultLayout = useCallback(
    (api: DockviewApi) => {
      // Left sidebar - Explorer
      const explorerGroup = api.addGroup();
      api.addPanel({
        id: 'explorer',
        component: 'fileExplorer',
        title: 'Explorer',
        params: props,
        position: { referenceGroup: explorerGroup },
      });

      // Center - Editor
      const editorGroup = api.addGroup({
        direction: 'right',
        referenceGroup: explorerGroup,
      });
      api.addPanel({
        id: 'editor-1',
        component: 'editor',
        title: 'Editor',
        params: props,
        position: { referenceGroup: editorGroup },
      });

      // Right top - Preview
      const previewGroup = api.addGroup({
        direction: 'right',
        referenceGroup: editorGroup,
      });
      api.addPanel({
        id: 'preview',
        component: 'preview',
        title: 'Preview',
        params: props,
        position: { referenceGroup: previewGroup },
      });

      // Bottom - Terminal
      const terminalGroup = api.addGroup({
        direction: 'below',
        referenceGroup: editorGroup,
      });
      api.addPanel({
        id: 'terminal',
        component: 'terminal',
        title: 'Terminal',
        params: props,
        position: { referenceGroup: terminalGroup },
      });

      // Right bottom - Chat
      api.addPanel({
        id: 'chat',
        component: 'chat',
        title: 'AI Assistant',
        params: props,
        position: { referenceGroup: previewGroup, direction: 'below' },
      });

      // Set initial sizes  (sizes are managed by dockview automatically)
      // explorerGroup.api.setSize(250);
      // previewGroup.api.setSize(400);
      // terminalGroup.api.setSize(200);
    },
    [props]
  );

  // Save layout to localStorage (debounced)
  const saveLayout = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (apiRef.current) {
        try {
          const layout = apiRef.current.toJSON();
          // Clean the layout object to remove any refs that can't be serialized
          const cleanLayout = JSON.parse(
            JSON.stringify(layout, (key, value) => {
              // Skip any React refs or DOM elements
              if (key === 'previewRef' || key === 'ref' || value instanceof HTMLElement) {
                return undefined;
              }
              return value;
            })
          );
          localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(cleanLayout));
        } catch (error) {
          // Silently fail - layout persistence is not critical
          console.debug('Layout save skipped:', error);
        }
      }
    }, 1000);
  }, []);

  // Handle dockview ready
  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;

      // Try to load saved layout, otherwise create default
      const loaded = loadLayout(event.api);
      if (!loaded) {
        createDefaultLayout(event.api);
      }

      // Listen for layout changes to save
      event.api.onDidLayoutChange(() => {
        saveLayout();
      });
    },
    [loadLayout, createDefaultLayout, saveLayout]
  );

  // Update panel params when props change
  useEffect(() => {
    if (apiRef.current) {
      apiRef.current.panels.forEach((panel) => {
        panel.api.updateParameters(props);
      });
    }
  }, [props]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Reset layout function (can be called from parent)
  const resetLayout = useCallback(() => {
    if (apiRef.current) {
      localStorage.removeItem(LAYOUT_STORAGE_KEY);
      apiRef.current.clear();
      createDefaultLayout(apiRef.current);
    }
  }, [createDefaultLayout]);

  // Expose reset function via ref (if needed)
  useEffect(() => {
    window.resetGooseCodeLayout = resetLayout;
    return () => {
      delete window.resetGooseCodeLayout;
    };
  }, [resetLayout]);

  return (
    <div className="dockview-theme-goose w-full h-full">
      <DockviewReact
        components={components}
        defaultTabComponent={GooseDockTab}
        onReady={onReady}
        className="w-full h-full"
        watermarkComponent={() => (
          <div className="flex items-center justify-center h-full text-text-muted">
            <div className="text-center">
              <p className="text-sm">Drag panels here to dock them</p>
              <p className="text-xs mt-1">Right-click on tabs for more options</p>
            </div>
          </div>
        )}
      />
    </div>
  );
};
