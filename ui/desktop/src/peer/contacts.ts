export interface PeerContact {
  deviceId: string;
  deviceName: string;
  publicKey?: string | null;
  lastSeenAt: number;
  fingerprint?: string;
  trusted?: boolean;
}

const STORAGE_KEY = 'goose-peer-contacts';

type ContactMap = Record<string, PeerContact>;

function readStore(): ContactMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as ContactMap;
    return parsed ?? {};
  } catch (error) {
    console.warn('[PeerContacts] failed to read store', error);
    return {};
  }
}

function writeStore(store: ContactMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.error('[PeerContacts] failed to persist store', error);
  }
}

export function listContacts(): PeerContact[] {
  return Object.values(readStore()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export function upsertContact(contact: Omit<PeerContact, 'lastSeenAt'> & { lastSeenAt?: number }) {
  const store = readStore();
  const existing = store[contact.deviceId];
  const payload: PeerContact = {
    deviceId: contact.deviceId,
    deviceName: contact.deviceName,
    publicKey: contact.publicKey ?? existing?.publicKey ?? null,
    lastSeenAt: contact.lastSeenAt ?? Date.now(),
    fingerprint: contact.fingerprint ?? existing?.fingerprint,
    trusted: contact.trusted ?? existing?.trusted ?? false,
  };
  store[contact.deviceId] = payload;
  writeStore(store);
}

export function setContactTrusted(deviceId: string, trusted: boolean) {
  const store = readStore();
  const existing = store[deviceId];
  if (existing) {
    existing.trusted = trusted;
    writeStore(store);
  }
}

export function removeContact(deviceId: string) {
  const store = readStore();
  if (store[deviceId]) {
    delete store[deviceId];
    writeStore(store);
  }
}

export function getContact(deviceId: string): PeerContact | undefined {
  const store = readStore();
  return store[deviceId];
}
