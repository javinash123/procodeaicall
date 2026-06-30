import type { CallSid, SessionId } from '../types/index.js';

export type TransportProtocol = 'websocket' | 'webhook';
export type TransportState = 'connecting' | 'connected' | 'disconnecting' | 'disconnected';

export interface TransportMessage {
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface TransportConnectionConfig {
  readonly protocol: TransportProtocol;
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly tlsEnabled: boolean;
  readonly timeoutMs: number;
  readonly maxReconnectAttempts: number;
  readonly reconnectBackoffMs: number;
}

export interface ITransport {
  readonly state: TransportState;
  readonly callSid: CallSid;
  readonly sessionId: SessionId;
  send(message: TransportMessage): Promise<void>;
  close(reason?: string): Promise<void>;
  onMessage(handler: (message: TransportMessage) => void): void;
  onClose(handler: (reason?: string) => void): void;
  onError(handler: (error: Error) => void): void;
}
