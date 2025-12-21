import { NavigateFunction } from 'react-router-dom';

export type View =
  | 'welcome'
  | 'chat'
  | 'hub'
  | 'pair'
  | 'tabs'
  | 'settings'
  | 'agent-studio'
  | 'extensions'
  | 'moreModels'
  | 'configureProviders'
  | 'configPage'
  | 'ConfigureProviders'
  | 'settingsV2'
  | 'sessions'
  | 'schedules'
  | 'team'
  | 'sharedSession'
  | 'loading'
  | 'recipeEditor'
  | 'recipes'
  | 'permission';

// TODO(Douwe): check these for usage, especially key: string for resetChat
export type ViewOptions = {
  extensionId?: string;
  showEnvVars?: boolean;
  deepLinkConfig?: unknown;
  sessionDetails?: unknown;
  error?: string;
  baseUrl?: string;
  config?: unknown;
  parentView?: View;
  parentViewOptions?: ViewOptions;
  disableAnimation?: boolean;
  initialMessage?: string;
  resetChat?: boolean;
  shareToken?: string;
  section?: string;
  // Matrix chat options
  matrixRoomId?: string;
  matrixRecipientId?: string;
  matrixMode?: boolean;
  useRegularChat?: boolean;
};

export const createNavigationHandler = (navigate: NavigateFunction) => {
  return (view: View, options?: ViewOptions) => {
    switch (view) {
      case 'chat':
        navigate('/', { state: options });
        break;
      case 'hub':
        navigate('/hub', { state: options });
        break;
      case 'pair':
        navigate('/pair', { state: options });
        break;
      case 'tabs':
        navigate('/tabs', { state: options });
        break;
      case 'settings':
        // Always open Customize in a separate Preferences window.
        try {
          const cfg = window?.electron?.getConfig?.() as Record<string, unknown> | undefined;
          const isSettingsWindow = Boolean(cfg && cfg['SETTINGS_WINDOW']);
          // If we're already in a dedicated settings window, navigate in-place.
          if (isSettingsWindow) {
            navigate('/settings', { state: options });
            break;
          }
          // Otherwise open as a separate Electron window.
          if (typeof window?.electron?.createPreferencesWindow === 'function') {
            void window.electron.createPreferencesWindow({ section: options?.section });
            break;
          }
        } catch {
          // fall back to in-window navigation (shouldn't normally happen)
        }
        navigate('/settings', { state: options });
        break;
      case 'agent-studio':
        navigate('/agent-studio', { state: options });
        break;
      case 'sessions':
        navigate('/sessions', { state: options });
        break;
      case 'schedules':
        navigate('/schedules', { state: options });
        break;
      case 'team':
        navigate('/team', { state: options });
        break;
      case 'recipes':
        navigate('/recipes', { state: options });
        break;
      case 'permission':
        navigate('/permission', { state: options });
        break;
      case 'ConfigureProviders':
        navigate('/configure-providers', { state: options });
        break;
      case 'sharedSession':
        navigate('/shared-session', { state: options });
        break;
      case 'recipeEditor':
        navigate('/recipe-editor', { state: options });
        break;
      case 'welcome':
        navigate('/welcome', { state: options });
        break;
      case 'extensions':
        navigate('/extensions', { state: options });
        break;
      default:
        navigate('/', { state: options });
    }
  };
};
