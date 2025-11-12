/* eslint-env browser */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Loader2, Send, UsersRound, ShieldCheck, Plus } from 'lucide-react';
import { InviteModal } from './InviteModal';
import { createPeerClient, GoosePeerClient, PeerIdentity } from '../../peer/webrtcClient';
import { listContacts, PeerContact, removeContact, upsertContact } from '../../peer/contacts';
import { loadIdentity } from '../../peer/identity';

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

function parseInvite(input: string): { roomId: string; token: string; baseUrl?: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('goose://')) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'goose:') return null;
      const roomId = url.searchParams.get('room') ?? '';
      const token = url.searchParams.get('token') ?? '';
      const hostBaseUrl = url.searchParams.get('host') ?? undefined;
      if (!roomId || !token) return null;
      return { roomId, token, baseUrl: hostBaseUrl ?? undefined };
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
  const [identity] = useState(() => loadIdentity());
  const [contacts, setContacts] = useState<PeerContact[]>(() => listContacts());
  const [currentContactId, setCurrentContactId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<{
    roomId: string;
    token: string;
    baseUrl?: string;
  } | null>(null);
  const [client, setClient] = useState<GoosePeerClient | null>(null);
  const [peer, setPeer] = useState<PeerIdentity | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = window.electron.peer.onInvite((payload) => {
        if (payload.roomId && payload.token) {
          setPendingInvite({
            roomId: payload.roomId,
            token: payload.token,
            baseUrl: payload.hostBaseUrl,
          });
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

  const resolveShareBaseUrl = (): string | null => {
    const envBase = window.appConfig.get('GOOSE_BASE_URL_SHARE');
    if (typeof envBase === 'string') {
      const trimmed = envBase.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    try {
      const stored = window.localStorage.getItem('session_sharing_config');
      if (stored) {
        const parsed = JSON.parse(stored) as { enabled?: boolean; baseUrl?: string };
        if (parsed?.enabled && typeof parsed.baseUrl === 'string') {
          const trimmed = parsed.baseUrl.trim();
          if (trimmed) {
            return trimmed;
          }
        }
      }
    } catch (error) {
      console.warn('[Peer] failed to read session sharing settings', error);
    }

    return null;
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
      const shareBase = resolveShareBaseUrl();
      const response = await window.electron.peer.createInvite({
        deviceId: identity.deviceId,
        deviceName: identity.deviceName,
        shareBaseUrl: shareBase ?? undefined,
      });
      setInviteLink(response.invite_url);
      const effectiveShare =
        typeof response.host_base_url === 'string' && response.host_base_url.trim().length > 0
          ? response.host_base_url.trim()
          : (shareBase ?? null);
      if (effectiveShare) {
        setStatusMessage(`Waiting for peer to join via ${effectiveShare}`);
        setConnectError(null);
      } else {
        setStatusMessage('Waiting for peer to join');
        setConnectError(
          'Invite link does not include a reachable address. Configure Session Sharing > Base URL so peers on other machines can reach you.'
        );
      }

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
        baseUrlOverride: payload.baseUrl,
      });

      setStatus('connecting');
      setStatusMessage('Negotiating connection');
      const signalingBase =
        payload.baseUrl ??
        (typeof response.host_base_url === 'string' && response.host_base_url
          ? response.host_base_url
          : url);
      const clientInstance = createPeerClient({
        role: 'guest',
        roomId: response.room_id,
        wsToken: response.ws_token,
        signalingBaseUrl: signalingBase,
      });
      attachClient(clientInstance);
      setPendingInvite(null);
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
    <>
      <InviteModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreateInvite={async () => {
          await handleCreateInvite();
        }}
        onJoinInvite={async (input) => {
          await handleJoinInvite(input);
          setIsModalOpen(false);
        }}
        inviteLink={inviteLink}
        isCreating={status === 'connecting' && !inviteLink}
        isJoining={status === 'connecting'}
      />

      <div className="flex h-full bg-background-default text-text-default">
        {/* Sidebar - Contacts */}
        <aside className="w-64 border-r border-border-subtle flex flex-col">
          <div className="p-4 flex items-center justify-between border-b border-border-subtle">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <UsersRound className="w-4 h-4" />
              Contacts
            </h2>
            <Button
              onClick={() => setIsModalOpen(true)}
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-1">
              {contacts.length === 0 && (
                <div className="text-xs text-text-muted text-center py-8">
                  <p>No contacts yet.</p>
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="mt-2 text-primary hover:underline"
                  >
                    Create or join an invite
                  </button>
                </div>
              )}
              {contacts.map((contact) => (
                <div
                  key={contact.deviceId}
                  onClick={() => handleSelectContact(contact)}
                  className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors cursor-pointer group ${
                    currentContactId === contact.deviceId
                      ? 'bg-primary/10 border border-primary/20'
                      : 'hover:bg-background-medium'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium truncate">{contact.deviceName}</span>
                    <button
                      type="button"
                      className="text-[10px] text-text-muted hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleForgetContact(contact.deviceId);
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">
                    {new Date(contact.lastSeenAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="p-3 border-t border-border-subtle">
            <div className="flex items-start gap-2 text-[10px] text-text-muted">
              <ShieldCheck className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>End-to-end encrypted WebRTC</span>
            </div>
          </div>
        </aside>

        {/* Main Chat Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
            <div className="flex-1">
              {peer ? (
                <div>
                  <h1 className="text-lg font-semibold">{peer.deviceName}</h1>
                  <p className="text-xs text-text-muted">
                    {status === 'connected' ? 'Connected' : 'Connecting...'}
                  </p>
                </div>
              ) : (
                <div>
                  <h1 className="text-lg font-semibold">Peer Chat</h1>
                  <p className="text-xs text-text-muted">
                    {statusMessage || 'No active conversation'}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {connectionBadge}
              {!peer && (
                <Button onClick={() => setIsModalOpen(true)} variant="default" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Connect
                </Button>
              )}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-6">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-md space-y-3">
                  {status === 'connected' ? (
                    <>
                      <div className="text-4xl">💬</div>
                      <p className="text-sm text-text-muted">
                        You're connected! Start chatting below.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-4xl">🤝</div>
                      <h3 className="text-base font-semibold">Connect with a Peer</h3>
                      <p className="text-sm text-text-muted">
                        Create an invite link or join an existing conversation to get started.
                      </p>
                      <Button
                        onClick={() => setIsModalOpen(true)}
                        variant="default"
                        className="mt-4"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Get Started
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.author === 'self' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm max-w-md ${
                      msg.author === 'self'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-background-medium border border-border-subtle rounded-bl-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-text-muted mt-1 px-2">
                    {new Date(msg.at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <form onSubmit={handleSubmitSend} className="border-t border-border-subtle px-6 py-4">
            <div className="flex gap-3 max-w-3xl mx-auto">
              <Input
                name="message"
                placeholder={
                  status === 'connected' ? 'Type a message...' : 'Connect to start chatting'
                }
                disabled={status !== 'connected'}
                className="flex-1"
                autoComplete="off"
              />
              <Button
                type="submit"
                disabled={status !== 'connected'}
                size="sm"
                className="h-10 w-10 rounded-full p-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            {connectError && (
              <p className="text-xs text-destructive mt-2 max-w-3xl mx-auto">{connectError}</p>
            )}
          </form>
        </main>
      </div>
    </>
  );
};

export default PeerChatView;
