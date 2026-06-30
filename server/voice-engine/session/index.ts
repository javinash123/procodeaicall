import type { CallSid, SessionId, CampaignId, UserId, Timestamp, Nullable } from '../types/index.js';

export enum SessionState {
  INITIALIZING = 'INITIALIZING',
  RINGING = 'RINGING',
  CONNECTED = 'CONNECTED',
  GREETING = 'GREETING',
  LISTENING = 'LISTENING',
  PROCESSING = 'PROCESSING',
  SPEAKING = 'SPEAKING',
  IDLE = 'IDLE',
  ENDING = 'ENDING',
  ENDED = 'ENDED',
  ERROR = 'ERROR',
}

export interface ConversationMessage {
  readonly role: 'assistant' | 'user' | 'system';
  readonly content: string;
  readonly timestamp: Timestamp;
}

export interface CampaignSnapshot {
  readonly campaignId: CampaignId;
  readonly name: string;
  readonly script: string;
  readonly voice: string;
  readonly callingHoursStart: string;
  readonly callingHoursEnd: string;
  readonly knowledgeBase: readonly string[];
}

export interface SerializableSessionState {
  readonly sessionId: SessionId;
  readonly callSid: CallSid;
  readonly campaignId: CampaignId;
  readonly userId: UserId;
  readonly state: SessionState;
  readonly conversationHistory: readonly ConversationMessage[];
  readonly campaignSnapshot: CampaignSnapshot;
  readonly startedAt: Timestamp;
  readonly lastActivityAt: Timestamp;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface TransientSessionState {
  readonly streamActive: boolean;
  readonly currentUtterance: Nullable<string>;
  readonly ttsBufferActive: boolean;
  readonly interruptionRequested: boolean;
  readonly pendingAudioChunks: number;
}

export interface VoiceSession {
  readonly serializable: SerializableSessionState;
  readonly transient: TransientSessionState;
}
