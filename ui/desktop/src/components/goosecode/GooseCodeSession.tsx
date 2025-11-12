import { useEffect, useState, useCallback } from 'react';
import { startAgent, resumeAgent } from '../../api';
import { GooseCodeState } from './GooseCodeContext';
import { buildGooseCodePrompt } from './utils/buildGooseCodePrompt';
import { useConfig } from '../ConfigContext';
import { initializeSystem } from '../../utils/providerUtils';

interface UseGooseCodeSessionOptions {
  ideState: GooseCodeState;
  enabled?: boolean;
}

interface SessionInfo {
  id: string;
  initialized: boolean;
}

export function useGooseCodeSession({ ideState, enabled = true }: UseGooseCodeSessionOptions) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { read, config } = useConfig();

  // Wait for config to be loaded before initializing
  const configReady = config && Object.keys(config).length > 0;

  const initializeSession = useCallback(async () => {
    if (!enabled || isInitializing || session?.initialized) return;

    // Wait for config to be ready
    if (!configReady) {
      console.log('GooseCode: Config not ready yet, waiting...');
      return;
    }

    setIsInitializing(true);
    setError(null);

    try {
      // Get provider and model from config (same as main app)
      const electronConfig = window.electron.getConfig();

      console.log('=== GooseCode Config Debug ===');
      console.log('Config object:', config);
      console.log('Config keys:', Object.keys(config));
      console.log('Electron config:', electronConfig);

      // Try to read provider and model
      const providerFromRead = await read('GOOSE_PROVIDER', false);
      const modelFromRead = await read('GOOSE_MODEL', false);

      console.log('Provider from read():', providerFromRead);
      console.log('Model from read():', modelFromRead);
      console.log('Default provider:', electronConfig.GOOSE_DEFAULT_PROVIDER);
      console.log('Default model:', electronConfig.GOOSE_DEFAULT_MODEL);

      const provider = providerFromRead ?? electronConfig.GOOSE_DEFAULT_PROVIDER;
      const model = modelFromRead ?? electronConfig.GOOSE_DEFAULT_MODEL;

      console.log('Final provider:', provider);
      console.log('Final model:', model);
      console.log('==============================');

      if (!provider || !model) {
        throw new Error(
          `Provider or model not configured.\n\n` +
            `Provider: ${provider || 'NOT SET'}\n` +
            `Model: ${model || 'NOT SET'}\n\n` +
            `Please configure your AI provider:\n` +
            `1. Click Settings in the left sidebar\n` +
            `2. Go to Providers section\n` +
            `3. Select and configure a provider (e.g., OpenAI, Anthropic)\n` +
            `4. Return to GooseCode and it will work automatically`
        );
      }

      console.log('GooseCode using provider:', provider, 'model:', model);

      // Build system prompt with current IDE state
      const ideContextInstructions = buildGooseCodePrompt(ideState);

      // Check if we have an existing session ID to resume
      const existingSessionId = localStorage.getItem('goosecode_session_id');

      let agentResponse;
      if (existingSessionId) {
        try {
          // Try to resume existing session
          agentResponse = await resumeAgent({
            body: {
              session_id: existingSessionId,
              load_model_and_extensions: false,
            },
            throwOnError: true,
          });
          console.log('Resumed GooseCode session:', existingSessionId);
        } catch (err) {
          console.warn('Failed to resume session, starting new one:', err);
          // If resume fails, start a new session
          agentResponse = null;
        }
      }

      // If no existing session or resume failed, start new session
      if (!agentResponse) {
        // Start agent with instructions only (no extensions in recipe)
        agentResponse = await startAgent({
          body: {
            working_dir: ideState.workingDir,
            recipe: {
              title: 'GooseCode IDE Assistant',
              description: 'AI assistant with full file system access for the GooseCode IDE',
              instructions: ideContextInstructions,
            },
          },
          throwOnError: true,
        });
        console.log('Started new GooseCode session');
      }

      const agentSession = agentResponse.data;
      if (!agentSession) {
        throw new Error('Failed to get session info');
      }

      // Store session ID
      localStorage.setItem('goosecode_session_id', agentSession.id);

      // Initialize the provider for this session
      console.log('GooseCode: Initializing provider for session...');
      await initializeSystem(agentSession.id, provider as string, model as string);
      console.log('GooseCode: Provider initialized successfully!');

      // Add developer extension to the session
      console.log('GooseCode: Adding developer extension...');
      const { getApiUrl } = await import('../../config');
      const addExtensionResponse = await fetch(getApiUrl('/extensions/add'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Secret-Key': await window.electron.getSecretKey(),
        },
        body: JSON.stringify({
          name: 'developer',
          type: 'builtin',
          session_id: agentSession.id,
        }),
      });

      if (!addExtensionResponse.ok) {
        throw new Error(`Failed to add developer extension: ${addExtensionResponse.statusText}`);
      }

      console.log('GooseCode: Developer extension added successfully!');

      setSession({
        id: agentSession.id,
        initialized: true,
      });

      // Update parent component with session ID
      if (ideState.sessionId !== agentSession.id) {
        // Session ID changed, parent should know
        console.log('GooseCode session ID:', agentSession.id);
      }
    } catch (err) {
      console.error('Failed to initialize GooseCode session:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize session');
    } finally {
      setIsInitializing(false);
    }
  }, [enabled, isInitializing, session, ideState, read, config, configReady]);

  // Initialize session when config is ready
  useEffect(() => {
    if (enabled && !session && !isInitializing && configReady) {
      console.log('GooseCode: Config ready, initializing session...');
      initializeSession();
    }
  }, [enabled, session, isInitializing, configReady, initializeSession]);

  const resetSession = useCallback(() => {
    localStorage.removeItem('goosecode_session_id');
    setSession(null);
    setError(null);
    // Will trigger re-initialization
  }, []);

  return {
    session,
    isInitializing,
    error,
    resetSession,
    initializeSession,
  };
}
