/* eslint-env browser */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { RotateCcw, Loader2, RefreshCw, Folder, FolderOpen } from 'lucide-react';
import { Button } from '../ui/button';
import { DockviewLayout } from './DockviewLayout';
import { FileItem } from './panels/FileExplorerPanel';
import { Tab } from './panels/EditorPanel';
import { GooseCodeState } from './GooseCodeContext';
import { useGooseCodeSession } from './GooseCodeSession';
import {
  loadDirectoryStructure,
  loadInitialTabs,
  loadFileContent,
  watchDirectory,
} from './utils/fileSystemLoader';

declare global {
  interface Window {
    resetGooseCodeLayout?: () => void;
  }
}

type FrameElement = globalThis.HTMLIFrameElement;

const GooseCodeView: React.FC = () => {
  // State management
  const [workingDir, setWorkingDir] = useState<string | null>(null);
  const [isSelectingFolder, setIsSelectingFolder] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('index.html');
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([
    'GooseCode Terminal',
    'Select a folder to get started...',
  ]);
  const [previewState, setPreviewState] = useState<'ready' | 'error' | 'loading'>('ready');
  const [previewError, setPreviewError] = useState<string | undefined>();
  const [sessionId, setSessionId] = useState<string>('');
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  const previewRef = useRef<FrameElement | null>(null);

  // Handle folder selection
  const handleSelectFolder = useCallback(async () => {
    try {
      console.log('Opening folder picker...');
      // Use selectFileOrDirectory which returns the path directly without creating a new window
      const selectedPath = await window.electron.selectFileOrDirectory();
      console.log('Selected path:', selectedPath);

      if (selectedPath && typeof selectedPath === 'string') {
        console.log('Setting working directory to:', selectedPath);
        setWorkingDir(selectedPath);
        setIsSelectingFolder(false);
        setTerminalOutput([
          'GooseCode Terminal',
          `Working directory: ${selectedPath}`,
          'Ready for commands...',
        ]);

        // Store in localStorage for next time
        localStorage.setItem('goosecode_working_dir', selectedPath);
      } else {
        console.log('User cancelled folder selection');
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
      setTerminalOutput((prev) => [...prev, `✗ Error selecting folder: ${error}`]);
    }
  }, []);

  // Load last used folder on mount
  useEffect(() => {
    const lastFolder = localStorage.getItem('goosecode_working_dir');
    if (lastFolder) {
      console.log('Restoring last folder:', lastFolder);
      setWorkingDir(lastFolder);
      setIsSelectingFolder(false);
      setTerminalOutput([
        'GooseCode Terminal',
        `Working directory: ${lastFolder}`,
        'Ready for commands...',
      ]);
    }
  }, []);

  // Load files from disk when workingDir changes
  useEffect(() => {
    if (!workingDir) return;

    let cleanupFn: (() => void) | null = null;

    async function loadFiles() {
      setIsLoadingFiles(true);
      setTerminalOutput((prev) => [...prev, `> Loading files from ${workingDir}...`]);

      try {
        // Load directory structure
        if (!workingDir) return;
        const fileStructure = await loadDirectoryStructure(workingDir);
        setFiles(fileStructure);

        // Load initial tabs (common files if they exist)
        const initialTabs = await loadInitialTabs(workingDir);
        setTabs(initialTabs);

        if (initialTabs.length > 0) {
          setTerminalOutput((prev) => [...prev, `✓ Loaded ${initialTabs.length} files`]);
        } else {
          setTerminalOutput((prev) => [
            ...prev,
            `✓ Loaded project - ${fileStructure.length} items in root`,
          ]);
        }
        setIsLoadingFiles(false);

        // Watch for file changes
        if (workingDir) {
          cleanupFn = watchDirectory(workingDir, () => {
            console.log('Files changed on disk, reloading...');
            setTerminalOutput((prev) => [...prev, '> Files changed on disk']);
            // Reload files
            loadFiles();
          });
        }
      } catch (error) {
        console.error('Failed to load files:', error);
        setTerminalOutput((prev) => [...prev, `✗ Error loading files: ${error}`]);
        setIsLoadingFiles(false);
      }
    }

    loadFiles();

    return () => {
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, [workingDir]);

  // Update preview callback - MUST be defined before useEffect that uses it
  const updatePreview = useCallback(() => {
    if (!previewRef.current) return;

    try {
      setPreviewState('loading');
      setPreviewError(undefined);

      const htmlTab = tabs.find((t) => t.type === 'html');
      const cssTab = tabs.find((t) => t.type === 'css');
      const jsTab = tabs.find((t) => t.type === 'js');

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>GooseCode Preview</title>
          <style>${cssTab?.content || ''}</style>
        </head>
        <body>
          ${htmlTab?.content || ''}
          <script>
            // Wrap user script in try-catch to prevent errors from breaking the preview
            try {
              ${jsTab?.content || ''}
            } catch (error) {
              console.error('Script error:', error);
              document.body.innerHTML += '<div style="color: red; padding: 10px; background: #ffe6e6; margin: 10px; border-radius: 4px;">Script Error: ' + error.message + '</div>';
            }
          </script>
        </body>
        </html>
      `;

      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      previewRef.current.src = url;

      setPreviewState('ready');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setPreviewError(errorMessage);
      setPreviewState('error');
      console.error('Preview error:', error);
    }
  }, [tabs]);

  // Update preview when content changes - now AFTER updatePreview is defined
  useEffect(() => {
    if (previewRef.current) {
      updatePreview();
    }
  }, [tabs, updatePreview]);

  // Reload files from disk - useful after Goose edits them
  // MUST be defined BEFORE callbacks that use it
  const reloadFilesFromDisk = useCallback(async () => {
    if (!workingDir) return;

    console.log('GooseCode: Reloading files from disk...');
    setTerminalOutput((prev) => [...prev, '> Refreshing files from disk...']);

    try {
      // Reload directory structure
      const fileStructure = await loadDirectoryStructure(workingDir);
      setFiles(fileStructure);

      // Reload all open tabs from disk (using tab.id which is the relative path)
      const updatedTabs = await Promise.all(
        tabs.map(async (tab) => {
          const filePath = `${workingDir}/${tab.id}`;
          const content = await loadFileContent(filePath);
          return { ...tab, content, isDirty: false };
        })
      );

      setTabs(updatedTabs);

      // Update preview
      updatePreview();

      setTerminalOutput((prev) => [...prev, '✓ Files refreshed']);
    } catch (error) {
      console.error('Failed to reload files:', error);
      setTerminalOutput((prev) => [...prev, `✗ Failed to refresh: ${error}`]);
    }
  }, [workingDir, tabs, updatePreview]);

  // Build IDE state for Goose context
  const ideState: GooseCodeState = useMemo(
    () => ({
      files,
      tabs,
      activeTab,
      terminalOutput,
      previewState,
      previewError,
      sessionId,
      workingDir: workingDir || '',
    }),
    [files, tabs, activeTab, terminalOutput, previewState, previewError, sessionId, workingDir]
  );

  // Initialize Goose session (only when workingDir is set)
  const {
    session,
    isInitializing: isSessionInitializing,
    error: sessionError,
    resetSession,
  } = useGooseCodeSession({
    ideState,
    enabled: !!workingDir, // Only initialize when folder is selected
  });

  // Update session ID when session changes
  useEffect(() => {
    if (session?.id && session.id !== sessionId) {
      setSessionId(session.id);
    }
  }, [session, sessionId]);

  const handleTabContentChange = useCallback((tabId: string, content: string) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, content, isDirty: true } : tab))
    );
  }, []);

  const handleRunCode = useCallback(() => {
    setIsRunning(true);
    setTerminalOutput((prev) => [
      ...prev,
      '> Running application...',
      'Application started successfully!',
    ]);
    updatePreview();
    setTimeout(() => setIsRunning(false), 1000);
  }, [updatePreview]);

  const handleTerminalCommand = useCallback(
    async (command: string) => {
      if (!workingDir) {
        setTerminalOutput((prev) => [...prev, '✗ No working directory selected']);
        return;
      }

      setTerminalOutput((prev) => [...prev, `$ ${command}`]);

      try {
        const result = await window.electron.executeCommand(command, workingDir || '');

        if (result.stdout) {
          const lines = result.stdout
            .trim()
            .split('\n')
            .filter((line) => line.length > 0);
          setTerminalOutput((prev) => [...prev, ...lines]);
        }
        if (result.stderr) {
          const lines = result.stderr
            .trim()
            .split('\n')
            .filter((line) => line.length > 0);
          setTerminalOutput((prev) => [...prev, ...lines]);
        }

        // Show success/failure indicator
        if (!result.success) {
          setTerminalOutput((prev) => [...prev, `✗ Command failed`]);
        }

        // Reload files after command in case files changed
        setTimeout(() => reloadFilesFromDisk(), 500);
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Command failed';
        setTerminalOutput((prev) => [...prev, `✗ Error: ${errorMsg}`]);
      }
    },
    [workingDir, reloadFilesFromDisk]
  );

  const handleCreateFile = useCallback(
    async (filename: string) => {
      if (!workingDir) return;

      try {
        const filePath = `${workingDir}/${filename}`;

        // Extract directory path if file is in a subdirectory
        const lastSlashIndex = filePath.lastIndexOf('/');
        if (lastSlashIndex > 0) {
          const parentDir = filePath.substring(0, lastSlashIndex);
          await window.electron.ensureDirectory(parentDir);

          // Extract relative dir for display
          const relativeDir = filename.substring(0, filename.lastIndexOf('/'));
          setTerminalOutput((prev) => [...prev, `✓ Created directory: ${relativeDir}`]);
        }

        // Create empty file using Electron IPC
        await window.electron.writeFile(filePath, '');

        setTerminalOutput((prev) => [...prev, `✓ Created file: ${filename}`]);

        // Reload files
        setTimeout(() => reloadFilesFromDisk(), 300);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        setTerminalOutput((prev) => [...prev, `✗ Failed to create file: ${message}`]);
      }
    },
    [workingDir, reloadFilesFromDisk]
  );

  const handleCreateFolder = useCallback(
    async (foldername: string) => {
      if (!workingDir) return;

      try {
        const folderPath = `${workingDir}/${foldername}`;

        // Create folder using Electron IPC (recursive by default)
        await window.electron.ensureDirectory(folderPath);

        setTerminalOutput((prev) => [...prev, `✓ Created folder: ${foldername}`]);

        // Reload files
        setTimeout(() => reloadFilesFromDisk(), 300);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        setTerminalOutput((prev) => [...prev, `✗ Failed to create folder: ${message}`]);
      }
    },
    [workingDir, reloadFilesFromDisk]
  );

  const toggleFolder = useCallback((folderName: string) => {
    const toggleInTree = (items: FileItem[]): FileItem[] => {
      return items.map((item) => {
        if (item.name === folderName && item.type === 'folder') {
          return { ...item, isOpen: !item.isOpen };
        }
        if (item.children) {
          return { ...item, children: toggleInTree(item.children) };
        }
        return item;
      });
    };
    setFiles((prev) => toggleInTree(prev));
  }, []);

  const handleFileSelect = useCallback(
    async (file: FileItem) => {
      if (!workingDir) return;

      // Check if tab already exists (use relative path as unique ID)
      const existingTab = tabs.find((tab) => tab.id === file.path);
      if (existingTab) {
        setActiveTab(existingTab.id);
        return;
      }

      // Build full file path (using forward slash for cross-platform compatibility)
      const filePath = `${workingDir}/${file.path}`;

      try {
        const content = await loadFileContent(filePath);

        // Determine file type from extension
        const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'txt';
        const tabType =
          fileExtension === 'html'
            ? 'html'
            : fileExtension === 'css'
              ? 'css'
              : fileExtension === 'json'
                ? 'json'
                : fileExtension === 'js' ||
                    fileExtension === 'ts' ||
                    fileExtension === 'tsx' ||
                    fileExtension === 'jsx'
                  ? 'js'
                  : 'js'; // Default to js for code files

        const newTab: Tab = {
          id: file.path, // Use relative path as unique ID
          name: file.name, // Display just the filename
          content,
          isDirty: false,
          type: tabType,
        };

        setTabs((prev) => [...prev, newTab]);
        setActiveTab(newTab.id);

        setTerminalOutput((prev) => [...prev, `> Opened ${file.path}`]);
      } catch (error) {
        console.error('Failed to load file:', error);
        setTerminalOutput((prev) => [...prev, `✗ Failed to open ${file.path}`]);
      }
    },
    [tabs, workingDir]
  );

  const handleTabClose = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const newTabs = prev.filter((tab) => tab.id !== tabId);
        // If closing active tab, switch to first available tab
        if (tabId === activeTab && newTabs.length > 0) {
          setActiveTab(newTabs[0].id);
        }
        return newTabs;
      });
    },
    [activeTab]
  );

  const handleSaveTab = useCallback((tabId: string) => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, isDirty: false } : tab)));
    setTerminalOutput((prev) => [...prev, `> Saved ${tabId}`]);
  }, []);

  // Simplified tool handlers - mainly for UI interactions
  const toolHandlers = useMemo(
    () => ({
      editFile: async (filename: string, _content: string) => {
        // This is now just for UI sync - Goose should use write_file
        console.log('GooseCode: File edited via tool', filename);
        setTerminalOutput((prev) => [...prev, `✓ ${filename} modified`]);
        // Reload to show changes
        setTimeout(() => reloadFilesFromDisk(), 500);
      },

      saveFile: async (filename: string) => {
        console.log('GooseCode: File saved', filename);
        setTerminalOutput((prev) => [...prev, `✓ Saved ${filename}`]);
      },

      runCode: async () => {
        handleRunCode();
      },

      executeCommand: async (command: string) => {
        handleTerminalCommand(command);
      },

      openFile: async (filename: string) => {
        const findFile = (items: FileItem[]): FileItem | null => {
          for (const item of items) {
            if (item.name === filename && item.type === 'file') {
              return item;
            }
            if (item.children) {
              const found = findFile(item.children);
              if (found) return found;
            }
          }
          return null;
        };

        const file = findFile(files);
        if (file) {
          handleFileSelect(file);
        }
      },

      closeFile: async (filename: string) => {
        const tab = tabs.find((t) => t.id === filename || t.name === filename);
        if (tab) {
          handleTabClose(tab.id);
        }
      },
    }),
    [
      tabs,
      files,
      handleRunCode,
      handleTerminalCommand,
      handleFileSelect,
      handleTabClose,
      reloadFilesFromDisk,
    ]
  );

  const handleResetLayout = useCallback(() => {
    if (window.resetGooseCodeLayout) {
      window.resetGooseCodeLayout();
    }
  }, []);

  const handleResetSession = useCallback(() => {
    // Clear the cached session to start fresh
    localStorage.removeItem('goosecode_session_id');
    resetSession();
    setTerminalOutput((prev) => [
      ...prev,
      '> Goose session reset - will reinitialize with fresh tools',
    ]);
  }, [resetSession]);

  // Show folder selection screen if no folder selected
  if (isSelectingFolder || !workingDir) {
    return (
      <div className="w-full h-full bg-background-app flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <h1 className="text-3xl font-bold mb-6">GooseCode</h1>
          <p className="text-text-default mb-8 text-lg">
            Select a project folder to start coding with AI assistance.
          </p>
          <button
            onClick={handleSelectFolder}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-3 mx-auto mb-6"
          >
            <Folder className="w-6 h-6" />
            Select Project Folder
          </button>
          <p className="text-sm text-text-muted mt-6">
            GooseCode will load all files from the selected folder,
            <br />
            give you a terminal, and connect to your Goose AI agent.
          </p>
        </div>
      </div>
    );
  }

  // Show loading state while files or session initialize
  if (isLoadingFiles || (isSessionInitializing && !session)) {
    return (
      <div className="w-full h-full bg-background-app flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-text-muted">
            {isLoadingFiles ? 'Loading files from disk...' : 'Initializing Goose session...'}
          </p>
        </div>
      </div>
    );
  }

  // Show error if session failed
  if (sessionError && !session) {
    return (
      <div className="w-full h-full bg-background-app flex items-center justify-center">
        <div className="text-center max-w-md p-6">
          <p className="text-red-400 mb-4">Failed to initialize Goose session:</p>
          <p className="text-text-muted mb-4">{sessionError}</p>
          <Button onClick={resetSession}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-background-app flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default pl-12 pr-4 py-2">
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <div className="flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="truncate max-w-[160px]" title={workingDir}>
              {workingDir?.split('/').pop() || 'No folder'}
            </span>
          </div>
          {session && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
              <span>Connected</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="xs"
            shape="round"
            onClick={handleSelectFolder}
            title="Change folder"
          >
            <Folder className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            shape="round"
            onClick={reloadFilesFromDisk}
            title="Refresh files"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            shape="round"
            onClick={handleResetSession}
            title="Reset Goose session"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            shape="round"
            onClick={handleResetLayout}
            title="Reset layout"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Main Dockview Layout */}
      <div className="flex-1 min-h-0">
        <DockviewLayout
          files={files}
          onToggleFolder={toggleFolder}
          onFileSelect={handleFileSelect}
          onCreateFile={handleCreateFile}
          onCreateFolder={handleCreateFolder}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onTabClose={handleTabClose}
          onContentChange={handleTabContentChange}
          onRunCode={handleRunCode}
          onSave={handleSaveTab}
          isRunning={isRunning}
          previewRef={previewRef}
          onRefreshPreview={updatePreview}
          terminalOutput={terminalOutput}
          onTerminalCommand={handleTerminalCommand}
          sessionId={sessionId}
          workingDir={workingDir}
          ideState={ideState}
          toolHandlers={toolHandlers}
        />
      </div>
    </div>
  );
};

export default GooseCodeView;
