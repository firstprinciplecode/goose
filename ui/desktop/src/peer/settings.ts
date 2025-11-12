/* eslint-env browser */
/**
 * Peer connection settings storage
 */

const STORAGE_KEY = 'goose.peer.settings';

export interface TurnServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface PeerSettings {
  turnServers: TurnServerConfig[];
  useDefaultStun: boolean;
}

const DEFAULT_SETTINGS: PeerSettings = {
  turnServers: [],
  useDefaultStun: true, // Google's public STUN servers
};

export function loadSettings(): PeerSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as PeerSettings;
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (error) {
    console.warn('Failed to load peer settings:', error);
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: PeerSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save peer settings:', error);
  }
}

// eslint-disable-next-line no-undef
export function getIceServers(settings: PeerSettings): RTCIceServer[] {
  // eslint-disable-next-line no-undef
  const servers: RTCIceServer[] = [];

  if (settings.useDefaultStun) {
    servers.push({ urls: 'stun:stun.l.google.com:19302' });
    servers.push({ urls: 'stun:stun1.l.google.com:19302' });
  }

  for (const turn of settings.turnServers) {
    servers.push({
      urls: turn.urls,
      username: turn.username,
      credential: turn.credential,
    });
  }

  return servers;
}

// Aliases for compatibility
export const loadPeerSettings = loadSettings;
export const savePeerSettings = saveSettings;
export const buildIceServers = getIceServers;
