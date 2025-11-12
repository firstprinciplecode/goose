import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { ShieldCheck } from 'lucide-react';
import { generateFingerprint } from '../../peer/fingerprint';

interface FingerprintVerifyModalProps {
  open: boolean;
  onClose: () => void;
  peer: {
    deviceId: string;
    deviceName: string;
    publicKey?: string | null;
  };
  onTrust: () => void;
  onReject: () => void;
  autoTrusted: boolean;
}

export const FingerprintVerifyModal: React.FC<FingerprintVerifyModalProps> = ({
  open,
  onClose,
  peer,
  onTrust,
  onReject,
  autoTrusted,
}) => {
  const publicKey = peer.publicKey || '';
  const fingerprint = generateFingerprint(publicKey);
  // For now, always treat as 'new' - can be extended to detect changes
  const status: 'new' | 'trusted' = autoTrusted ? 'trusted' : 'new';

  const getStatusInfo = () => {
    switch (status) {
      case 'new':
        return {
          icon: <ShieldCheck className="w-6 h-6 text-blue-500" />,
          title: 'Verify New Connection',
          description: 'This is the first time connecting to this device.',
          color: 'text-blue-500',
        };
      case 'trusted':
        return {
          icon: <ShieldCheck className="w-6 h-6 text-green-500" />,
          title: 'Trusted Connection',
          description: 'This device fingerprint is already trusted.',
          color: 'text-green-500',
        };
    }
  };

  const info = getStatusInfo();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {info.icon}
            <div>
              <DialogTitle>{info.title}</DialogTitle>
              <DialogDescription>{info.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <div className="text-sm font-semibold mb-2">Device Name</div>
            <div className="text-sm text-text-muted">{peer.deviceName}</div>
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">Fingerprint</div>
            <div className="font-mono text-xs bg-background-medium p-3 rounded-lg break-all leading-relaxed">
              {fingerprint}
            </div>
          </div>

          {status === 'new' && (
            <div className="text-xs text-text-muted">
              Verify this fingerprint matches what the other user sees on their device before
              continuing.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onReject} variant="outline">
            Reject
          </Button>
          {status !== 'trusted' && (
            <Button onClick={onTrust} variant="default">
              Trust & Continue
            </Button>
          )}
          {status === 'trusted' && (
            <Button onClick={onClose} variant="default">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
