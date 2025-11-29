import React from 'react';

interface ToolOutputCanvasProps {
  content: string;
  heading?: string;
  metadata?: Record<string, any>;
}

const ToolOutputCanvas: React.FC<ToolOutputCanvasProps> = ({ content, heading, metadata }) => {
  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900 overflow-hidden">
      {heading && (
        <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{heading}</h3>
          {metadata && (
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {Object.entries(metadata).map(([key, value]) => (
                <span key={key} className="mr-3">
                  {key}: {String(value)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto p-4">
        <pre className="font-mono text-xs text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words">
          {content}
        </pre>
      </div>
    </div>
  );
};

export default ToolOutputCanvas;
