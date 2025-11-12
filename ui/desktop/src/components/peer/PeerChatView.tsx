/* eslint-env browser */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import {
  Loader2,
  Send,
  UsersRound,
  Link2,
  Download,
  UserPlus,
  Plug,
  ShieldCheck,
} from 'lucide-react';
import { createPeerClient, GoosePeerClient, PeerIdentity } from '../../peer/webrtcClient';
import { listContacts, PeerContact, removeContact, upsertContact } from '../../peer/contacts';
import { loadIdentity, updateDeviceName } from '../../peer/identity';

type FormElement = globalThis.HTMLFormElement;

interface ChatMessage {
  id: string;
  author: 'self' | 'peer';
  text: string;
  at: number;
}

type ConnectionStatus =
  | 'idle'
  | 'pending'
  | 'ready'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

function parseInvite(input: string): { roomId: string; token: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('goose://')) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'goose:') return null;
      const roomId = url.searchParams.get('room') ?? '';
      const token = url.searchParams.get('token') ?? '';
      if (!roomId || !token) return null;
      return { roomId, token };
    } catch (error) {
      console.warn('[Peer] failed to parse invite URL', error);
      return null;
    }
  }

  const parts = trimmed.split(':');
  if (parts.length === 2) {
    return { roomId: parts[0].trim(), token: parts[1].trim() };
  }

  return null;
}

export const PeerChatView: React.FC = () => {
  const [identity, setIdentity] = useState(() => loadIdentity());
  const [selfNameDraft, setSelfNameDraft] = useState(identity.deviceName);
  const [contacts, setContacts] = useState<PeerContact[]>(() => listContacts());
  const [currentContactId, setCurrentContactId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<{ roomId: string; token: string } | null>(
    null
  );
  const [client, setClient] = useState<GoosePeerClient | null>(null);
  const [peer, setPeer] = useState<PeerIdentity | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [joinInput, setJoinInput] = useState('');
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = window.electron.peer.onInvite((payload) => {
        if (payload.roomId && payload.token) {
          setPendingInvite({ roomId: payload.roomId, token: payload.token });
          setStatus('pending');
          setStatusMessage('Received invite link');
        }
      });
    } catch (error) {
      console.error('Failed to bind peer invite listener', error);
    }
    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    window.electron.peer
      .getBaseUrl()
      .then((url) => {
        if (mounted) {
          setBaseUrl(url);
        }
      })
      .catch((error) => console.error('Failed to fetch peer base URL', error));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      client?.close();
    };
  }, [client]);

  const connectionBadge = useMemo(() => {
    switch (status) {
      case 'connected':
        return <Badge variant="default">Connected</Badge>;
      case 'connecting':
      case 'pending':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Connecting
          </Badge>
        );
      case 'error':
        return <Badge variant="destructive">Failed</Badge>;
      case 'disconnected':
        return <Badge variant="outline">Disconnected</Badge>;
      default:
        return <Badge variant="outline">Idle</Badge>;
    }
  }, [status]);

  const resetSession = () => {
    client?.close();
    setClient(null);
    setMessages([]);
    setPeer(null);
    setInviteLink(null);
    setStatus('idle');
    setStatusMessage(null);
    setConnectError(null);
  };

  const appendMessage = (author: 'self' | 'peer', text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        author,
        text,
        at: Date.now(),
      },
    ]);
  };

  const attachClient = (nextClient: GoosePeerClient) => {
    nextClient.on('peerInfo', (info) => {
      setPeer(info);
      if (info) {
        upsertContact({
          deviceId: info.deviceId,
          deviceName: info.deviceName,
          publicKey: info.publicKey,
        });
        setContacts(listContacts());
        setCurrentContactId(info.deviceId);
      }
    });

    nextClient.on('message', (text) => {
      appendMessage('peer', text);
    });

    nextClient.on('state', (state) => {
      if (state === 'connected') {
        setStatus('connected');
        setStatusMessage('Secure channel established');
        setConnectError(null);
      } else if (state === 'failed') {
        setStatus('error');
        setStatusMessage('Connection failed');
      } else if (state === 'disconnected') {
        setStatus('disconnected');
        setStatusMessage('Peer disconnected');
      }
    });

    nextClient.on('error', (error) => {
      setStatus('error');
      setConnectError(error.message);
      setStatusMessage('Connection error');
    });

    nextClient.on('disconnected', () => {
      setStatus('disconnected');
      setStatusMessage('Peer disconnected');
    });

    setClient(nextClient);
  };

  const ensureBaseUrl = async () => {
    if (baseUrl) {
      return baseUrl;
    }
    const url = await window.electron.peer.getBaseUrl();
    setBaseUrl(url);
    if (!url) {
      throw new Error('Peer server is not available');
    }
    return url;
  };

  const handleCreateInvite = async () => {
    resetSession();
    setStatus('connecting');
    setStatusMessage('Requesting invite');
    try {
      const url = await ensureBaseUrl();
      if (!url) {
        throw new Error('Goose server unavailable');
      }
      const response = await window.electron.peer.createInvite({
        deviceId: identity.deviceId,
        deviceName: identity.deviceName,
      });
      setInviteLink(response.invite_url);
      setStatusMessage('Waiting for peer to join');

      const clientInstance = createPeerClient({
        role: 'host',
        roomId: response.room_id,
        wsToken: response.host_token,
        signalingBaseUrl: url,
      });
      attachClient(clientInstance);
    } catch (error) {
      console.error('Failed to create invite', error);
      setStatus('error');
      setStatusMessage('Failed to create invite');
      setConnectError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleJoinInvite = async (input?: string) => {
    const payload = input ? parseInvite(input) : pendingInvite;
    if (!payload) {
      setConnectError('Invite is invalid');
      setStatus('error');
      return;
    }

    resetSession();
    setStatus('connecting');
    setStatusMessage('Joining invite');

    try {
      const url = await ensureBaseUrl();
      if (!url) {
        throw new Error('Goose server unavailable');
      }

      const response = await window.electron.peer.joinInvite({
        roomId: payload.roomId,
        inviteToken: payload.token,
        deviceId: identity.deviceId,
        deviceName: identity.deviceName,
      });

      setStatus('connecting');
      setStatusMessage('Negotiating connection');
      const clientInstance = createPeerClient({
        role: 'guest',
        roomId: response.room_id,
        wsToken: response.ws_token,
        signalingBaseUrl: url,
      });
      attachClient(clientInstance);
      if (response.host) {
        upsertContact({
          deviceId: response.host.device_id,
          deviceName: response.host.device_name,
          publicKey: response.host.public_key ?? undefined,
        });
        setContacts(listContacts());
        setCurrentContactId(response.host.device_id);
      }
    } catch (error) {
      console.error('Failed to join invite', error);
      setStatus('error');
      setStatusMessage('Failed to join');
      setConnectError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!client) {
      setConnectError('No connection');
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      client.sendMessage(trimmed);
      appendMessage('self', trimmed);
    } catch (error) {
      console.error('Failed to send message', error);
      setConnectError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSubmitSend = (event: React.FormEvent<FormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const value = (formData.get('message') as string) ?? '';
    handleSendMessage(value);
    event.currentTarget.reset();
  };

  const handleSaveName = () => {
    const updated = updateDeviceName(selfNameDraft);
    setIdentity(updated);
  };

  const handleSelectContact = (contact: PeerContact) => {
    setCurrentContactId(contact.deviceId);
    setPendingInvite(null);
    setStatus('idle');
    setStatusMessage(`Invite ${contact.deviceName} to start a session`);
  };

  const handleForgetContact = (deviceId: string) => {
    removeContact(deviceId);
    setContacts(listContacts());
    if (currentContactId === deviceId) {
      setCurrentContactId(null);
    }
  };

  return (
    <div className="flex h-full bg-background-default text-text-default">
      <aside className="w-72 border-r border-border-subtle flex flex-col">
        <div className="p-4 border-b border-border-subtle space-y-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <UsersRound className="w-4 h-4" />
              Known Contacts
            </h2>
            <p className="text-xs text-text-muted">Saved peers appear here after you connect.</p>
          </div>
          <ScrollArea className="h-48">
            <ul className="space-y-2 pr-2">
              {contacts.length === 0 && (
                <li className="text-xs text-text-muted">No contacts yet.</li>
              )}
              {contacts.map((contact) => (
                <li key={contact.deviceId}>
                  <button
                    type="button"
                    onClick={() => handleSelectContact(contact)}
                    className={`w-full text-left text-sm px-2 py-1 rounded border transition-colors ${
                      currentContactId === contact.deviceId
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-transparent hover:border-border-subtle hover:bg-background-medium'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span>{contact.deviceName}</span>
                      <button
                        type="button"
                        className="text-[11px] text-text-muted hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleForgetContact(contact.deviceId);
                        }}
                      >
                        Forget
                      </button>
                    </div>
                    <div className="text-[11px] text-text-muted mt-1">
                      Seen {new Date(contact.lastSeenAt).toLocaleString()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>

        <div className="p-4 border-t border-border-subtle space-y-2">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <ShieldCheck className="w-3.5 h-3.5" />
            Peer chats use end-to-end encrypted WebRTC channels.
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <div>
            <h1 className="text-base font-semibold flex items-center gap-2">
              <Plug className="w-5 h-5" />
              Peer Chat
            </h1>
            <p className="text-xs text-text-muted">
              Share invites with other Goose desktops to collaborate in real time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {connectionBadge}
            {statusMessage && <span className="text-xs text-text-muted">{statusMessage}</span>}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_auto] overflow-hidden flex-1">
          <div className="border-r border-border-subtle overflow-y-auto p-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <UserPlus className="w-4 h-4" />
                  Your device
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs text-text-muted block mb-1">Display name</label>
                  <div className="flex gap-2">
                    <Input
                      value={selfNameDraft}
                      onChange={(event) => setSelfNameDraft(event.target.value)}
                      className="text-sm"
                    />
                    <Button size="sm" variant="secondary" onClick={handleSaveName}>
                      Save
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-text-muted break-all">
                  Device ID: <span className="font-mono">{identity.deviceId}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Link2 className="w-4 h-4" />
                  Share an invite
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={handleCreateInvite} className="w-full" variant="default">
                  Generate invite link
                </Button>
                {inviteLink && (
                  <div className="text-xs">
                    <p className="text-text-muted mb-1">Share this link with your peer:</p>
                    <div className="p-2 rounded border border-border-subtle bg-background-medium break-all">
                      {inviteLink}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Download className="w-4 h-4" />
                  Join an invite
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Paste goose://peer link"
                  value={joinInput}
                  onChange={(event) => setJoinInput(event.target.value)}
                  className="text-sm"
                />
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => handleJoinInvite(joinInput)}
                  disabled={!joinInput.trim()}
                >
                  Join
                </Button>
                {pendingInvite && (
                  <div className="text-xs text-text-muted">
                    deeplink detected.{' '}
                    <button type="button" className="underline" onClick={() => handleJoinInvite()}>
                      Tap to join
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="h-full flex items-center justify-center text-sm text-text-muted text-center px-6">
                  {status === 'connected'
                    ? 'You are connected. Start chatting below.'
                    : 'Start a session to exchange messages.'}
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className="flex flex-col">
                  <div
                    className={`inline-flex px-3 py-2 rounded-lg text-sm max-w-lg ${
                      msg.author === 'self'
                        ? 'self-end bg-primary text-primary-foreground'
                        : 'bg-background-medium border border-border-subtle'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[11px] text-text-muted mt-1">
                    {msg.author === 'self' ? 'You' : (peer?.deviceName ?? 'Peer')} •{' '}
                    {new Date(msg.at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmitSend} className="border-t border-border-subtle px-4 py-3">
              <div className="flex gap-2">
                <Input
                  name="message"
                  placeholder={
                    status === 'connected' ? 'Send a message…' : 'Connect to enable chat'
                  }
                  disabled={status !== 'connected'}
                  className="text-sm"
                  autoComplete="off"
                />
                <Button type="submit" disabled={status !== 'connected'}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              {connectError && <p className="text-xs text-destructive mt-2">{connectError}</p>}
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PeerChatView;
