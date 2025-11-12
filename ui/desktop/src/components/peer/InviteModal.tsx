import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Link2, UserPlus, Copy, Check } from 'lucide-react';

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  onCreateInvite: () => Promise<void>;
  onJoinInvite: (input: string) => Promise<void>;
  inviteLink: string | null;
  isCreating: boolean;
  isJoining: boolean;
}

export const InviteModal: React.FC<InviteModalProps> = ({
  open,
  onClose,
  onCreateInvite,
  onJoinInvite,
  inviteLink,
  isCreating,
  isJoining,
}) => {
  const [joinInput, setJoinInput] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joinInput.trim()) {
      await onJoinInvite(joinInput);
      setJoinInput('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Connect via Modem</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="create" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">
              <Link2 className="w-4 h-4 mr-2" />
              Create Invite
            </TabsTrigger>
            <TabsTrigger value="join">
              <UserPlus className="w-4 h-4 mr-2" />
              Join Invite
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-4 mt-4">
            <div className="text-sm text-text-muted">
              Generate a secure invite link to share with your Modem partner.
            </div>

            <Button
              onClick={onCreateInvite}
              disabled={isCreating || !!inviteLink}
              className="w-full"
              size="lg"
            >
              {isCreating
                ? 'Generating...'
                : inviteLink
                  ? 'Invite Created'
                  : 'Generate Invite Link'}
            </Button>

            {inviteLink && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input value={inviteLink} readOnly className="font-mono text-xs" />
                  <Button
                    onClick={handleCopy}
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0 w-10 h-10"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-text-muted">
                  Share this link with your Modem partner. They can paste it in the "Join Invite"
                  tab.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="join" className="space-y-4 mt-4">
            <div className="text-sm text-text-muted">
              Paste an invite link you received from a Modem partner.
            </div>

            <form onSubmit={handleJoin} className="space-y-4">
              <Input
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                placeholder="goose://peer?room=...&token=..."
                className="font-mono text-xs"
              />

              <Button
                type="submit"
                disabled={!joinInput.trim() || isJoining}
                className="w-full"
                size="lg"
              >
                {isJoining ? 'Joining...' : 'Join Conversation'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
