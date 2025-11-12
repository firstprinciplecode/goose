import { ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { promises as fsPromises, constants as fsConstants } from 'node:fs';
import { Buffer } from 'node:buffer';
import type { WebContents } from 'electron';
import { loadNgrokConfig, updateNgrokConfig, type NgrokStoredConfig } from './utils/ngrokConfig';
import log from './utils/logger';
import { expandTilde } from './utils/pathUtils';

export type NgrokTunnelStatus = 'idle' | 'starting' | 'online' | 'stopping' | 'error';

export interface NgrokStatusPayload {
  status: NgrokTunnelStatus;
  publicUrl?: string;
  error?: string;
  pid?: number;
}

interface StartOptions {
  port: number;
  overrides?: Partial<NgrokStoredConfig>;
}

const STATUS_CHANNEL = 'peer-ngrok-status-updated';

class NgrokManager extends EventEmitter {
  private child: ChildProcess | null = null;
  private status: NgrokStatusPayload = { status: 'idle' };
  private stdoutBuffer = '';
  private subscribers = new Map<number, WebContents>();

  constructor() {
    super();
  }

  public getStatus(): NgrokStatusPayload {
    return { ...this.status };
  }

  public async start(options: StartOptions): Promise<NgrokStatusPayload> {
    if (this.child || this.status.status === 'starting' || this.status.status === 'online') {
      return this.getStatus();
    }

    const config = options.overrides ? updateNgrokConfig(options.overrides) : loadNgrokConfig();

    let binaryPath: string;
    try {
      binaryPath = await this.resolveBinary(config.binaryPath);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to resolve ngrok executable path';
      this.setStatus({ status: 'error', error: message, publicUrl: undefined, pid: undefined });
      return this.getStatus();
    }

    const args = ['http', options.port.toString(), '--log', 'stdout', '--log-format', 'json'];

    if (config.authToken && config.authToken.length > 0) {
      args.push('--authtoken', config.authToken);
    }

    try {
      log.info('[Ngrok] Starting tunnel', { binaryPath, args });
      const child = spawn(binaryPath, args, {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.child = child;
      this.stdoutBuffer = '';
      this.setStatus({
        status: 'starting',
        error: undefined,
        publicUrl: undefined,
        pid: child.pid ?? undefined,
      });

      child.stdout?.on('data', (chunk: Buffer) => {
        this.processStdout(chunk.toString());
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line.length > 0) {
          log.warn('[Ngrok] stderr:', line);
        }
      });

      child.on('error', (error) => {
        log.error('[Ngrok] process error', error);
        this.child = null;
        this.setStatus({
          status: 'error',
          error: error.message,
          publicUrl: undefined,
          pid: undefined,
        });
      });

      child.on('close', (code, signal) => {
        log.info('[Ngrok] process closed', { code, signal });
        this.child = null;
        if (this.status.status !== 'error') {
          this.setStatus({
            status: 'idle',
            publicUrl: undefined,
            error: undefined,
            pid: undefined,
          });
        }
      });

      return this.getStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start ngrok process';
      log.error('[Ngrok] Failed to spawn process', error);
      this.child = null;
      this.setStatus({ status: 'error', error: message, publicUrl: undefined, pid: undefined });
      return this.getStatus();
    }
  }

  public async stop(): Promise<NgrokStatusPayload> {
    if (!this.child) {
      if (this.status.status !== 'idle') {
        this.setStatus({ status: 'idle', publicUrl: undefined, error: undefined, pid: undefined });
      }
      return this.getStatus();
    }

    this.setStatus({ status: 'stopping' });

    return await new Promise<NgrokStatusPayload>((resolve) => {
      const child = this.child!;
      const handleClose = () => {
        this.child?.off('close', handleClose);
        this.child = null;
        this.setStatus({ status: 'idle', publicUrl: undefined, error: undefined, pid: undefined });
        resolve(this.getStatus());
      };

      child.once('close', handleClose);

      try {
        const killed = child.kill('SIGINT');
        if (!killed) {
          child.kill('SIGTERM');
        }
      } catch (error) {
        log.warn('[Ngrok] Failed to send signal to process', error);
      }

      setTimeout(() => {
        if (this.child) {
          try {
            this.child.kill('SIGKILL');
          } catch (error) {
            log.warn('[Ngrok] Failed to force kill process', error);
          }
        }
      }, 5_000);
    });
  }

  public async maybeAutoStart(port: number): Promise<void> {
    const config = loadNgrokConfig();
    if (config.autoStart && this.status.status === 'idle') {
      await this.start({ port });
    }
  }

  public registerSubscriber(contents: WebContents): void {
    const id = contents.id;
    if (this.subscribers.has(id)) {
      this.pushStatusTo(contents);
      return;
    }

    this.subscribers.set(id, contents);
    contents.once('destroyed', () => {
      this.subscribers.delete(id);
    });
    this.pushStatusTo(contents);
  }

  public unregisterSubscriber(contents: WebContents): void {
    this.subscribers.delete(contents.id);
  }

  private setStatus(update: Partial<NgrokStatusPayload>): void {
    this.status = { ...this.status, ...update };
    this.emit('status', this.getStatus());
    this.broadcast();
  }

  private broadcast(): void {
    for (const [id, contents] of this.subscribers.entries()) {
      if (contents.isDestroyed()) {
        this.subscribers.delete(id);
        continue;
      }
      this.pushStatusTo(contents);
    }
  }

  private pushStatusTo(contents: WebContents): void {
    try {
      contents.send(STATUS_CHANNEL, this.getStatus());
    } catch (error) {
      log.warn('[Ngrok] Failed to push status to renderer', error);
    }
  }

  private async resolveBinary(provided?: string): Promise<string> {
    if (provided && provided.trim().length > 0) {
      const expanded = expandTilde(provided.trim());
      try {
        await fsPromises.access(expanded, fsConstants.X_OK);
        return expanded;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`ngrok binary not executable at ${expanded}: ${reason}`);
      }
    }

    // Default to PATH lookup
    return 'ngrok';
  }

  private processStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      this.handleStdoutLine(line.trim());
    }
  }

  private handleStdoutLine(line: string): void {
    if (line.length === 0) {
      return;
    }

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // ignore parse errors, fall back to logfmt extraction
    }

    if (parsed) {
      this.handleParsedLog(parsed);
    } else {
      this.handleRawLog(line);
    }
  }

  private handleParsedLog(parsed: Record<string, unknown>): void {
    const level = typeof parsed.lvl === 'string' ? parsed.lvl : undefined;
    const msg = typeof parsed.msg === 'string' ? parsed.msg : undefined;
    const url = typeof parsed.url === 'string' ? parsed.url : undefined;

    if (url && url.startsWith('http')) {
      this.onTunnelReady(url);
      return;
    }

    if (level === 'eror' || level === 'error') {
      const errorMessage = msg ?? 'ngrok error';
      this.setStatus({
        status: 'error',
        error: errorMessage,
        publicUrl: undefined,
        pid: undefined,
      });
      this.stop().catch((error) => log.warn('[Ngrok] Failed to stop after error', error));
      return;
    }

    if (msg?.includes('session established')) {
      log.info('[Ngrok] session established');
      return;
    }
  }

  private handleRawLog(line: string): void {
    if (line.includes('url=')) {
      const match = line.match(/url=(https?:[^\s]+)/);
      if (match && match[1]) {
        this.onTunnelReady(match[1]);
        return;
      }
    }

    if (/lvl=(eror|error)/.test(line)) {
      this.setStatus({ status: 'error', error: line, publicUrl: undefined, pid: undefined });
      this.stop().catch((error) => log.warn('[Ngrok] Failed to stop after raw error', error));
    }
  }

  private onTunnelReady(url: string): void {
    const sanitizedUrl = url.trim();
    updateNgrokConfig({ lastPublicUrl: sanitizedUrl });
    this.setStatus({ status: 'online', publicUrl: sanitizedUrl, error: undefined });
  }
}

export const ngrokManager = new NgrokManager();
