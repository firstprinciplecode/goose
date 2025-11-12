import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface NgrokStoredConfig {
  binaryPath?: string;
  authToken?: string;
  autoStart?: boolean;
  lastPublicUrl?: string;
}

const CONFIG_FILE = path.join(app.getPath('userData'), 'ngrok-config.json');

function sanitizeConfig(config: NgrokStoredConfig): NgrokStoredConfig {
  const sanitized: NgrokStoredConfig = {};

  if (config.binaryPath && config.binaryPath.trim().length > 0) {
    sanitized.binaryPath = config.binaryPath.trim();
  }

  if (config.authToken && config.authToken.trim().length > 0) {
    sanitized.authToken = config.authToken.trim();
  }

  if (typeof config.autoStart === 'boolean') {
    sanitized.autoStart = config.autoStart;
  }

  if (config.lastPublicUrl && config.lastPublicUrl.trim().length > 0) {
    sanitized.lastPublicUrl = config.lastPublicUrl.trim();
  }

  return sanitized;
}

export function loadNgrokConfig(): NgrokStoredConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const contents = fs.readFileSync(CONFIG_FILE, 'utf8');
      if (contents.trim().length === 0) {
        return {};
      }
      const parsed = JSON.parse(contents) as NgrokStoredConfig;
      return sanitizeConfig(parsed);
    }
  } catch (error) {
    console.error('[NgrokConfig] Failed to load config:', error);
  }
  return {};
}

export function saveNgrokConfig(config: NgrokStoredConfig): NgrokStoredConfig {
  const sanitized = sanitizeConfig(config);
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(sanitized, null, 2), { encoding: 'utf8' });
  } catch (error) {
    console.error('[NgrokConfig] Failed to save config:', error);
  }
  return sanitized;
}

export function updateNgrokConfig(partial: Partial<NgrokStoredConfig>): NgrokStoredConfig {
  const current = loadNgrokConfig();
  const merged: NgrokStoredConfig = {
    ...current,
    ...partial,
  };
  return saveNgrokConfig(merged);
}
