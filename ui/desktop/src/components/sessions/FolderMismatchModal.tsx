import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Folder } from 'lucide-react';

interface FolderMismatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionFolder: string;
  currentFolder: string;
  onOpenInNewWindow: () => void;
}

export function FolderMismatchModal({
  isOpen,
  onClose,
  sessionFolder,
  currentFolder,
  onOpenInNewWindow,
}: FolderMismatchModalProps) {
  const handleOpenInNewWindow = () => {
    onOpenInNewWindow();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Different Folder Detected</DialogTitle>
          <DialogDescription>
            This session is from a different folder than your current workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-background-muted rounded-lg">
            <Folder className="w-5 h-5 mt-0.5 text-text-muted flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-standard mb-1">Session folder:</p>
              <p className="text-sm text-text-muted break-all font-mono">{sessionFolder}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-background-muted rounded-lg">
            <Folder className="w-5 h-5 mt-0.5 text-text-muted flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-standard mb-1">Current folder:</p>
              <p className="text-sm text-text-muted break-all font-mono">{currentFolder}</p>
            </div>
          </div>

          <p className="text-sm text-text-muted">
            To continue this conversation, you can open it in a new window with the correct folder.
          </p>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleOpenInNewWindow}>
            Open in new window
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
