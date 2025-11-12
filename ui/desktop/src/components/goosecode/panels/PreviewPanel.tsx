/* eslint-env browser */
import React from 'react';

type FrameElement = globalThis.HTMLIFrameElement;
import { Eye, RotateCcw, Maximize2 } from 'lucide-react';
import { Button } from '../../ui/button';

interface PreviewPanelProps {
  previewRef: React.RefObject<FrameElement | null>;
  onRefresh: () => void;
  onMaximize?: () => void;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  previewRef,
  onRefresh,
  onMaximize,
}) => {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1 border-b border-[#181818]">
        <div className="flex items-center gap-1.5">
          <Eye className="w-3 h-3" />
          <span className="font-medium text-[11px]">Preview</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" className="h-5 w-5 p-0" onClick={onRefresh}>
            <RotateCcw className="w-3 h-3" />
          </Button>
          {onMaximize && (
            <Button variant="ghost" size="xs" className="h-5 w-5 p-0" onClick={onMaximize}>
              <Maximize2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1">
        <iframe
          ref={previewRef}
          className="w-full h-full border-none"
          title="Preview"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
};
