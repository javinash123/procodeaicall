import type { CallSid, SessionId, CampaignId, Timestamp, Nullable } from '../types/index.js';
import type { SessionState } from '../session/index.js';

export type VoiceEventType =
  | 'call.incoming'
  | 'call.connected'
  | 'call.ended'
  | 'call.failed'
  | 'session.created'
  | 'session.state_changed'
  | 'session.expired'
  | 'session.destroyed'
  | 'audio.chunk_received'
  | 'audio.silence_detected'
  | 'audio.utterance_started'
  | 'audio.utterance_ended'
  | 'stt.interim_result'
  | 'stt.final_result'
  | 'stt.error'
  | 'llm.request_started'
  | 'llm.stream_chunk'
  | 'llm.response_completed'
  | 'llm.error'
  | 'tts.synthesis_started'
  | 'tts.stream_chunk'
  | 'tts.synthesis_completed'
  | 'tts.error'
  | 'pipeline.turn_started'
  | 'pipeline.turn_completed'
  | 'pipeline.interrupted'
  | 'pipeline.error'
  | 'transport.connected'
  | 'transport.disconnected'
  | 'transport.error'
  | 'provider.health_changed'
  | 'provider.ping_failed';

interface BaseVoiceEvent {
  readonly timestamp: Timestamp;
  readonly sessionId: SessionId;
}

export interface CallIncomingEvent extends BaseVoiceEvent {
  readonly type: 'call.incoming';
  readonly callSid: CallSid;
  readonly campaignId: CampaignId;
  readonly callerNumber: string;
  readonly calleeNumber: string;
}

export interface CallConnectedEvent extends BaseVoiceEvent {
  readonly type: 'call.connected';
  readonly callSid: CallSid;
}

export interface CallEndedEvent extends BaseVoiceEvent {
  readonly type: 'call.ended';
  readonly callSid: CallSid;
  readonly durationMs: number;
  readonly reason: string;
}

export interface CallFailedEvent extends BaseVoiceEvent {
  readonly type: 'call.failed';
  readonly callSid: CallSid;
  readonly errorCode: string;
  readonly errorMessage: string;
}

export interface SessionCreatedEvent extends BaseVoiceEvent {
  readonly type: 'session.created';
  readonly campaignId: CampaignId;
}

export interface SessionStateChangedEvent extends BaseVoiceEvent {
  readonly type: 'session.state_changed';
  readonly previousState: SessionState;
  readonly newState: SessionState;
}

export interface SessionExpiredEvent extends BaseVoiceEvent {
  readonly type: 'session.expired';
}

export interface SessionDestroyedEvent extends BaseVoiceEvent {
  readonly type: 'session.destroyed';
  readonly reason: string;
}

export interface AudioChunkReceivedEvent extends BaseVoiceEvent {
  readonly type: 'audio.chunk_received';
  readonly sequenceNumber: number;
  readonly durationMs: number;
}

export interface AudioSilenceDetectedEvent extends BaseVoiceEvent {
  readonly type: 'audio.silence_detected';
  readonly silenceDurationMs: number;
}

export interface AudioUtteranceStartedEvent extends BaseVoiceEvent {
  readonly type: 'audio.utterance_started';
}

export interface AudioUtteranceEndedEvent extends BaseVoiceEvent {
  readonly type: 'audio.utterance_ended';
  readonly utteranceDurationMs: number;
}

export interface STTInterimResultEvent extends BaseVoiceEvent {
  readonly type: 'stt.interim_result';
  readonly transcript: string;
  readonly confidence: number;
}

export interface STTFinalResultEvent extends BaseVoiceEvent {
  readonly type: 'stt.final_result';
  readonly transcript: string;
  readonly confidence: number;
  readonly latencyMs: number;
}

export interface STTErrorEvent extends BaseVoiceEvent {
  readonly type: 'stt.error';
  readonly errorCode: string;
  readonly errorMessage: string;
}

export interface LLMRequestStartedEvent extends BaseVoiceEvent {
  readonly type: 'llm.request_started';
  readonly promptTokenEstimate: number;
}

export interface LLMStreamChunkEvent extends BaseVoiceEvent {
  readonly type: 'llm.stream_chunk';
  readonly delta: string;
  readonly chunkIndex: number;
}

export interface LLMResponseCompletedEvent extends BaseVoiceEvent {
  readonly type: 'llm.response_completed';
  readonly content: string;
  readonly totalTokens: number;
  readonly latencyMs: number;
}

export interface LLMErrorEvent extends BaseVoiceEvent {
  readonly type: 'llm.error';
  readonly errorCode: string;
  readonly errorMessage: string;
}

export interface TTSSynthesisStartedEvent extends BaseVoiceEvent {
  readonly type: 'tts.synthesis_started';
  readonly textLength: number;
  readonly voice: string;
}

export interface TTSStreamChunkEvent extends BaseVoiceEvent {
  readonly type: 'tts.stream_chunk';
  readonly sequenceNumber: number;
  readonly byteLength: number;
}

export interface TTSSynthesisCompletedEvent extends BaseVoiceEvent {
  readonly type: 'tts.synthesis_completed';
  readonly durationMs: number;
  readonly latencyMs: number;
}

export interface TTSErrorEvent extends BaseVoiceEvent {
  readonly type: 'tts.error';
  readonly errorCode: string;
  readonly errorMessage: string;
}

export interface PipelineTurnStartedEvent extends BaseVoiceEvent {
  readonly type: 'pipeline.turn_started';
  readonly turnIndex: number;
}

export interface PipelineTurnCompletedEvent extends BaseVoiceEvent {
  readonly type: 'pipeline.turn_completed';
  readonly turnIndex: number;
  readonly totalLatencyMs: number;
}

export interface PipelineInterruptedEvent extends BaseVoiceEvent {
  readonly type: 'pipeline.interrupted';
  readonly atStage: string;
}

export interface PipelineErrorEvent extends BaseVoiceEvent {
  readonly type: 'pipeline.error';
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly atStage: string;
}

export interface TransportConnectedEvent extends BaseVoiceEvent {
  readonly type: 'transport.connected';
  readonly protocol: string;
}

export interface TransportDisconnectedEvent extends BaseVoiceEvent {
  readonly type: 'transport.disconnected';
  readonly reason: Nullable<string>;
}

export interface TransportErrorEvent extends BaseVoiceEvent {
  readonly type: 'transport.error';
  readonly errorMessage: string;
}

export interface ProviderHealthChangedEvent extends BaseVoiceEvent {
  readonly type: 'provider.health_changed';
  readonly providerName: string;
  readonly previousStatus: string;
  readonly newStatus: string;
}

export interface ProviderPingFailedEvent extends BaseVoiceEvent {
  readonly type: 'provider.ping_failed';
  readonly providerName: string;
  readonly errorMessage: string;
  readonly attemptNumber: number;
}

export type VoiceEvent =
  | CallIncomingEvent
  | CallConnectedEvent
  | CallEndedEvent
  | CallFailedEvent
  | SessionCreatedEvent
  | SessionStateChangedEvent
  | SessionExpiredEvent
  | SessionDestroyedEvent
  | AudioChunkReceivedEvent
  | AudioSilenceDetectedEvent
  | AudioUtteranceStartedEvent
  | AudioUtteranceEndedEvent
  | STTInterimResultEvent
  | STTFinalResultEvent
  | STTErrorEvent
  | LLMRequestStartedEvent
  | LLMStreamChunkEvent
  | LLMResponseCompletedEvent
  | LLMErrorEvent
  | TTSSynthesisStartedEvent
  | TTSStreamChunkEvent
  | TTSSynthesisCompletedEvent
  | TTSErrorEvent
  | PipelineTurnStartedEvent
  | PipelineTurnCompletedEvent
  | PipelineInterruptedEvent
  | PipelineErrorEvent
  | TransportConnectedEvent
  | TransportDisconnectedEvent
  | TransportErrorEvent
  | ProviderHealthChangedEvent
  | ProviderPingFailedEvent;

export type VoiceEventMap = {
  [E in VoiceEvent as E['type']]: E;
};

export type EventHandler<T extends VoiceEvent = VoiceEvent> = (event: T) => void | Promise<void>;
export type AnyEventHandler = (event: VoiceEvent) => void | Promise<void>;

export interface IEventBus {
  emit<T extends VoiceEvent>(event: T): void;
  on<K extends VoiceEventType>(type: K, handler: EventHandler<VoiceEventMap[K]>): void;
  off<K extends VoiceEventType>(type: K, handler: EventHandler<VoiceEventMap[K]>): void;
  once<K extends VoiceEventType>(type: K, handler: EventHandler<VoiceEventMap[K]>): void;
  onAny(handler: AnyEventHandler): void;
}
