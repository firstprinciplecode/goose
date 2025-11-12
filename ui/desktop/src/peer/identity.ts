/* eslint-env browser */
const DEVICE_ID_KEY = 'goose-peer-device-id';
const DEVICE_NAME_KEY = 'goose-peer-device-name';

export interface LocalIdentity {
  deviceId: string;
  deviceName: string;
}

function generateDeviceId(): string {
  if (typeof window.crypto?.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `peer-${Math.random().toString(36).slice(2, 11)}`;
}

function defaultDeviceName(): string {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Mac')) {
    return 'My Mac';
  }
  if (userAgent.includes('Windows')) {
    return 'My PC';
  }
  return 'My Device';
}

export function loadIdentity(): LocalIdentity {
  let deviceId = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = generateDeviceId();
    window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  let deviceName = window.localStorage.getItem(DEVICE_NAME_KEY);
  if (!deviceName) {
    deviceName = defaultDeviceName();
    window.localStorage.setItem(DEVICE_NAME_KEY, deviceName);
  }

  return { deviceId, deviceName };
}

export function updateDeviceName(nextName: string): LocalIdentity {
  const trimmed = nextName.trim();
  if (!trimmed) {
    return loadIdentity();
  }
  const { deviceId } = loadIdentity();
  window.localStorage.setItem(DEVICE_NAME_KEY, trimmed);
  return { deviceId, deviceName: trimmed };
}
