import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import type { SupabaseClient, Session, User } from '@supabase/supabase-js';
import { bootstrapSupabase, SupabaseBootstrap } from '../services/supabaseClient';
import type { TeamProfile } from '../types/team';

export interface SupabaseContextValue {
  client: SupabaseClient | null;
  isEnabled: boolean;
  missingKeys: string[];
  reason?: string;
  session: Session | null;
  user: User | null;
  profile: TeamProfile | null;
  authReady: boolean;
  authError?: string;
  signInWithEmail: (email: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const defaultValue: SupabaseContextValue = {
  client: null,
  isEnabled: false,
  missingKeys: [],
  reason: 'Supabase not configured',
  session: null,
  user: null,
  profile: null,
  authReady: false,
  authError: undefined,
  signInWithEmail: async () => {},
  signInWithPassword: async () => {},
  signUpWithPassword: async () => {},
  verifyEmailOtp: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
};

const SupabaseContext = createContext<SupabaseContextValue>(defaultValue);

export const SupabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const bootstrap: SupabaseBootstrap = useMemo(() => bootstrapSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<TeamProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | undefined>(undefined);
  const client = bootstrap.isEnabled ? bootstrap.client : null;

  const refreshProfile = useCallback(async () => {
    if (!client || !session?.user) return;
    const { data, error } = await client
      .from('profiles')
      .select('user_id, email, display_name, avatar_url')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error) {
      setAuthError(error.message);
      return;
    }
    if (data) {
      setProfile({
        id: data.user_id,
        user_id: data.user_id,
        email: data.email ?? undefined,
        display_name: data.display_name ?? undefined,
      });
    }
  }, [client, session?.user]);

  useEffect(() => {
    if (!client) return;
    let mounted = true;
    const init = async () => {
      const { data, error } = await client.auth.getSession();
      if (!mounted) return;
      if (error) {
        setAuthError(error.message);
      }
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    };
    void init();
    const {
      data: authListener,
    } = client.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (!newSession) {
        setProfile(null);
      }
    });
    return () => {
      mounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (session?.user) {
      void refreshProfile();
    }
  }, [session?.user, refreshProfile]);

  const signInWithEmail = useCallback(
    async (email: string) => {
      if (!client) {
        setAuthError('Supabase not configured');
        return;
      }
      setAuthError(undefined);
      const { error } = await client.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        },
      });
      if (error) {
        setAuthError(error.message);
      }
    },
    [client]
  );

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!client) {
        setAuthError('Supabase not configured');
        return;
      }
      setAuthError(undefined);
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthError(error.message);
        return;
      }
      setSession(data.session);
      setUser(data.user);
    },
    [client]
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!client) {
        setAuthError('Supabase not configured');
        return;
      }
      setAuthError(undefined);
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) {
        setAuthError(error.message);
        return;
      }
      // Auto sign-in if email confirmation is disabled
      if (data.session) {
        setSession(data.session);
        setUser(data.user);
      }
    },
    [client]
  );

  const verifyEmailOtp = useCallback(
    async (email: string, token: string) => {
      if (!client) {
        setAuthError('Supabase not configured');
        return;
      }
      setAuthError(undefined);
      const { data, error } = await client.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      if (error) {
        setAuthError(error.message);
        return;
      }
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      await refreshProfile();
    },
    [client, refreshProfile]
  );

  const signOut = useCallback(async () => {
    if (!client) return;
    await client.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  }, [client]);

  const bootstrapReason = bootstrap.isEnabled ? undefined : bootstrap.reason;

  const value: SupabaseContextValue = useMemo(() => {
    if (bootstrap.isEnabled) {
      return {
        client,
        isEnabled: true,
        missingKeys: [],
        reason: undefined,
        session,
        user,
        profile,
        authReady,
        authError,
        signInWithEmail,
        signInWithPassword,
        signUpWithPassword,
        verifyEmailOtp,
        signOut,
        refreshProfile,
      };
    }
    return {
      client: null,
      isEnabled: false,
      missingKeys: bootstrap.missingKeys,
      reason: bootstrapReason,
      session: null,
      user: null,
      profile: null,
      authReady: true,
      authError,
      signInWithEmail: async () => {},
      signInWithPassword: async () => {},
      signUpWithPassword: async () => {},
      verifyEmailOtp: async () => {},
      signOut: async () => {},
      refreshProfile: async () => {},
    };
  }, [
    authError,
    authReady,
    bootstrap.isEnabled,
    bootstrap.missingKeys,
    bootstrapReason,
    client,
    profile,
    session,
    signInWithEmail,
    signInWithPassword,
    signUpWithPassword,
    signOut,
    user,
    verifyEmailOtp,
    refreshProfile,
  ]);

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
};

export const useSupabase = (): SupabaseContextValue => {
  return useContext(SupabaseContext);
};

