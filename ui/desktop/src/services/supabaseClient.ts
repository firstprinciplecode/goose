import { createClient, SupabaseClient } from '@supabase/supabase-js';

type SupabaseConfig = {
  url?: string;
  anonKey?: string;
};

export type SupabaseBootstrap =
  | { client: SupabaseClient; isEnabled: true; missingKeys: string[] }
  | { client: null; isEnabled: false; missingKeys: string[]; reason: string };

const cached: { client: SupabaseClient | null } = { client: null };

const readConfig = (): SupabaseConfig => {
  try {
    const cfg = window.electron?.getConfig?.() as Record<string, unknown> | undefined;
    return {
      url: (cfg?.SUPABASE_URL as string) || (cfg?.VITE_SUPABASE_URL as string),
      anonKey: (cfg?.SUPABASE_ANON_KEY as string) || (cfg?.VITE_SUPABASE_ANON_KEY as string),
    };
  } catch {
    return {};
  }
};

export const bootstrapSupabase = (): SupabaseBootstrap => {
  if (cached.client) {
    return { client: cached.client, isEnabled: true, missingKeys: [] };
  }

  const { url, anonKey } = readConfig();
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/0a2a2409-8cfb-47ff-93e1-46a51d405d03',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      sessionId:'debug-session',
      runId:'pre-fix',
      hypothesisId:'B',
      location:'supabaseClient.ts:bootstrapSupabase',
      message:'Read Supabase config',
      data:{urlPresent:Boolean(url), anonPresent:Boolean(anonKey)},
      timestamp:Date.now()
    })
  }).catch(()=>{});
  // #endregion
  const missingKeys: string[] = [];
  if (!url) missingKeys.push('SUPABASE_URL');
  if (!anonKey) missingKeys.push('SUPABASE_ANON_KEY');

  if (missingKeys.length > 0) {
    return {
      client: null,
      isEnabled: false,
      missingKeys,
      reason: 'Supabase environment variables are not configured.',
    };
  }

  const client = createClient(url!, anonKey!);
  cached.client = client;
  return { client, isEnabled: true, missingKeys: [] };
};

