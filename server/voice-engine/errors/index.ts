export enum ErrorCode {
  UNKNOWN = 'UNKNOWN',
  CONFIGURATION_INVALID = 'CONFIGURATION_INVALID',
  CONFIGURATION_MISSING = 'CONFIGURATION_MISSING',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',
  PROVIDER_AUTH_FAILED = 'PROVIDER_AUTH_FAILED',
  PROVIDER_RATE_LIMITED = 'PROVIDER_RATE_LIMITED',
  PROVIDER_STREAMING_FAILED = 'PROVIDER_STREAMING_FAILED',
  TRANSPORT_CONNECTION_FAILED = 'TRANSPORT_CONNECTION_FAILED',
  TRANSPORT_DISCONNECTED = 'TRANSPORT_DISCONNECTED',
  TRANSPORT_SEND_FAILED = 'TRANSPORT_SEND_FAILED',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_SERIALIZATION_FAILED = 'SESSION_SERIALIZATION_FAILED',
  AUDIO_DECODE_FAILED = 'AUDIO_DECODE_FAILED',
  AUDIO_ENCODE_FAILED = 'AUDIO_ENCODE_FAILED',
  STT_FAILED = 'STT_FAILED',
  LLM_FAILED = 'LLM_FAILED',
  TTS_FAILED = 'TTS_FAILED',
  PIPELINE_ABORTED = 'PIPELINE_ABORTED',
  PIPELINE_TIMEOUT = 'PIPELINE_TIMEOUT',
}

export class VoiceEngineError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(
    message: string,
    code: ErrorCode,
    retryable: boolean,
    context: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'VoiceEngineError';
    this.code = code;
    this.retryable = retryable;
    this.context = Object.freeze({ ...context });
  }
}

export class RetryableError extends VoiceEngineError {
  readonly maxAttempts: number;
  readonly backoffMs: number;

  constructor(
    message: string,
    code: ErrorCode,
    maxAttempts: number = 3,
    backoffMs: number = 1000,
    context: Record<string, unknown> = {}
  ) {
    super(message, code, true, context);
    this.name = 'RetryableError';
    this.maxAttempts = maxAttempts;
    this.backoffMs = backoffMs;
  }
}

export class FatalError extends VoiceEngineError {
  constructor(message: string, code: ErrorCode, context: Record<string, unknown> = {}) {
    super(message, code, false, context);
    this.name = 'FatalError';
  }
}

export class ConfigurationError extends FatalError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, ErrorCode.CONFIGURATION_INVALID, context);
    this.name = 'ConfigurationError';
  }
}

export class ProviderError extends RetryableError {
  readonly providerName: string;

  constructor(
    message: string,
    code: ErrorCode,
    providerName: string,
    context: Record<string, unknown> = {}
  ) {
    super(message, code, 3, 1000, context);
    this.name = 'ProviderError';
    this.providerName = providerName;
  }
}

export class TransportError extends RetryableError {
  constructor(message: string, code: ErrorCode, context: Record<string, unknown> = {}) {
    super(message, code, 5, 500, context);
    this.name = 'TransportError';
  }
}
