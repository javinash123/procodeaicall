/**
 * @module OpenAIRealtimeTypes
 *
 * Internal types for the OpenAI Realtime WebSocket API.
 *
 * ## Purpose
 * Provides strongly typed models for every client→server and server→client
 * event on the OpenAI Realtime WebSocket endpoint. Nothing outside this
 * provider module should depend on these types.
 *
 * ## Ownership
 * Owned exclusively by the OpenAI provider. No Voice Engine module outside
 * `server/voice-engine/providers/openai/` may import from this file.
 *
 * ## References
 * https://platform.openai.com/docs/api-reference/realtime
 */

// ─── Audio Format ─────────────────────────────────────────────────────────────

export type RealtimeAudioFormat = 'pcm16' | 'g711_ulaw' | 'g711_alaw';

// ─── Voice ────────────────────────────────────────────────────────────────────

export type RealtimeVoice =
  | 'alloy'
  | 'ash'
  | 'ballad'
  | 'coral'
  | 'echo'
  | 'sage'
  | 'shimmer'
  | 'verse';

// ─── Turn Detection ───────────────────────────────────────────────────────────

export interface ServerVADTurnDetection {
  readonly type: 'server_vad';
  readonly threshold?: number;
  readonly prefix_padding_ms?: number;
  readonly silence_duration_ms?: number;
  readonly create_response?: boolean;
  readonly interrupt_response?: boolean;
}

export interface SemanticVADTurnDetection {
  readonly type: 'semantic_vad';
  readonly eagerness?: 'low' | 'medium' | 'high' | 'auto';
  readonly create_response?: boolean;
  readonly interrupt_response?: boolean;
}

export type TurnDetection = ServerVADTurnDetection | SemanticVADTurnDetection;

// ─── Content Parts ────────────────────────────────────────────────────────────

export interface TextContentPart {
  readonly type: 'text';
  readonly text: string;
}

export interface InputTextContentPart {
  readonly type: 'input_text';
  readonly text: string;
}

export interface InputAudioContentPart {
  readonly type: 'input_audio';
  readonly audio?: string;
  readonly transcript?: string | null;
}

export interface AudioContentPart {
  readonly type: 'audio';
  readonly audio?: string;
  readonly transcript?: string | null;
}

export type ContentPart =
  | TextContentPart
  | InputTextContentPart
  | InputAudioContentPart
  | AudioContentPart;

// ─── Conversation Item ────────────────────────────────────────────────────────

export type ItemRole = 'user' | 'assistant' | 'system';
export type ItemType = 'message' | 'function_call' | 'function_call_output';
export type ItemStatus = 'completed' | 'incomplete';

export interface ConversationItem {
  readonly id?: string;
  readonly type: ItemType;
  readonly role?: ItemRole;
  readonly content?: readonly ContentPart[];
  readonly name?: string;
  readonly arguments?: string;
  readonly call_id?: string;
  readonly output?: string;
  readonly status?: ItemStatus;
}

// ─── Tool Definition ──────────────────────────────────────────────────────────

export interface FunctionTool {
  readonly type: 'function';
  readonly name: string;
  readonly description?: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly strict?: boolean;
}

export type Tool = FunctionTool;

// ─── Audio Format (gpt-realtime nested schema) ────────────────────────────────

/**
 * MIME-type audio format as used by the gpt-realtime session schema.
 * The format type string replaces the flat `input_audio_format` /
 * `output_audio_format` fields used by the older gpt-4o-realtime-preview API.
 *
 * Supported values confirmed by live runtime:
 *   'audio/pcm'  — 16-bit PCM (default 24 kHz)
 *   'audio/pcmu' — G.711 µ-law (8 kHz telephony)
 *   'audio/pcma' — G.711 A-law (8 kHz telephony)
 */
export interface RealtimeAudioFormatObject {
  readonly type: 'audio/pcm' | 'audio/pcmu' | 'audio/pcma';
}

export interface RealtimeAudioInput {
  readonly format?: RealtimeAudioFormatObject;
  readonly transcription?: {
    readonly model: string;
    readonly language?: string | null;
    readonly prompt?: string | null;
  } | null;
  readonly noise_reduction?: unknown | null;
  readonly turn_detection?: TurnDetection | null;
}

export interface RealtimeAudioOutput {
  readonly format?: RealtimeAudioFormatObject;
  readonly voice?: RealtimeVoice;
  readonly speed?: number;
}

export interface RealtimeAudioConfig {
  readonly input?: RealtimeAudioInput;
  readonly output?: RealtimeAudioOutput;
}

// ─── Session Resource ─────────────────────────────────────────────────────────

export interface RealtimeSessionResource {
  readonly type?: 'realtime';
  readonly id?: string;
  readonly object?: string;
  readonly model?: string;
  readonly instructions?: string;
  /**
   * Nested audio configuration block used by the gpt-realtime model family.
   * Replaces the flat `voice`, `input_audio_format`, `output_audio_format`,
   * `input_audio_transcription`, and `turn_detection` top-level fields
   * that were used by gpt-4o-realtime-preview.
   */
  readonly audio?: RealtimeAudioConfig;
  readonly tools?: readonly Tool[];
  readonly tool_choice?: 'auto' | 'none' | 'required' | string;
  readonly max_output_tokens?: number | 'inf';
  readonly output_modalities?: readonly string[];
  readonly tracing?: unknown | null;
  readonly truncation?: string | null;
  readonly include?: unknown | null;
}

// ─── Rate Limit Resource ──────────────────────────────────────────────────────

export interface RateLimitResource {
  readonly name: string;
  readonly limit: number;
  readonly remaining: number;
  readonly reset_seconds: number;
}

// ─── Usage Resource ───────────────────────────────────────────────────────────

export interface UsageResource {
  readonly total_tokens?: number;
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly input_token_details?: {
    readonly cached_tokens?: number;
    readonly text_tokens?: number;
    readonly audio_tokens?: number;
  };
  readonly output_token_details?: {
    readonly text_tokens?: number;
    readonly audio_tokens?: number;
  };
}

// ─── Client → Server Events ───────────────────────────────────────────────────

export interface SessionUpdateEvent {
  readonly type: 'session.update';
  readonly event_id?: string;
  readonly session: Partial<RealtimeSessionResource>;
}

export interface InputAudioBufferAppendEvent {
  readonly type: 'input_audio_buffer.append';
  readonly event_id?: string;
  readonly audio: string;
}

export interface InputAudioBufferCommitEvent {
  readonly type: 'input_audio_buffer.commit';
  readonly event_id?: string;
}

export interface InputAudioBufferClearEvent {
  readonly type: 'input_audio_buffer.clear';
  readonly event_id?: string;
}

export interface ConversationItemCreateEvent {
  readonly type: 'conversation.item.create';
  readonly event_id?: string;
  readonly previous_item_id?: string | null;
  readonly item: ConversationItem;
}

export interface ConversationItemTruncateEvent {
  readonly type: 'conversation.item.truncate';
  readonly event_id?: string;
  readonly item_id: string;
  readonly content_index: number;
  readonly audio_end_ms: number;
}

export interface ConversationItemDeleteEvent {
  readonly type: 'conversation.item.delete';
  readonly event_id?: string;
  readonly item_id: string;
}

export interface ResponseCreateEvent {
  readonly type: 'response.create';
  readonly event_id?: string;
  readonly response?: Partial<RealtimeSessionResource>;
}

export interface ResponseCancelEvent {
  readonly type: 'response.cancel';
  readonly event_id?: string;
}

export type ClientEvent =
  | SessionUpdateEvent
  | InputAudioBufferAppendEvent
  | InputAudioBufferCommitEvent
  | InputAudioBufferClearEvent
  | ConversationItemCreateEvent
  | ConversationItemTruncateEvent
  | ConversationItemDeleteEvent
  | ResponseCreateEvent
  | ResponseCancelEvent;

// ─── Server → Client Events ───────────────────────────────────────────────────

export interface ServerErrorEvent {
  readonly type: 'error';
  readonly event_id: string;
  readonly error: {
    readonly type: string;
    readonly code?: string;
    readonly message: string;
    readonly param?: string | null;
    readonly event_id?: string | null;
  };
}

export interface SessionCreatedEvent {
  readonly type: 'session.created';
  readonly event_id: string;
  readonly session: RealtimeSessionResource;
}

export interface SessionUpdatedEvent {
  readonly type: 'session.updated';
  readonly event_id: string;
  readonly session: RealtimeSessionResource;
}

export interface ConversationCreatedEvent {
  readonly type: 'conversation.created';
  readonly event_id: string;
  readonly conversation: { readonly id: string; readonly object: string };
}

export interface ConversationItemCreatedEvent {
  readonly type: 'conversation.item.created';
  readonly event_id: string;
  readonly previous_item_id: string | null;
  readonly item: ConversationItem;
}

export interface ConversationItemInputAudioTranscriptionCompletedEvent {
  readonly type: 'conversation.item.input_audio_transcription.completed';
  readonly event_id: string;
  readonly item_id: string;
  readonly content_index: number;
  readonly transcript: string;
}

export interface ConversationItemInputAudioTranscriptionDeltaEvent {
  readonly type: 'conversation.item.input_audio_transcription.delta';
  readonly event_id: string;
  readonly item_id: string;
  readonly content_index: number;
  readonly delta: string;
}

export interface ConversationItemInputAudioTranscriptionFailedEvent {
  readonly type: 'conversation.item.input_audio_transcription.failed';
  readonly event_id: string;
  readonly item_id: string;
  readonly content_index: number;
  readonly error: { readonly type: string; readonly code?: string; readonly message: string };
}

export interface InputAudioBufferCommittedEvent {
  readonly type: 'input_audio_buffer.committed';
  readonly event_id: string;
  readonly previous_item_id: string | null;
  readonly item_id: string;
}

export interface InputAudioBufferClearedEvent {
  readonly type: 'input_audio_buffer.cleared';
  readonly event_id: string;
}

export interface InputAudioBufferSpeechStartedEvent {
  readonly type: 'input_audio_buffer.speech_started';
  readonly event_id: string;
  readonly audio_start_ms: number;
  readonly item_id: string;
}

export interface InputAudioBufferSpeechStoppedEvent {
  readonly type: 'input_audio_buffer.speech_stopped';
  readonly event_id: string;
  readonly audio_end_ms: number;
  readonly item_id: string;
}

export interface ResponseCreatedEvent {
  readonly type: 'response.created';
  readonly event_id: string;
  readonly response: { readonly id: string; readonly status: string };
}

export interface ResponseDoneEvent {
  readonly type: 'response.done';
  readonly event_id: string;
  readonly response: {
    readonly id: string;
    readonly status: 'completed' | 'cancelled' | 'failed' | 'incomplete';
    readonly usage?: UsageResource;
    readonly output?: readonly ConversationItem[];
  };
}

export interface ResponseOutputItemAddedEvent {
  readonly type: 'response.output_item.added';
  readonly event_id: string;
  readonly response_id: string;
  readonly output_index: number;
  readonly item: ConversationItem;
}

export interface ResponseOutputItemDoneEvent {
  readonly type: 'response.output_item.done';
  readonly event_id: string;
  readonly response_id: string;
  readonly output_index: number;
  readonly item: ConversationItem;
}

export interface ResponseContentPartAddedEvent {
  readonly type: 'response.content_part.added';
  readonly event_id: string;
  readonly response_id: string;
  readonly item_id: string;
  readonly output_index: number;
  readonly content_index: number;
  readonly part: ContentPart;
}

export interface ResponseContentPartDoneEvent {
  readonly type: 'response.content_part.done';
  readonly event_id: string;
  readonly response_id: string;
  readonly item_id: string;
  readonly output_index: number;
  readonly content_index: number;
  readonly part: ContentPart;
}

export interface ResponseTextDeltaEvent {
  readonly type: 'response.text.delta';
  readonly event_id: string;
  readonly response_id: string;
  readonly item_id: string;
  readonly output_index: number;
  readonly content_index: number;
  readonly delta: string;
}

export interface ResponseTextDoneEvent {
  readonly type: 'response.text.done';
  readonly event_id: string;
  readonly response_id: string;
  readonly item_id: string;
  readonly output_index: number;
  readonly content_index: number;
  readonly text: string;
}

export interface ResponseAudioTranscriptDeltaEvent {
  readonly type: 'response.audio_transcript.delta';
  readonly event_id: string;
  readonly response_id: string;
  readonly item_id: string;
  readonly output_index: number;
  readonly content_index: number;
  readonly delta: string;
}

export interface ResponseAudioTranscriptDoneEvent {
  readonly type: 'response.audio_transcript.done';
  readonly event_id: string;
  readonly response_id: string;
  readonly item_id: string;
  readonly output_index: number;
  readonly content_index: number;
  readonly transcript: string;
}

export interface ResponseAudioDeltaEvent {
  readonly type: 'response.audio.delta';
  readonly event_id: string;
  readonly response_id: string;
  readonly item_id: string;
  readonly output_index: number;
  readonly content_index: number;
  readonly delta: string;
}

export interface ResponseAudioDoneEvent {
  readonly type: 'response.audio.done';
  readonly event_id: string;
  readonly response_id: string;
  readonly item_id: string;
  readonly output_index: number;
  readonly content_index: number;
}

// ─── gpt-realtime (GA) audio event aliases ────────────────────────────────────
// The GA model renamed the four preview event types below.  The interfaces are
// structurally identical; only the discriminant `type` literal differs.

export interface ResponseOutputAudioDeltaEvent {
  readonly type: 'response.output_audio.delta';
  readonly event_id: string;
  readonly response_id: string;
  readonly item_id: string;
  readonly output_index: number;
  readonly content_index: number;
  readonly delta: string;
}

export interface ResponseOutputAudioDoneEvent {
  readonly type: 'response.output_audio.done';
  readonly event_id: string;
  readonly response_id: string;
  readonly item_id: string;
  readonly output_index: number;
  readonly content_index: number;
}

export interface ResponseOutputAudioTranscriptDeltaEvent {
  readonly type: 'response.output_audio_transcript.delta';
  readonly event_id: string;
  readonly response_id: string;
  readonly item_id: string;
  readonly output_index: number;
  readonly content_index: number;
  readonly delta: string;
}

export interface ResponseOutputAudioTranscriptDoneEvent {
  readonly type: 'response.output_audio_transcript.done';
  readonly event_id: string;
  readonly response_id: string;
  readonly item_id: string;
  readonly output_index: number;
  readonly content_index: number;
  readonly transcript: string;
}

export interface ResponseFunctionCallArgumentsDeltaEvent {
  readonly type: 'response.function_call_arguments.delta';
  readonly event_id: string;
  readonly response_id: string;
  readonly item_id: string;
  readonly output_index: number;
  readonly call_id: string;
  readonly delta: string;
}

export interface ResponseFunctionCallArgumentsDoneEvent {
  readonly type: 'response.function_call_arguments.done';
  readonly event_id: string;
  readonly response_id: string;
  readonly item_id: string;
  readonly output_index: number;
  readonly call_id: string;
  readonly name: string;
  readonly arguments: string;
}

export interface RateLimitsUpdatedEvent {
  readonly type: 'rate_limits.updated';
  readonly event_id: string;
  readonly rate_limits: readonly RateLimitResource[];
}

export type ServerEvent =
  | ServerErrorEvent
  | SessionCreatedEvent
  | SessionUpdatedEvent
  | ConversationCreatedEvent
  | ConversationItemCreatedEvent
  | ConversationItemInputAudioTranscriptionCompletedEvent
  | ConversationItemInputAudioTranscriptionDeltaEvent
  | ConversationItemInputAudioTranscriptionFailedEvent
  | InputAudioBufferCommittedEvent
  | InputAudioBufferClearedEvent
  | InputAudioBufferSpeechStartedEvent
  | InputAudioBufferSpeechStoppedEvent
  | ResponseCreatedEvent
  | ResponseDoneEvent
  | ResponseOutputItemAddedEvent
  | ResponseOutputItemDoneEvent
  | ResponseContentPartAddedEvent
  | ResponseContentPartDoneEvent
  | ResponseTextDeltaEvent
  | ResponseTextDoneEvent
  | ResponseAudioTranscriptDeltaEvent
  | ResponseAudioTranscriptDoneEvent
  | ResponseAudioDeltaEvent
  | ResponseAudioDoneEvent
  | ResponseOutputAudioDeltaEvent
  | ResponseOutputAudioDoneEvent
  | ResponseOutputAudioTranscriptDeltaEvent
  | ResponseOutputAudioTranscriptDoneEvent
  | ResponseFunctionCallArgumentsDeltaEvent
  | ResponseFunctionCallArgumentsDoneEvent
  | RateLimitsUpdatedEvent;

export type ServerEventType = ServerEvent['type'];
export type ServerEventMap = { [E in ServerEvent as E['type']]: E };
