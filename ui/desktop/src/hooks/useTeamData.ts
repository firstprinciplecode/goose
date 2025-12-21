import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { TeamChannel, TeamMessage } from '../types/team';
import {
  listChannels,
  listMessages,
  createChannel,
  createDmChannel,
  sendMessage,
  subscribeToMessages,
  ensureProfile,
  TeamUserIdentity,
  fetchProfilesByUserIds,
  addChannelMember,
} from '../services/teamService';

// Helper to extract error message from various error types
const getErrorMessage = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null) {
    const obj = e as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
    if (typeof obj.error_description === 'string') return obj.error_description;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
};

export type UseTeamDataState = {
  channels: TeamChannel[];
  messages: TeamMessage[];
  profiles: Record<string, { display_name?: string; email?: string }>;
  selectedChannelId: string | null;
  selectedChannelType: 'channel' | 'dm' | null;
  isLoadingChannels: boolean;
  isLoadingMessages: boolean;
  messagesCursor: string | null;
  error?: string;
};

export const useTeamData = (identity: TeamUserIdentity | null) => {
  const { client, isEnabled, missingKeys, reason, session } = useSupabase();
  const [channels, setChannels] = useState<TeamChannel[]>([]);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { display_name?: string; email?: string }>>({});
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedChannelType, setSelectedChannelType] = useState<'channel' | 'dm' | null>(null);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesCursor, setMessagesCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  const disabledReason = useMemo(() => {
    if (isEnabled) return undefined;
    return reason || `Supabase not configured (${missingKeys.join(', ') || 'missing keys'})`;
  }, [isEnabled, missingKeys, reason]);

  const loadChannels = useCallback(async () => {
    if (!client || !session || !identity?.userId) {
      setChannels([]);
      setSelectedChannelId(null);
      setSelectedChannelType(null);
      return;
    }
    setIsLoadingChannels(true);
    setError(undefined);
    try {
      const data = await listChannels(client);
      setChannels(data);
      if (!selectedChannelId && data.length > 0) {
        setSelectedChannelId(data[0].id);
        setSelectedChannelType((data[0].channel_type as 'channel' | 'dm') || 'channel');
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsLoadingChannels(false);
    }
  }, [client, identity?.userId, selectedChannelId, session]);

  const loadMessages = useCallback(
    async (channelId: string, before?: string) => {
      if (!client) return;
      setIsLoadingMessages(true);
      setError(undefined);
      try {
        const data = await listMessages(client, channelId, { before });
        if (before) {
          setMessages((prev) => [...data, ...prev]);
        } else {
          setMessages(data);
        }
        // pagination cursor: oldest message timestamp if we got a full page
        const oldest = data.length ? data[0].created_at : null;
        if (data.length > 0) {
          setMessagesCursor(oldest || null);
        }
        // fetch profiles for senders
        const userIds = Array.from(new Set(data.map((m) => m.user_id)));
        if (userIds.length) {
          const profMap = await fetchProfilesByUserIds(client, userIds);
          setProfiles((prev) => ({ ...prev, ...profMap }));
        }
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [client]
  );

  const handleSelectChannel = useCallback(
    async (channelId: string) => {
      const chan = channels.find((c) => c.id === channelId);
      setSelectedChannelId(channelId);
      setSelectedChannelType((chan?.channel_type as 'channel' | 'dm') || 'channel');
      setMessagesCursor(null);
      await loadMessages(channelId);
    },
    [channels, loadMessages]
  );

  const handleCreateChannel = useCallback(
    async (name: string, isPrivate: boolean) => {
      if (!client || !session?.user?.id) {
        setError('Not authenticated');
        return;
      }
      try {
        // Use session.user.id (auth.uid()) for created_by to match RLS policy
        const created = await createChannel(client, name, isPrivate, session.user.id, 'channel');
        // Add creator as owner (since trigger is disabled)
        await addChannelMember(client, created.id, session.user.id, 'owner');
        setChannels((prev) => [...prev, created]);
        setSelectedChannelId(created.id);
        setSelectedChannelType('channel');
        setMessagesCursor(null);
        await loadMessages(created.id);
      } catch (e) {
        setError(getErrorMessage(e));
      }
    },
    [client, session?.user?.id, loadMessages]
  );

  const handleCreateDm = useCallback(
    async (targetUserId: string) => {
      if (!client || !session?.user?.id) return;
      if (!targetUserId.trim()) return;
      try {
        const created = await createDmChannel(client, targetUserId.trim(), session.user.id);
        // Add both users to DM channel
        await addChannelMember(client, created.id, session.user.id, 'owner');
        await addChannelMember(client, created.id, targetUserId.trim(), 'member');
        setChannels((prev) => [...prev, created]);
        setSelectedChannelId(created.id);
        setSelectedChannelType('dm');
        setMessagesCursor(null);
        await loadMessages(created.id);
      } catch (e) {
        setError(getErrorMessage(e));
      }
    },
    [client, session?.user?.id, loadMessages]
  );

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!client || !selectedChannelId || !session?.user?.id || !content.trim()) return;
      try {
        const msg = await sendMessage(
          client,
          selectedChannelId,
          content.trim(),
          session.user.id,
          session.user.email ?? undefined
        );
        setMessages((prev) => [...prev, msg]);
      } catch (e) {
        setError(getErrorMessage(e));
      }
    },
    [client, selectedChannelId, session?.user?.id, session?.user?.email]
  );

  const handleLoadOlder = useCallback(async () => {
    if (!client || !selectedChannelId || !messagesCursor) return;
    await loadMessages(selectedChannelId, messagesCursor);
  }, [client, selectedChannelId, messagesCursor, loadMessages]);

  // Initial profile sync + load channels
  useEffect(() => {
    if (!client || !isEnabled) return;
    (async () => {
      try {
        if (identity && session?.user) {
          await ensureProfile(client, identity);
        }
        await loadChannels();
      } catch (e) {
        setError(getErrorMessage(e));
      }
    })();
  }, [client, identity, isEnabled, loadChannels, session?.user]);

  // Realtime messages subscription
  useEffect(() => {
    if (!client || !selectedChannelId || !isEnabled) return;
    const sub = subscribeToMessages(client, selectedChannelId, (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });
    return () => {
      client.removeChannel(sub);
    };
  }, [client, selectedChannelId, isEnabled]);

  // Reset when session ends
  useEffect(() => {
    if (!session) {
      setChannels([]);
      setMessages([]);
      setProfiles({});
      setSelectedChannelId(null);
      setSelectedChannelType(null);
      setMessagesCursor(null);
    }
  }, [session]);

  return {
    state: {
      channels,
      messages,
      profiles,
      selectedChannelId,
      selectedChannelType,
      isLoadingChannels,
      isLoadingMessages,
      messagesCursor,
      error: disabledReason ?? error,
    },
    actions: {
      selectChannel: handleSelectChannel,
      createChannel: handleCreateChannel,
      createDm: handleCreateDm,
      sendMessage: handleSendMessage,
      loadOlder: handleLoadOlder,
      refreshChannels: loadChannels,
    },
    supabaseEnabled: isEnabled,
  };
};

