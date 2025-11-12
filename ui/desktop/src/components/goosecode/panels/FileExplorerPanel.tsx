import React, { useState } from 'react';
import { Folder, FileText, ChevronRight, ChevronDown, FilePlus, FolderPlus, X } from 'lucide-react';
import { Button } from '../../ui/button';

export interface FileItem {
  name: string;
  path: string; // Full relative path from working directory
  type: 'file' | 'folder';
  content?: string;
  children?: FileItem[];
  isOpen?: boolean;
}

interface FileExplorerPanelProps {
  files: FileItem[];
  onToggleFolder: (folderName: string) => void;
  onFileSelect?: (file: FileItem) => void;
  onCreateFile?: (filename: string) => void;
  onCreateFolder?: (foldername: string) => void;
}

export const FileExplorerPanel: React.FC<FileExplorerPanelProps> = ({
  files,
  onToggleFolder,
  onFileSelect,
  onCreateFile,
  onCreateFolder,
}) => {
  const [isCreating, setIsCreating] = useState<'file' | 'folder' | null>(null);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) return;

    if (isCreating === 'file') {
      onCreateFile?.(newName);
    } else if (isCreating === 'folder') {
      onCreateFolder?.(newName);
    }

    setNewName('');
    setIsCreating(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreate();
    } else if (e.key === 'Escape') {
      setNewName('');
      setIsCreating(null);
    }
  };
  const renderFileTree = (items: FileItem[], depth = 0): React.ReactNode[] => {
    return items.map((item, index) => (
      <div key={index} style={{ marginLeft: depth * 16 }}>
        {item.type === 'folder' ? (
          <div>
            <button
              onClick={() => onToggleFolder(item.name)}
              className="flex items-center gap-2 py-1 px-2 hover:bg-background-medium rounded w-full text-left text-sm"
            >
              {item.isOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <Folder className="w-3 h-3 text-yellow-500" />
              <span>{item.name}</span>
            </button>
            {item.isOpen && item.children && (
              <div className="ml-2">{renderFileTree(item.children, depth + 1)}</div>
            )}
          </div>
        ) : (
          <button
            onClick={() => onFileSelect?.(item)}
            className="flex items-center gap-2 py-1 px-2 hover:bg-background-medium rounded w-full text-left text-sm"
          >
            <FileText className="w-3 h-3 text-blue-400" />
            <span>{item.name}</span>
          </button>
        )}
      </div>
    ));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1 border-b border-[#181818]">
        <div className="flex items-center gap-1.5">
          <Folder className="w-3 h-3" />
          <span className="font-medium text-[11px]">Explorer</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            className="h-5 w-5 p-0"
            onClick={() => setIsCreating('file')}
            title="New File"
          >
            <FilePlus className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="h-5 w-5 p-0"
            onClick={() => setIsCreating('folder')}
            title="New Folder"
          >
            <FolderPlus className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <div className="flex-1 p-2 overflow-y-auto">
        {isCreating && (
          <div className="mb-2 p-2 bg-background-medium rounded">
            <div className="flex items-center gap-2">
              {isCreating === 'file' ? (
                <FileText className="w-3 h-3 text-blue-400" />
              ) : (
                <Folder className="w-3 h-3 text-yellow-500" />
              )}
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={
                  isCreating === 'file'
                    ? 'file.ext or path/to/file.ext'
                    : 'folder-name or path/to/folder'
                }
                className="flex-1 px-2 py-1 text-xs bg-background-default border border-border-subtle rounded"
                autoFocus
              />
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setNewName('');
                  setIsCreating(null);
                }}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}

        {renderFileTree(files)}
      </div>
    </div>
  );
};
