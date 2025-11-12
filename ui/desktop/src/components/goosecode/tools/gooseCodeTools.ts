export interface GooseCodeToolHandlers {
  editFile: (filename: string, content: string) => Promise<void>;
  saveFile: (filename: string) => Promise<void>;
  runCode: () => Promise<void>;
  executeCommand: (command: string) => Promise<void>;
  openFile: (filename: string) => Promise<void>;
  closeFile: (filename: string) => Promise<void>;
}
