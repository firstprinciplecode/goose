import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Trash2, Plus, Power, PowerOff, Loader2 } from 'lucide-react';
import type { PeerSettings, TurnServerConfig } from '../../peer/settings';
import type { PeerNgrokConfig, PeerNgrokStatus } from '../../preload';

interface PeerSettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: PeerSettings;
  onSave: (settings: PeerSettings) => void;
  ngrokConfig: PeerNgrokConfig | null;
  ngrokStatus: PeerNgrokStatus;
  onSaveNgrok: (config: Partial<PeerNgrokConfig>) => Promise<void>;
  onStartNgrok: () => Promise<void>;
  onStopNgrok: () => Promise<void>;
}

export const PeerSettingsModal: React.FC<PeerSettingsModalProps> = ({
  open,
  onClose,
  settings: initialSettings,
  onSave,
  ngrokConfig,
  ngrokStatus,
  onSaveNgrok,
  onStartNgrok,
  onStopNgrok,
}) => {
  const [settings, setSettings] = useState<PeerSettings>(initialSettings);
  const [newTurn, setNewTurn] = useState<TurnServerConfig>({
    urls: '',
    username: '',
    credential: '',
  });
  const [localNgrok, setLocalNgrok] = useState<PeerNgrokConfig>(ngrokConfig ?? {});
  const [saving, setSaving] = useState(false);
  const [ngrokActionRunning, setNgrokActionRunning] = useState(false);

  useEffect(() => {
    if (open) {
      setSettings(initialSettings);
      setLocalNgrok(ngrokConfig ?? {});
    }
  }, [open, initialSettings, ngrokConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveNgrok(localNgrok);
      onSave(settings);
      onClose();
    } catch (error) {
      console.error('Failed to save peer chat settings', error);
    } finally {
      setSaving(false);
    }
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

  const handleNgrokFieldChange = <K extends keyof PeerNgrokConfig>(
    key: K,
    value: PeerNgrokConfig[K]
  ) => {
    setLocalNgrok((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleStartTunnel = async () => {
    setNgrokActionRunning(true);
    try {
      await onSaveNgrok(localNgrok);
      await onStartNgrok();
    } catch (error) {
      console.error('Failed to start ngrok tunnel', error);
    } finally {
      setNgrokActionRunning(false);
    }
  };

  const handleStopTunnel = async () => {
    setNgrokActionRunning(true);
    try {
      await onStopNgrok();
    } catch (error) {
      console.error('Failed to stop ngrok tunnel', error);
    } finally {
      setNgrokActionRunning(false);
    }
  };

  const renderStatusBadge = () => {
    const status = ngrokStatus.status;
    const variants: Record<PeerNgrokStatus['status'], 'default' | 'secondary' | 'destructive'> = {
      online: 'default',
      starting: 'secondary',
      stopping: 'secondary',
      idle: 'secondary',
      error: 'destructive',
    };

    const label = status.charAt(0).toUpperCase() + status.slice(1);

    return <Badge variant={variants[status]}>{label}</Badge>;
  };

  const ngrokIsStarting = ngrokStatus.status === 'starting';
  const ngrokIsStopping = ngrokStatus.status === 'stopping';
  const ngrokIsOnline = ngrokStatus.status === 'online';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Peer Connection Settings</DialogTitle>
          <DialogDescription>
            Configure relay servers or manage the optional ngrok tunnel for remote peers.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="relay" className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="relay">Relay Servers</TabsTrigger>
            <TabsTrigger value="tunnel">Ngrok Tunnel</TabsTrigger>
          </TabsList>

          <TabsContent value="relay" className="space-y-6 py-4">
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

            <div className="space-y-3 border-t pt-4">
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
                    onChange={(e) =>
                      setNewTurn((prev) => ({ ...prev, credential: e.target.value }))
                    }
                    className="text-sm"
                  />
                </div>
                <Button
                  onClick={handleAddTurn}
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={
                    !(
                      typeof newTurn.urls === 'string' ? newTurn.urls : newTurn.urls[0] || ''
                    ).trim()
                  }
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add TURN Server
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tunnel" className="space-y-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-semibold">Ngrok Tunnel</Label>
                <p className="text-xs text-text-muted">
                  Provide secure remote access to your Goose server when peers cannot reach your
                  network directly.
                </p>
              </div>
              {renderStatusBadge()}
            </div>

            <div className="space-y-2">
              <div>
                <Label htmlFor="ngrok-path" className="text-xs text-text-muted">
                  Ngrok binary path (leave blank to use PATH)
                </Label>
                <Input
                  id="ngrok-path"
                  placeholder="/usr/local/bin/ngrok"
                  value={localNgrok.binaryPath ?? ''}
                  onChange={(event) => handleNgrokFieldChange('binaryPath', event.target.value)}
                  className="text-sm"
                />
              </div>
              <div>
                <Label htmlFor="ngrok-token" className="text-xs text-text-muted">
                  Auth token
                </Label>
                <Input
                  id="ngrok-token"
                  type="password"
                  placeholder="Your ngrok auth token"
                  value={localNgrok.authToken ?? ''}
                  onChange={(event) => handleNgrokFieldChange('authToken', event.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="ngrok-auto-start"
                  checked={localNgrok.autoStart ?? false}
                  onChange={(event) => handleNgrokFieldChange('autoStart', event.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="ngrok-auto-start" className="text-sm font-normal cursor-pointer">
                  Start tunnel automatically when Goose launches
                </Label>
              </div>
              {ngrokStatus.publicUrl && (
                <div className="text-xs text-text-muted break-all">
                  Active URL:{' '}
                  <span className="font-mono text-text-default">{ngrokStatus.publicUrl}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleStartTunnel}
                variant="default"
                size="sm"
                disabled={ngrokActionRunning || ngrokIsStarting || ngrokIsOnline}
              >
                {ngrokIsStarting || ngrokActionRunning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Power className="mr-2 h-4 w-4" />
                )}
                Start Tunnel
              </Button>
              <Button
                onClick={handleStopTunnel}
                variant="outline"
                size="sm"
                disabled={ngrokActionRunning || !ngrokIsOnline || ngrokIsStopping}
              >
                {ngrokIsStopping || ngrokActionRunning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PowerOff className="mr-2 h-4 w-4" />
                )}
                Stop Tunnel
              </Button>
            </div>

            {ngrokStatus.error && <p className="text-xs text-destructive">{ngrokStatus.error}</p>}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleSave} variant="default" disabled={saving || ngrokActionRunning}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
