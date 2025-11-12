import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Trash2, Plus } from 'lucide-react';
import type { PeerSettings, TurnServerConfig } from '../../peer/settings';

interface PeerSettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: PeerSettings;
  onSave: (settings: PeerSettings) => void;
}

export const PeerSettingsModal: React.FC<PeerSettingsModalProps> = ({
  open,
  onClose,
  settings: initialSettings,
  onSave,
}) => {
  const [settings, setSettings] = useState<PeerSettings>(initialSettings);
  const [newTurn, setNewTurn] = useState<TurnServerConfig>({
    urls: '',
    username: '',
    credential: '',
  });

  useEffect(() => {
    if (open) {
      setSettings(initialSettings);
    }
  }, [open, initialSettings]);

  const handleSave = () => {
    onSave(settings);
    onClose();
  };

  const handleAddTurn = () => {
    const urlsStr = typeof newTurn.urls === 'string' ? newTurn.urls : newTurn.urls[0] || '';
    if (!urlsStr.trim()) return;
    setSettings((prev) => ({
      ...prev,
      turnServers: [...prev.turnServers, { ...newTurn }],
    }));
    setNewTurn({ urls: '', username: '', credential: '' });
  };

  const handleRemoveTurn = (index: number) => {
    setSettings((prev) => ({
      ...prev,
      turnServers: prev.turnServers.filter((_, i) => i !== index),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Peer Connection Settings</DialogTitle>
          <DialogDescription>
            Configure TURN servers for better connectivity through firewalls and NAT.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Use Default STUN */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="useDefaultStun"
              checked={settings.useDefaultStun}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, useDefaultStun: e.target.checked }))
              }
              className="h-4 w-4"
            />
            <Label htmlFor="useDefaultStun" className="text-sm font-normal cursor-pointer">
              Use default STUN servers (recommended)
            </Label>
          </div>

          {/* Existing TURN Servers */}
          {settings.turnServers.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Configured TURN Servers</Label>
              {settings.turnServers.map((turn, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-3 bg-background-medium rounded-lg"
                >
                  <div className="flex-1 text-xs">
                    <div className="font-mono text-text-default">{turn.urls}</div>
                    {turn.username && (
                      <div className="text-text-muted mt-1">User: {turn.username}</div>
                    )}
                  </div>
                  <Button
                    onClick={() => handleRemoveTurn(index)}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add New TURN Server */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Add TURN Server</Label>
            <div className="space-y-2">
              <div>
                <Label htmlFor="turn-url" className="text-xs text-text-muted">
                  URL (e.g., turn:example.com:3478)
                </Label>
                <Input
                  id="turn-url"
                  placeholder="turn:example.com:3478"
                  value={newTurn.urls}
                  onChange={(e) => setNewTurn((prev) => ({ ...prev, urls: e.target.value }))}
                  className="text-sm"
                />
              </div>
              <div>
                <Label htmlFor="turn-username" className="text-xs text-text-muted">
                  Username (optional)
                </Label>
                <Input
                  id="turn-username"
                  placeholder="username"
                  value={newTurn.username}
                  onChange={(e) => setNewTurn((prev) => ({ ...prev, username: e.target.value }))}
                  className="text-sm"
                />
              </div>
              <div>
                <Label htmlFor="turn-credential" className="text-xs text-text-muted">
                  Credential (optional)
                </Label>
                <Input
                  id="turn-credential"
                  type="password"
                  placeholder="credential"
                  value={newTurn.credential}
                  onChange={(e) => setNewTurn((prev) => ({ ...prev, credential: e.target.value }))}
                  className="text-sm"
                />
              </div>
              <Button
                onClick={handleAddTurn}
                variant="outline"
                size="sm"
                className="w-full"
                disabled={
                  !(typeof newTurn.urls === 'string' ? newTurn.urls : newTurn.urls[0] || '').trim()
                }
              >
                <Plus className="w-4 h-4 mr-2" />
                Add TURN Server
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button onClick={handleSave} variant="default">
              Save Settings
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
