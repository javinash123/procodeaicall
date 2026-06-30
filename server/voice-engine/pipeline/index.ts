import type { SessionId, Timestamp } from '../types/index.js';

export type PipelineStage =
  | 'idle'
  | 'receiving_audio'
  | 'transcribing'
  | 'generating_response'
  | 'synthesizing_speech'
  | 'streaming_audio'
  | 'interrupted';

export type PipelineResult = 'completed' | 'interrupted' | 'error' | 'timeout';

export interface PipelineContext {
  readonly sessionId: SessionId;
  readonly stage: PipelineStage;
  readonly startedAt: Timestamp;
  readonly abortSignal: AbortSignal;
}

export interface PipelineTurn {
  readonly sessionId: SessionId;
  readonly userTranscript: string;
  readonly assistantResponse: string;
  readonly result: PipelineResult;
  readonly latencyMs: number;
  readonly sttLatencyMs: number;
  readonly llmLatencyMs: number;
  readonly ttsLatencyMs: number;
}

export interface IPipelineStage<TInput, TOutput> {
  readonly name: string;
  execute(input: TInput, context: PipelineContext): Promise<TOutput>;
}
