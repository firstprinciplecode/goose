import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useSupabase } from '../contexts/SupabaseContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useTeamData } from '../hooks/useTeamData';
import { AttachmentIcon, UserIcon, MasonryIcon } from './ui/icons';
import BellIcon from '../assets/bell.svg';
import { redeemInvite, createChannelInvite } from '../services/teamService';

// Icons
const PlusIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const HashIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="4" y1="15" x2="20" y2="15" />
    <line x1="10" y1="3" x2="8" y2="21" />
    <line x1="16" y1="3" x2="14" y2="21" />
  </svg>
);

const LogOutIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const LinkIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const SendIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const UsersIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const MessageCircleIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const XIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// Helper to extract error message from Supabase errors or other objects
const getErrorMessage = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null) {
    const obj = e as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
    if (typeof obj.error_description === 'string') return obj.error_description;
    if (typeof obj.details === 'string') return obj.details;
    if (typeof obj.hint === 'string') return obj.hint;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
};

export default function TeamView() {
  const location = useLocation();
  const {
    client,
    isEnabled,
    missingKeys,
    reason,
    session,
    profile,
    authReady,
    authError,
    signInWithEmail,
    signInWithPassword,
    signUpWithPassword,
    verifyEmailOtp,
    signOut,
  } = useSupabase();

  const identity = useMemo(() => {
    if (!session) return null;
    const displayName =
      profile?.display_name ||
      (session.user.user_metadata && session.user.user_metadata.full_name) ||
      session.user.email ||
      'User';
    return {
      userId: session.user.id,
      email: session.user.email ?? undefined,
      displayName,
    };
  }, [session, profile]);

  const {
    state: {
      channels,
      messages,
      profiles,
      selectedChannelId,
      selectedChannelType,
      isLoadingChannels,
      isLoadingMessages,
      messagesCursor,
      error,
    },
    actions: { selectChannel, createChannel, createDm, sendMessage, loadOlder, refreshChannels },
    supabaseEnabled,
  } = useTeamData(identity);

  const [composerText, setComposerText] = useState('');
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [modalChannelName, setModalChannelName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [usePasswordAuth, setUsePasswordAuth] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  
  // Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteTargetEmail, setInviteTargetEmail] = useState('');
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  
  // Join modal state
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinCodeLoading, setJoinCodeLoading] = useState(false);
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);
  const [joinCodeSuccess, setJoinCodeSuccess] = useState(false);

  // Auto-scroll to bottom of messages
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId),
    [channels, selectedChannelId]
  );

  // Get unique users from profiles for the People section
  const connectedUsers = useMemo(() => {
    return Object.entries(profiles)
      .filter(([userId]) => userId !== session?.user?.id)
      .map(([userId, p]) => ({
        userId,
        displayName: p.display_name || p.email || userId.slice(0, 8),
        email: p.email,
      }));
  }, [profiles, session?.user?.id]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('invite');
    setInviteToken(token);
  }, [location.search]);

  const handleRedeemInvite = useCallback(async () => {
    if (!supabaseEnabled || !inviteToken || !session || !client) return;
    try {
      setInviteStatus('Redeeming invite...');
      setInviteError(null);
      await redeemInvite(client, inviteToken);
      setInviteStatus('Invite accepted!');
      await refreshChannels();
      setTimeout(() => setInviteStatus(null), 3000);
    } catch (e) {
      setInviteError(getErrorMessage(e));
    }
  }, [inviteToken, supabaseEnabled, session, refreshChannels, client]);

  useEffect(() => {
    if (session && inviteToken) {
      void handleRedeemInvite();
    }
  }, [session, inviteToken, handleRedeemInvite]);

  const handleCreateInvite = useCallback(async () => {
    if (!client || !selectedChannelId || !session) return;
    setInviteLoading(true);
    setGeneratedInviteLink(null);
    setInviteCopied(false);
    try {
      const invite = await createChannelInvite(
        client,
        selectedChannelId,
        session.user.id,
        { targetEmail: inviteTargetEmail || undefined, expiresInDays: 7 }
      );
      const baseUrl = window.location.origin + window.location.pathname;
      const link = `${baseUrl}#/team?invite=${invite.invite_token}`;
      setGeneratedInviteLink(link);
    } catch (e) {
      setInviteError(getErrorMessage(e));
    } finally {
      setInviteLoading(false);
    }
  }, [client, selectedChannelId, session, inviteTargetEmail]);

  const handleJoinWithCode = useCallback(async () => {
    if (!client || !session || !joinCodeInput.trim()) return;
    setJoinCodeLoading(true);
    setJoinCodeError(null);
    setJoinCodeSuccess(false);
    try {
      await redeemInvite(client, joinCodeInput.trim());
      setJoinCodeSuccess(true);
      setJoinCodeInput('');
      await refreshChannels();
      setTimeout(() => {
        setJoinCodeSuccess(false);
        setJoinModalOpen(false);
      }, 1500);
    } catch (e) {
      setJoinCodeError(getErrorMessage(e));
    } finally {
      setJoinCodeLoading(false);
    }
  }, [client, session, joinCodeInput, refreshChannels]);

  // Not configured state
  if (!isEnabled) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
            <UsersIcon size={32} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Team</h1>
            <p className="text-text-muted">
              Connect with your team through channels and direct messages.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-600 dark:text-amber-400">
            <p className="font-medium mb-1">Configuration Required</p>
            <p className="text-xs opacity-80">
              Missing: {missingKeys.length ? missingKeys.join(', ') : 'Unknown'}
              {reason ? ` (${reason})` : ''}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Auth gate
  if (authReady && !session) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white">
              <UsersIcon size={28} />
            </div>
            <h2 className="text-xl font-semibold">Sign in to Team</h2>
            <p className="text-sm text-text-muted">
              Join channels and chat with your team
            </p>
          </div>
          
          <div className="flex rounded-lg bg-background-muted p-1">
            <button
              className={`flex-1 py-2 px-3 text-sm rounded-md transition-colors ${!usePasswordAuth ? 'bg-background-default shadow-sm font-medium' : 'text-text-muted hover:text-text-default'}`}
              onClick={() => setUsePasswordAuth(false)}
            >
              Magic Link
            </button>
            <button
              className={`flex-1 py-2 px-3 text-sm rounded-md transition-colors ${usePasswordAuth ? 'bg-background-default shadow-sm font-medium' : 'text-text-muted hover:text-text-default'}`}
              onClick={() => setUsePasswordAuth(true)}
            >
              Password
            </button>
          </div>

          <div className="space-y-4">
            <Input
              placeholder="Email"
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className="h-11"
            />
            
            {!usePasswordAuth ? (
              <>
                {!otpSent ? (
                  <Button
                    className="w-full h-11"
                    onClick={async () => {
                      if (!authEmail) return;
                      try {
                        await signInWithEmail(authEmail);
                        setOtpSent(true);
                      } catch (e) {
                        console.error('Sign-in error:', e);
                      }
                    }}
                  >
                    Send Magic Code
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs text-green-600 dark:text-green-400 text-center">
                      ✓ Code sent to {authEmail}
                    </div>
                    <Input
                      placeholder="Enter 6-digit code"
                      value={authCode}
                      onChange={(e) => setAuthCode(e.target.value)}
                      className="h-11 text-center tracking-widest"
                    />
                    <Button
                      className="w-full h-11"
                      disabled={!authCode}
                      onClick={async () => {
                        if (!authEmail || !authCode) return;
                        try {
                          await verifyEmailOtp(authEmail, authCode);
                        } catch (e) {
                          console.error('Verify error:', e);
                        }
                      }}
                    >
                      Verify Code
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                <Input
                  placeholder="Password"
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="h-11"
                />
                <div className="flex gap-2">
                  <Button
                    className="flex-1 h-11"
                    onClick={async () => {
                      if (!authEmail || !authPassword) return;
                      await signInWithPassword(authEmail, authPassword);
                    }}
                  >
                    Sign In
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 h-11"
                    onClick={async () => {
                      if (!authEmail || !authPassword) return;
                      await signUpWithPassword(authEmail, authPassword);
                    }}
                  >
                    Sign Up
                  </Button>
                </div>
              </>
            )}
          </div>

          {authError && (
            <div className="text-xs text-destructive p-3 rounded-lg border border-destructive/30 bg-destructive/10">
              {authError}
            </div>
          )}
        </div>
      </div>
    );
  }

  const publicChannels = channels.filter((c) => c.channel_type !== 'dm');
  const dmChannels = channels.filter((c) => c.channel_type === 'dm');

  return (
    <div className="relative w-full h-full flex flex-col lg:flex-row overflow-hidden pt-8">
      {/* Bell icon */}
      <button
        className="absolute right-2 top-[6px] z-[101] w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors no-drag"
        title="Notifications"
      >
        <img src={BellIcon} alt="Notifications" className="w-6 h-6 opacity-60 hover:opacity-100 transition-opacity" />
      </button>

      {/* Sidebar */}
      <aside className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-border/40 bg-background-default/60 backdrop-blur flex flex-col h-full">
        {/* Sidebar Header */}
        <div className="p-4 pt-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Team</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setJoinModalOpen(true)}
              title="Join channel"
              disabled={!session}
            >
              <LinkIcon size={16} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => {
                setModalChannelName('');
                setChannelModalOpen(true);
              }}
              title="Create channel"
              disabled={!supabaseEnabled || isLoadingChannels || !session}
            >
              <PlusIcon size={18} />
            </Button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-5">
          {/* Channels Section */}
          <div>
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wide">
              <HashIcon size={12} />
              <span>Channels</span>
              {isLoadingChannels && <span className="text-[10px] opacity-60">...</span>}
            </div>
            <div className="space-y-0.5">
              {publicChannels.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-background-muted flex items-center justify-center">
                    <HashIcon size={18} />
                  </div>
                  <p className="text-xs text-text-muted">No channels yet</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-xs h-7"
                    onClick={() => setChannelModalOpen(true)}
                    disabled={!session}
                  >
                    <PlusIcon size={14} />
                    <span className="ml-1">Create one</span>
                  </Button>
                </div>
              ) : (
                publicChannels.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => void selectChannel(c.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2.5 transition-colors ${
                      selectedChannelId === c.id
                        ? 'bg-primary/15 text-primary font-medium'
                        : 'hover:bg-background-muted text-text-default'
                    }`}
                  >
                    <HashIcon size={14} />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Direct Messages Section */}
          <div>
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wide">
              <MessageCircleIcon size={12} />
              <span>Direct Messages</span>
            </div>
            <div className="space-y-0.5">
              {dmChannels.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-background-muted flex items-center justify-center">
                    <MessageCircleIcon size={18} />
                  </div>
                  <p className="text-xs text-text-muted">No conversations</p>
                </div>
              ) : (
                dmChannels.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => void selectChannel(c.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2.5 transition-colors ${
                      selectedChannelId === c.id
                        ? 'bg-primary/15 text-primary font-medium'
                        : 'hover:bg-background-muted text-text-default'
                    }`}
                  >
                    <div className="w-5 h-5 rounded-full bg-background-muted flex items-center justify-center text-[10px] font-medium">
                      {c.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="truncate">{c.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* People Section */}
          {connectedUsers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wide">
                <UsersIcon size={12} />
                <span>People</span>
              </div>
              <div className="space-y-0.5">
                {connectedUsers.map((u) => (
                  <button
                    key={u.userId}
                    onClick={() => void createDm(u.userId)}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2.5 hover:bg-background-muted transition-colors"
                  >
                    <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                    </div>
                    <span className="truncate">{u.displayName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Footer */}
        {session && (
          <div className="p-3 border-t border-border/40">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium">
                {(session.user.email || 'U').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {profile?.display_name || session.user.email?.split('@')[0] || 'User'}
                </div>
                <div className="text-xs text-text-muted truncate">{session.user.email}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-text-muted hover:text-text-default"
                onClick={() => void signOut()}
                title="Sign out"
              >
                <LogOutIcon size={16} />
              </Button>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Channel Header */}
        <div className="border-b border-border/40 px-4 py-3 flex items-center justify-between bg-background-default/60 backdrop-blur shrink-0">
          <div className="flex items-center gap-3">
            {selectedChannelType === 'dm' ? (
              <div className="w-8 h-8 rounded-full bg-background-muted flex items-center justify-center">
                <UserIcon />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-background-muted flex items-center justify-center">
                <HashIcon size={16} />
              </div>
            )}
            <div>
              <h3 className="font-semibold">
                {selectedChannel?.name || 'Select a channel'}
              </h3>
              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
            </div>
          </div>
          {selectedChannel && selectedChannel.channel_type !== 'dm' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => {
                setInviteTargetEmail('');
                setGeneratedInviteLink(null);
                setInviteError(null);
                setInviteModalOpen(true);
              }}
            >
              <PlusIcon size={14} />
              <span>Invite</span>
            </Button>
          )}
        </div>

        {/* Messages Area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {messagesCursor && !isLoadingMessages && (
            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => void loadOlder()} className="text-xs">
                Load older messages
              </Button>
            </div>
          )}
          
          {isLoadingMessages && (
            <div className="flex justify-center py-8">
              <div className="text-sm text-text-muted">Loading...</div>
            </div>
          )}
          
          {!isLoadingMessages && messages.length === 0 && selectedChannel && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-background-muted flex items-center justify-center mb-4">
                <MessageCircleIcon size={28} />
              </div>
              <h4 className="font-medium mb-1">No messages yet</h4>
              <p className="text-sm text-text-muted">Be the first to say something!</p>
            </div>
          )}
          
          {!selectedChannel && !isLoadingMessages && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-4">
                <MasonryIcon />
              </div>
              <h4 className="font-medium mb-1">Welcome to Team</h4>
              <p className="text-sm text-text-muted">Select a channel or start a conversation</p>
            </div>
          )}
          
          {messages.map((m, idx) => {
            const prev = messages[idx - 1];
            const isSameAuthor =
              prev &&
              prev.user_id === m.user_id &&
              Math.abs(new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()) < 5 * 60 * 1000;
            const displayName =
              profiles[m.user_id]?.display_name ||
              profiles[m.user_id]?.email ||
              m.user_email ||
              m.user_id?.slice(0, 8);
            return (
              <div key={m.id} className="flex gap-3 px-2 py-1 rounded-lg hover:bg-background-muted/50 transition-colors">
                {!isSameAuthor ? (
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center text-xs font-medium shrink-0">
                    {(displayName || '??').slice(0, 2).toUpperCase()}
                  </div>
                ) : (
                  <div className="w-9 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  {!isSameAuthor && (
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="font-medium text-sm">{displayName}</span>
                      <span className="text-xs text-text-muted">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                  <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div className="p-4 shrink-0">
          <div className="border border-border/50 rounded-xl bg-background-default/80 p-2">
            <div className="flex items-center gap-2">
              <Input
                placeholder={selectedChannel ? `Message ${selectedChannel.channel_type === 'dm' ? '' : '#'}${selectedChannel.name}` : 'Select a channel'}
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && composerText.trim()) {
                    e.preventDefault();
                    void sendMessage(composerText);
                    setComposerText('');
                  }
                }}
                disabled={!selectedChannelId || !session}
                className="flex-1 border-0 bg-transparent focus-visible:ring-0 h-10"
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                disabled={!selectedChannelId || !composerText.trim() || !session}
                onClick={() => {
                  if (composerText.trim()) {
                    void sendMessage(composerText);
                    setComposerText('');
                  }
                }}
              >
                <SendIcon size={18} />
              </Button>
            </div>
            <div className="flex items-center gap-1 mt-1 text-text-muted">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Attach file">
                <AttachmentIcon />
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Create Channel Modal */}
      {channelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-background-default border border-border/50 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Create Channel</h3>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setChannelModalOpen(false)}>
                <XIcon size={16} />
              </Button>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-text-muted">Channel name</label>
              <Input
                autoFocus
                placeholder="general"
                value={modalChannelName}
                onChange={(e) => setModalChannelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && modalChannelName.trim()) {
                    void createChannel(modalChannelName.trim(), false);
                    setModalChannelName('');
                    setChannelModalOpen(false);
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setChannelModalOpen(false)}>Cancel</Button>
              <Button
                disabled={!modalChannelName.trim() || !session}
                onClick={() => {
                  if (!modalChannelName.trim()) return;
                  void createChannel(modalChannelName.trim(), false);
                  setModalChannelName('');
                  setChannelModalOpen(false);
                }}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Join Channel Modal */}
      {joinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-background-default border border-border/50 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Join Channel</h3>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setJoinModalOpen(false)}>
                <XIcon size={16} />
              </Button>
            </div>
            <p className="text-sm text-text-muted">
              Enter an invite code to join a channel.
            </p>
            <Input
              autoFocus
              placeholder="Paste invite code"
              value={joinCodeInput}
              onChange={(e) => {
                setJoinCodeInput(e.target.value);
                setJoinCodeError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && joinCodeInput.trim()) {
                  void handleJoinWithCode();
                }
              }}
            />
            {joinCodeSuccess && (
              <div className="text-sm text-green-600 dark:text-green-400 text-center">✓ Joined successfully!</div>
            )}
            {joinCodeError && (
              <div className="text-sm text-destructive">{joinCodeError}</div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setJoinModalOpen(false)}>Cancel</Button>
              <Button
                disabled={!joinCodeInput.trim() || joinCodeLoading}
                onClick={handleJoinWithCode}
              >
                {joinCodeLoading ? 'Joining...' : 'Join'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-background-default border border-border/50 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Invite to #{selectedChannel?.name}</h3>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setInviteModalOpen(false)}>
                <XIcon size={16} />
              </Button>
            </div>
            
            {!generatedInviteLink ? (
              <>
                <p className="text-sm text-text-muted">
                  Create an invite link. It expires in 7 days.
                </p>
                <div className="space-y-2">
                  <label className="text-sm text-text-muted">Restrict to email (optional)</label>
                  <Input
                    placeholder="anyone@example.com"
                    type="email"
                    value={inviteTargetEmail}
                    onChange={(e) => setInviteTargetEmail(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setInviteModalOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateInvite} disabled={inviteLoading}>
                    {inviteLoading ? 'Creating...' : 'Create Invite'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-background-muted rounded-lg p-4 text-center">
                  <div className="text-xs text-text-muted mb-1">Invite Code</div>
                  <div className="text-lg font-mono font-bold tracking-wider select-all">
                    {generatedInviteLink.split('invite=')[1] || ''}
                  </div>
                </div>
                <Button 
                  className="w-full"
                  variant={inviteCopied ? 'outline' : 'default'}
                  onClick={() => {
                    const code = generatedInviteLink.split('invite=')[1] || '';
                    void navigator.clipboard.writeText(code);
                    setInviteCopied(true);
                    setTimeout(() => setInviteCopied(false), 2000);
                  }}
                >
                  {inviteCopied ? '✓ Copied!' : 'Copy Code'}
                </Button>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setInviteModalOpen(false)}>Done</Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setGeneratedInviteLink(null);
                      setInviteTargetEmail('');
                    }}
                  >
                    Create Another
                  </Button>
                </div>
              </>
            )}
            
            {inviteError && (
              <div className="text-sm text-destructive">{inviteError}</div>
            )}
          </div>
        </div>
      )}

      {/* Toast for invite status */}
      {inviteStatus && (
        <div className="fixed bottom-4 right-4 z-50 bg-background-default border border-border/50 rounded-lg shadow-lg px-4 py-3 text-sm animate-in slide-in-from-bottom-2">
          {inviteStatus}
        </div>
      )}
    </div>
  );
}
