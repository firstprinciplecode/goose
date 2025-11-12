/**
 * Fingerprint verification for peer identity
 */

const STORAGE_KEY_PREFIX = 'goose.peer.fingerprint';

export interface FingerprintRecord {
  deviceId: string;
  deviceName: string;
  publicKey: string;
  fingerprint: string;
  verifiedAt: string;
  trustedAt?: string;
}

/**
 * Generate a visual fingerprint from a public key (simplified)
 */
export function generateFingerprint(publicKey: string): string {
  if (!publicKey) return '';
  // Simple hash-like fingerprint for display
  // In production, use proper crypto hashing
  const parts: string[] = [];
  for (let i = 0; i < Math.min(publicKey.length, 48); i += 4) {
    const chunk = publicKey.substring(i, i + 4);
    const code = chunk.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    parts.push((code % 256).toString(16).padStart(2, '0').toUpperCase());
  }
  return parts.join(':').substring(0, 47); // XX:XX:XX:XX:XX:XX format
}

/**
 * Get stored fingerprint for a device
 */
export function getStoredFingerprint(deviceId: string): FingerprintRecord | null {
  try {
    const key = `${STORAGE_KEY_PREFIX}.${deviceId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored) as FingerprintRecord;
    }
  } catch (error) {
    console.warn('Failed to load fingerprint:', error);
  }
  return null;
}

/**
 * Store a fingerprint for a device
 */
export function storeFingerprint(record: FingerprintRecord): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}.${record.deviceId}`;
    localStorage.setItem(key, JSON.stringify(record));
  } catch (error) {
    console.error('Failed to store fingerprint:', error);
  }
}

/**
 * Mark a fingerprint as trusted
 */
export function trustFingerprint(deviceId: string): void {
  const record = getStoredFingerprint(deviceId);
  if (record) {
    record.trustedAt = new Date().toISOString();
    storeFingerprint(record);
  }
}

/**
 * Check if a device's fingerprint matches the stored trusted one
 */
export function verifyFingerprint(
  deviceId: string,
  publicKey: string
): 'trusted' | 'changed' | 'new' {
  if (!publicKey) return 'new';

  const stored = getStoredFingerprint(deviceId);
  if (!stored) return 'new';

  const currentFingerprint = generateFingerprint(publicKey);
  if (stored.fingerprint === currentFingerprint) {
    return stored.trustedAt ? 'trusted' : 'new';
  }

  return 'changed';
}

/**
 * Remove a stored fingerprint
 */
export function removeFingerprint(deviceId: string): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}.${deviceId}`;
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Failed to remove fingerprint:', error);
  }
}
