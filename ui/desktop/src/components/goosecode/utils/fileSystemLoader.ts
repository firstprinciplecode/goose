/**
 * File system loader for GooseCode
 * Loads real files and directory structure from disk
 */

import { FileItem } from '../panels/FileExplorerPanel';
import { Tab } from '../panels/EditorPanel';

/**
 * Load directory structure from disk using Electron IPC APIs
 */
export async function loadDirectoryStructure(
  dirPath: string,
  depth = 0,
  basePath?: string,
  relativePath = ''
): Promise<FileItem[]> {
  try {
    // Set basePath on first call
    if (!basePath) {
      basePath = dirPath;
    }

    // Use Electron IPC to read directory
    const entries = await window.electron.readDirectoryStructure(dirPath);
    const items: FileItem[] = [];

    for (const entry of entries) {
      // Skip hidden files and node_modules
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }

      const fullPath = `${dirPath}/${entry.name}`;
      const itemRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (entry.isDirectory) {
        // Only recursively load first level to avoid performance issues
        const children =
          depth < 1
            ? await loadDirectoryStructure(fullPath, depth + 1, basePath, itemRelativePath)
            : [];
        items.push({
          name: entry.name,
          path: itemRelativePath,
          type: 'folder',
          isOpen: depth < 1, // Auto-expand first level only
          children,
        });
      } else if (entry.isFile) {
        // Load file (but don't read content yet for performance)
        items.push({
          name: entry.name,
          path: itemRelativePath,
          type: 'file',
          content: '', // Will be loaded on-demand when tab is opened
        });
      }
    }

    return items.sort((a, b) => {
      // Folders first, then files, alphabetically
      if (a.type === 'folder' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error('Failed to load directory structure:', error);
    return [];
  }
}

/**
 * Load file content from disk using Electron IPC
 */
export async function loadFileContent(filePath: string): Promise<string> {
  try {
    const result = await window.electron.readFile(filePath);
    return result.file || '';
  } catch (error) {
    console.error('Failed to load file:', filePath, error);
    return '';
  }
}

/**
 * Load initial tabs from common files in the directory
 */
export async function loadInitialTabs(dirPath: string): Promise<Tab[]> {
  const tabs: Tab[] = [];
  const commonFiles = ['index.html', 'style.css', 'script.js'];

  for (const filename of commonFiles) {
    const filePath = `${dirPath}/${filename}`;

    try {
      const content = await loadFileContent(filePath);
      if (content) {
        // Only add if file exists and has content
        const fileType = filename.endsWith('.html')
          ? 'html'
          : filename.endsWith('.css')
            ? 'css'
            : filename.endsWith('.js')
              ? 'js'
              : filename.endsWith('.json')
                ? 'json'
                : 'html';

        tabs.push({
          id: filename,
          name: filename,
          content,
          isDirty: false,
          type: fileType,
        });
      }
    } catch (error) {
      console.error('Failed to load tab:', filename, error);
    }
  }

  return tabs;
}

/**
 * Watch directory for changes (simplified version)
 */
export function watchDirectory(_dirPath: string, _onChange: () => void): () => void {
  // File watching disabled - would need IPC implementation
  // Users can use "Refresh Files" button instead
  console.log('File watching not implemented - use Refresh Files button');
  return () => {}; // Return no-op cleanup
}
