import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useSupabase } from '../contexts/SupabaseContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useTeamData } from '../hooks/useTeamData';
import {
  AttachmentIcon,
  UserIcon,
  BotIcon,
  MasonryIcon,
} from './ui/icons';
import BellIcon from '../assets/bell.svg';
import { redeemInvite, createChannelInvite } from '../services/teamService';

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
  const [dmTarget, setDmTarget] = useState('');
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
  
  // Join with invite code state
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinCodeLoading, setJoinCodeLoading] = useState(false);
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);
  const [joinCodeSuccess, setJoinCodeSuccess] = useState(false);

  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId),
    [channels, selectedChannelId]
  );

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
      setInviteStatus('Invite accepted. Loading channels...');
      await refreshChannels();
      setInviteStatus('Invite accepted.');
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : String(e));
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
      // Build invite link - use the app's deep link format
      const baseUrl = window.location.origin + window.location.pathname;
      const link = `${baseUrl}#/team?invite=${invite.invite_token}`;
      setGeneratedInviteLink(link);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : String(e));
    } finally {
      setInviteLoading(false);
    }
  }, [client, selectedChannelId, session, inviteTargetEmail]);

  const handleCopyInvite = useCallback(() => {
    if (!generatedInviteLink) return;
    void navigator.clipboard.writeText(generatedInviteLink);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }, [generatedInviteLink]);

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
      // Clear success message after 3 seconds
      setTimeout(() => setJoinCodeSuccess(false), 3000);
    } catch (e) {
      setJoinCodeError(e instanceof Error ? e.message : String(e));
    } finally {
      setJoinCodeLoading(false);
    }
  }, [client, session, joinCodeInput, refreshChannels]);

  if (!isEnabled) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8">
        <div className="max-w-xl w-full text-center space-y-4">
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-text-muted">
            Team spaces are not configured yet. Add Supabase settings to enable channels and DMs.
          </p>
          <div className="text-sm text-text-muted">
            Missing: {missingKeys.length ? missingKeys.join(', ') : 'Unknown'} {reason ? `(${reason})` : ''}
          </div>
        </div>
      </div>
    );
  }

  if (authReady && !session) {
    // Inline auth gate to avoid re-mounting on state changes
    return (
      <div className="w-full h-full flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-4 border border-border/60 rounded-xl p-6 bg-background-default/80">
          <h2 className="text-xl font-semibold">Sign in to Team</h2>
          
          {/* Toggle between OTP and Password auth */}
          <div className="flex gap-2 text-sm">
            <button
              className={`px-3 py-1 rounded ${!usePasswordAuth ? 'bg-primary text-white' : 'bg-background-muted text-text-muted'}`}
              onClick={() => setUsePasswordAuth(false)}
            >
              Magic Code
            </button>
            <button
              className={`px-3 py-1 rounded ${usePasswordAuth ? 'bg-primary text-white' : 'bg-background-muted text-text-muted'}`}
              onClick={() => setUsePasswordAuth(true)}
            >
              Password
            </button>
          </div>

          {!usePasswordAuth ? (
            <>
              <p className="text-sm text-text-muted">
                Enter your email to receive a one-time code.
              </p>
              <div className="space-y-3">
                <Input
                  placeholder="you@example.com"
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
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
                    Send code
                  </Button>
                  <Input
                    placeholder="One-time code"
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    disabled={!otpSent}
                  />
                  <Button
                    variant="outline"
                    disabled={!otpSent || !authCode}
                    onClick={async () => {
                      if (!authEmail || !authCode) return;
                      try {
                        await verifyEmailOtp(authEmail, authCode);
                      } catch (e) {
                        console.error('Verify error:', e);
                      }
                    }}
                  >
                    Verify
                  </Button>
                </div>
              </div>
              {otpSent && !authError && (
                <div className="text-xs text-green-600 dark:text-green-400">
                  ✓ Code sent to {authEmail}. Check your inbox (and spam folder) for a 6-digit code.
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-text-muted">
                Sign in or create an account with email and password.
              </p>
              <div className="space-y-3">
                <Input
                  placeholder="you@example.com"
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
                <Input
                  placeholder="Password"
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      if (!authEmail || !authPassword) return;
                      await signInWithPassword(authEmail, authPassword);
                    }}
                  >
                    Sign in
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!authEmail || !authPassword) return;
                      await signUpWithPassword(authEmail, authPassword);
                    }}
                  >
                    Sign up
                  </Button>
                </div>
              </div>
            </>
          )}

          {authError && (
            <div className="text-xs text-destructive p-2 border border-destructive/30 rounded bg-destructive/10">
              <strong>Error:</strong> {authError}
            </div>
          )}
          <div className="text-[10px] text-text-muted/60 pt-2 border-t border-border/30">
            Tip: If emails aren't arriving, use password auth or check Supabase dashboard → Authentication settings.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col lg:flex-row border-border/50 overflow-hidden pt-8">
      {/* Notification icon to match chat layout */}
      <button
        className="absolute right-2 top-[6px] z-[101] w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors no-drag"
        title="Notifications"
      >
        <img
          src={BellIcon}
          alt="Notifications"
          className="w-6 h-6 opacity-60 hover:opacity-100 transition-opacity"
        />
      </button>

      <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-border/60 bg-background-default/80 backdrop-blur flex-shrink-0 h-full overflow-y-auto">
        <div className="p-4 pt-5 border-b border-border/60 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <BotIcon /> Team
            </h2>
            <p className="text-xs text-text-muted">Channels and DMs</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-full"
            disabled={!supabaseEnabled || isLoadingChannels || !session}
            onClick={() => {
              setModalChannelName('');
              setChannelModalOpen(true);
            }}
            title="New channel"
          >
            +
          </Button>
        </div>
        <div className="p-3">
          <div className="relative mb-3">
            <Input
              placeholder="Find or start a DM"
              className="pl-9 pr-3 text-sm"
              value={dmTarget}
              onChange={(e) => setDmTarget(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && dmTarget.trim()) {
                  void createDm(dmTarget.trim());
                  setDmTarget('');
                }
              }}
              disabled={!supabaseEnabled || isLoadingChannels || !session}
            />
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted text-xs">🔍</span>
          </div>
          <div className="space-y-4 text-sm text-text-muted">
            <div className="space-y-2">
              <div className="flex items-center justify-between font-semibold text-text-standard text-xs uppercase tracking-wide">
                <span>Channels</span>
                {isLoadingChannels && <span className="text-[10px] text-text-muted">Loading…</span>}
              </div>
              <div className="space-y-1">
                {channels.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-text-muted">
                    No channels yet. Create one to get started.
                  </div>
                )}
                {channels
                  .filter((c) => c.channel_type !== 'dm')
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => void selectChannel(c.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
                        selectedChannelId === c.id
                          ? 'bg-background-accent text-text-on-accent'
                          : 'hover:bg-background-medium text-text-default'
                      }`}
                    >
                      <span className="text-xs text-text-muted">#</span>
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between font-semibold text-text-standard text-xs uppercase tracking-wide">
                <span>Direct Messages</span>
              </div>
              <div className="space-y-1">
                {channels
                  .filter((c) => c.channel_type === 'dm')
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => void selectChannel(c.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
                        selectedChannelId === c.id
                          ? 'bg-background-accent text-text-on-accent'
                          : 'hover:bg-background-medium text-text-default'
                      }`}
                    >
                      <UserIcon />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                {channels.filter((c) => c.channel_type === 'dm').length === 0 && (
                  <div className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-text-muted">
                    DMs will appear here once started.
                  </div>
                )}
              </div>
            </div>

            {/* Join with invite code section */}
            <div className="space-y-2 pt-4 border-t border-border/40">
              <div className="font-semibold text-text-standard text-xs uppercase tracking-wide">
                Join a Channel
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter invite code"
                    className="text-xs h-8"
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
                    disabled={!session || joinCodeLoading}
                  />
                  <Button
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={handleJoinWithCode}
                    disabled={!session || !joinCodeInput.trim() || joinCodeLoading}
                  >
                    {joinCodeLoading ? '...' : 'Join'}
                  </Button>
                </div>
                {joinCodeSuccess && (
                  <div className="text-xs text-green-600 dark:text-green-400">
                    ✓ Successfully joined channel!
                  </div>
                )}
                {joinCodeError && (
                  <div className="text-xs text-destructive">
                    {joinCodeError}
                  </div>
                )}
                <p className="text-[10px] text-text-muted">
                  Got an invite code? Paste it here to join.
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border/60 px-4 pt-5 pb-4 flex items-center justify-between bg-background-default/70 backdrop-blur">
          <div className="space-y-1">
            <h3 className="text-base font-semibold flex items-center gap-2">
              {selectedChannelType === 'dm' ? <UserIcon /> : <MasonryIcon />}
              {selectedChannel
                ? selectedChannel.channel_type === 'dm'
                  ? selectedChannel.name
                  : `# ${selectedChannel.name}`
                : 'Select a channel or DM'}
            </h3>
            <p className="text-xs text-text-muted">
              {error ? 'An error occurred. See details below.' : 'Real-time messages backed by Supabase.'}
            </p>
            {error && (
              <div className="mt-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive max-w-md">
                {error}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedChannel && selectedChannel.channel_type !== 'dm' && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => {
                  setInviteTargetEmail('');
                  setGeneratedInviteLink(null);
                  setInviteError(null);
                  setInviteModalOpen(true);
                }}
              >
                Invite
              </Button>
            )}
            {session && (
              <div className="text-xs text-text-muted flex items-center gap-2">
                {session.user.email}
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {!isLoadingMessages && messagesCursor && (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void loadOlder();
                  }}
                  disabled={!messagesCursor || isLoadingMessages}
                >
                  Load older
                </Button>
              </div>
            )}
            {isLoadingMessages && <div className="text-xs text-text-muted">Loading messages…</div>}
            {!isLoadingMessages && messages.length === 0 && (
              <div className="text-xs text-text-muted">No messages yet. Say hello!</div>
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
                m.user_id;
              return (
                <div
                  key={m.id}
                  className="flex gap-3 px-2 py-1 rounded-md hover:bg-background-medium/30 transition-colors"
                >
                  {!isSameAuthor ? (
                    <div className="h-9 w-9 rounded-full bg-background-muted flex items-center justify-center text-xs text-text-muted shrink-0">
                      {(displayName || '').slice(0, 2).toUpperCase()}
                    </div>
                  ) : (
                    <div className="h-9 w-9 shrink-0" />
                  )}
                  <div className="flex-1 space-y-1">
                    {!isSameAuthor && (
                      <div className="text-xs text-text-muted flex items-center gap-2">
                        <span className="font-semibold text-text-default">{displayName}</span>
                        <span>{new Date(m.created_at).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="text-sm text-text-default bg-background-muted rounded-md px-3 py-2 whitespace-pre-wrap">
                      {m.content}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-border/60 px-4 pb-6 pt-3 shrink-0 bg-background-default/70 backdrop-blur">
            <div className="w-full border border-border/50 rounded-2xl bg-background-default/80 px-3 py-2 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Input
                  placeholder={selectedChannelType === 'dm' ? 'Message @user' : 'Message #channel'}
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (composerText.trim()) {
                        void sendMessage(composerText);
                        setComposerText('');
                      }
                    }
                  }}
                disabled={!selectedChannelId || !supabaseEnabled || !session}
                  className="flex-1 bg-transparent border-0 focus-visible:ring-0 focus-visible:outline-none h-10"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-text-muted"
                  title="Send"
                  onClick={() => {
                    if (composerText.trim()) {
                      void sendMessage(composerText);
                      setComposerText('');
                    }
                  }}
                disabled={!selectedChannelId || !composerText.trim() || !supabaseEnabled || !session}
                >
                  ➜
                </Button>
              </div>
              <div className="flex items-center gap-1 text-text-muted">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Add">
                  +
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Formatting">
                  Aa
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Emoji">
                  😊
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Mention">
                  @
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Attach file">
                  <AttachmentIcon />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {channelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg bg-background-default border border-border/60 shadow-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Create a channel</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChannelModalOpen(false)}
              >
                Close
              </Button>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-text-muted">Channel name</label>
              <Input
                autoFocus
                placeholder="e.g. best-channel"
                value={modalChannelName}
                onChange={(e) => setModalChannelName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setChannelModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={!modalChannelName.trim() || !supabaseEnabled || isLoadingChannels || !session}
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

      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg bg-background-default border border-border/60 shadow-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Invite to #{selectedChannel?.name || 'channel'}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setInviteModalOpen(false)}
              >
                Close
              </Button>
            </div>
            
            {!generatedInviteLink ? (
              <>
                <p className="text-sm text-text-muted">
                  Create an invite link to share with others. They'll need to sign in to join.
                </p>
                <div className="space-y-2">
                  <label className="text-sm text-text-muted">Restrict to email (optional)</label>
                  <Input
                    placeholder="user@example.com (leave blank for anyone)"
                    type="email"
                    value={inviteTargetEmail}
                    onChange={(e) => setInviteTargetEmail(e.target.value)}
                  />
                  <p className="text-xs text-text-muted">
                    If set, only this email address can use the invite.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setInviteModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateInvite} disabled={inviteLoading}>
                    {inviteLoading ? 'Creating...' : 'Create Invite Link'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-text-muted">
                  Share this invite code with the person you want to invite. It expires in 7 days.
                </p>
                <div className="space-y-3">
                  {/* Invite Code - prominently displayed */}
                  <div className="bg-background-muted rounded-lg p-4 text-center">
                    <div className="text-xs text-text-muted mb-1">Invite Code</div>
                    <div className="text-lg font-mono font-bold tracking-wider select-all">
                      {generatedInviteLink?.split('invite=')[1] || ''}
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <Button 
                      onClick={() => {
                        const code = generatedInviteLink?.split('invite=')[1] || '';
                        void navigator.clipboard.writeText(code);
                        setInviteCopied(true);
                        setTimeout(() => setInviteCopied(false), 2000);
                      }} 
                      variant="outline" 
                      className="w-full"
                    >
                      {inviteCopied ? '✓ Copied!' : 'Copy Invite Code'}
                    </Button>
                  </div>
                  {inviteTargetEmail && (
                    <p className="text-xs text-text-muted text-center">
                      Restricted to: <span className="font-semibold">{inviteTargetEmail}</span>
                    </p>
                  )}
                  <div className="text-xs text-text-muted bg-background-muted/50 rounded p-3 space-y-1">
                    <div className="font-semibold">How to join:</div>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Open Goose app</li>
                      <li>Go to Team</li>
                      <li>Enter this code in "Join a Channel"</li>
                    </ol>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setInviteModalOpen(false)}>
                    Done
                  </Button>
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
              <div className="text-xs text-destructive p-2 border border-destructive/30 rounded bg-destructive/10">
                <strong>Error:</strong> {inviteError}
              </div>
            )}
          </div>
        </div>
      )}

      {inviteStatus && (
        <div className="fixed bottom-4 right-4 z-50 bg-background-default border border-border/60 rounded-lg shadow-lg px-4 py-3 text-sm">
          {inviteStatus}
        </div>
      )}
    </div>
  );
}
