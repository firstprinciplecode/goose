/* eslint-env browser */
/* eslint-disable no-undef */
import type { PeerInvitePayload } from '../preload';
import { loadSettings, getIceServers } from './settings';

export interface PeerIdentity {
  deviceId: string;
  deviceName: string;
  publicKey?: string | null;
}

export interface PeerReadyEvent {
  role: 'host' | 'guest';
  roomId: string;
  expiresAt: string;
  self: PeerIdentity;
  peer?: PeerIdentity | null;
}

export interface PeerClientOptions {
  role: 'host' | 'guest';
  roomId: string;
  wsToken: string;
  signalingBaseUrl: string;
  iceServers?: RTCIceServer[];
  invite?: PeerInvitePayload;
}

interface PeerClientEventMap {
  ready: PeerReadyEvent;
  connected: void;
  disconnected: void;
  message: string;
  error: Error;
  state: RTCPeerConnectionState;
  peerInfo: PeerIdentity | null;
}

type EventKey = keyof PeerClientEventMap;
type EventHandler<K extends EventKey> = (payload: PeerClientEventMap[K]) => void;

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class GoosePeerClient {
  private ws?: WebSocket;
  private pc?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private events = new Map<EventKey, Set<EventHandler<EventKey>>>();
  private closed = false;
  private peerInfo: PeerIdentity | null = null;
  private readonly options: PeerClientOptions;

  constructor(options: PeerClientOptions) {
    this.options = options;
  }

  on<K extends EventKey>(event: K, handler: EventHandler<K>): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.events.get(event) as Set<EventHandler<EventKey>>).add(handler as any);
    return () => this.off(event, handler);
  }

  off<K extends EventKey>(event: K, handler: EventHandler<K>) {
    const set = this.events.get(event);
    if (set) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set.delete(handler as any);
    }
  }

  private emit<K extends EventKey>(event: K, payload: PeerClientEventMap[K]) {
    const set = this.events.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (handler as any)(payload);
      } catch (error) {
        console.error('[Peer] handler error', error);
      }
    }
  }

  async connect(): Promise<void> {
    if (this.ws || this.closed) return;

    const wsUrl = this.buildWsUrl();
    this.ws = new WebSocket(wsUrl);

    this.ws.addEventListener('open', () => {
      console.info('[Peer] signaling socket connected');
    });

    this.ws.addEventListener('message', (event) => {
      try {
        this.handleSignalingMessage(event.data);
      } catch (error) {
        console.error('[Peer] signaling parse error', error);
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
      }
    });

    this.ws.addEventListener('close', () => {
      console.info('[Peer] signaling socket closed');
      this.emit('disconnected', undefined);
      this.close();
    });

    this.ws.addEventListener('error', (event) => {
      console.error('[Peer] signaling error', event);
      this.emit('error', new Error('Signaling connection failed'));
    });
  }

  sendMessage(text: string) {
    if (!this.channel || this.channel.readyState !== 'open') {
      throw new Error('Peer channel is not ready');
    }
    this.channel.send(text);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.channel?.close();
    } catch {
      /* noop */
    }
    try {
      this.pc?.close();
    } catch {
      /* noop */
    }
    this.ws?.close();
    this.events.clear();
  }

  getPeerInfo(): PeerIdentity | null {
    return this.peerInfo;
  }

  private buildWsUrl(): string {
    const httpUrl = new URL(this.options.signalingBaseUrl);
    httpUrl.pathname = `/peer/ws/${this.options.roomId}`;
    httpUrl.searchParams.set('token', this.options.wsToken);
    httpUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return httpUrl.toString();
  }

  private ensurePeerConnection() {
    if (this.pc) {
      return;
    }

    // Use provided ICE servers, or load from settings, or fall back to defaults
    let iceServers: RTCIceServer[] = DEFAULT_ICE;
    if (this.options.iceServers && this.options.iceServers.length > 0) {
      iceServers = this.options.iceServers;
    } else {
      const settings = loadSettings();
      iceServers = getIceServers(settings);
    }

    const rtc = new RTCPeerConnection({ iceServers });

    rtc.onconnectionstatechange = () => {
      this.emit('state', rtc.connectionState);
      if (rtc.connectionState === 'connected') {
        this.emit('connected', undefined);
      } else if (rtc.connectionState === 'disconnected' || rtc.connectionState === 'failed') {
        this.emit('disconnected', undefined);
      }
    };

    rtc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          candidate: event.candidate.toJSON(),
        });
      }
    };

    if (this.options.role === 'guest') {
      rtc.ondatachannel = (event) => {
        this.attachDataChannel(event.channel);
      };
    } else {
      this.attachDataChannel(rtc.createDataChannel('goose-peer'));
    }

    this.pc = rtc;
  }

  private attachDataChannel(channel: RTCDataChannel) {
    this.channel = channel;
    channel.onopen = () => {
      console.info('[Peer] data channel open');
    };
    channel.onclose = () => {
      console.info('[Peer] data channel closed');
      this.emit('disconnected', undefined);
    };
    channel.onerror = (event) => {
      console.error('[Peer] data channel error', event);
      this.emit('error', new Error('Peer data channel error'));
    };
    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this.emit('message', event.data);
      }
    };
  }

  private handleSignalingMessage(raw: unknown) {
    if (typeof raw !== 'string') {
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      console.warn('[Peer] ignoring non-JSON signaling message');
      return;
    }

    if (!message || typeof message !== 'object') {
      return;
    }

    const { type } = message as { type: string };
    switch (type) {
      case 'peer.ready':
        this.handlePeerReady(message as PeerReadySignal);
        break;
      case 'peer.disconnected':
        this.emit('disconnected', undefined);
        break;
      case 'peer.error':
        this.emit('error', new Error((message as { reason?: string }).reason ?? 'Peer error'));
        break;
      case 'signal':
        this.handlePeerSignal((message as PeerSignalMessage).payload);
        break;
      default:
        console.debug('[Peer] unknown signaling message', message);
    }
  }

  private async handlePeerReady(message: PeerReadySignal) {
    this.ensurePeerConnection();
    this.peerInfo = message.peer
      ? {
          deviceId: message.peer.deviceId,
          deviceName: message.peer.deviceName,
          publicKey: message.peer.publicKey ?? undefined,
        }
      : null;

    this.emit('peerInfo', this.peerInfo);

    const readyEvent: PeerReadyEvent = {
      role: message.role,
      roomId: message.roomId,
      expiresAt: message.expiresAt,
      self: {
        deviceId: message.self.deviceId,
        deviceName: message.self.deviceName,
        publicKey: message.self.publicKey ?? undefined,
      },
      peer: this.peerInfo ?? undefined,
    };
    this.emit('ready', readyEvent);

    if (!this.pc) {
      throw new Error('Peer connection missing after ready');
    }

    if (this.options.role === 'host') {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.sendSignal({
        sdp: offer,
      });
    }
  }

  private async handlePeerSignal(payload: PeerSignalPayload) {
    this.ensurePeerConnection();
    if (!this.pc) {
      throw new Error('Peer connection not initialized');
    }

    if (payload.sdp) {
      const desc = new RTCSessionDescription(payload.sdp);
      if (payload.sdp.type === 'offer') {
        await this.pc.setRemoteDescription(desc);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.sendSignal({
          sdp: answer,
        });
      } else {
        await this.pc.setRemoteDescription(desc);
      }
    }

    if (payload.candidate) {
      try {
        await this.pc.addIceCandidate(payload.candidate);
      } catch (error) {
        console.error('[Peer] failed to add ICE candidate', error);
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  private sendSignal(payload: PeerSignalPayload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Signaling channel is not open');
    }
    this.ws.send(
      JSON.stringify({
        type: 'signal',
        payload,
      })
    );
  }
}

interface PeerReadySignal {
  type: 'peer.ready';
  role: 'host' | 'guest';
  roomId: string;
  expiresAt: string;
  self: {
    deviceId: string;
    deviceName: string;
    publicKey?: string | null;
  };
  peer?: {
    deviceId: string;
    deviceName: string;
    publicKey?: string | null;
  } | null;
}

interface PeerSignalMessage {
  type: 'signal';
  payload: PeerSignalPayload;
}

interface PeerSignalPayload {
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export function createPeerClient(options: PeerClientOptions): GoosePeerClient {
  const client = new GoosePeerClient(options);
  void client.connect();
  return client;
}
