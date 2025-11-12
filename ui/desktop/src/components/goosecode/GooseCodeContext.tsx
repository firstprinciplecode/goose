import { createContext, useContext } from 'react';
import type { FileItem } from './panels/FileExplorerPanel';
import type { Tab } from './panels/EditorPanel';

export type GoosePreviewState = 'ready' | 'error' | 'loading';

export interface GooseCodeState {
  files: FileItem[];
  tabs: Tab[];
  activeTab: string;
  terminalOutput: string[];
  previewState: GoosePreviewState;
  previewError?: string;
  sessionId: string;
  workingDir: string;
}

export interface GooseCodeContextValue {
  state: GooseCodeState;
}

const GooseCodeContext = createContext<GooseCodeContextValue | null>(null);

export const GooseCodeProvider = GooseCodeContext.Provider;

export const useGooseCodeContext = () => {
  const ctx = useContext(GooseCodeContext);
  if (!ctx) {
    throw new Error('useGooseCodeContext must be used within GooseCodeProvider');
  }
  return ctx;
};

export default GooseCodeContext;
