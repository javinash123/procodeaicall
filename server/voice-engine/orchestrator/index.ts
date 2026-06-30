/**
 * @module orchestrator
 *
 * Public barrel export for the Voice Engine Conversation Orchestrator.
 *
 * ## Usage
 * ```typescript
 * import {
 *   createConversationOrchestrator,
 *   OrchestratorState,
 * } from '../voice-engine/orchestrator/index.js';
 * ```
 *
 * ## Important
 * No OpenAI, Exotel, transport, or provider-specific imports exist within
 * this module. All provider concerns are abstracted via `IRealtimeProviderSession`.
 */

export {
  OrchestratorState,
  ConversationOrchestrator,
} from './ConversationOrchestrator.js';
export type {
  IRealtimeProviderSession,
  IConversationOrchestrator,
  OrchestratorEvent,
  OrchestratorEventType,
  OrchestratorEventHandler,
} from './ConversationOrchestrator.js';

export { ConversationContext } from './ConversationContext.js';
export type {
  ToolDefinition,
  PendingToolCall,
  TurnMemoryEntry,
} from './ConversationContext.js';

export {
  createTurn,
  patchTurn,
  completeTurn,
  failTurn,
  recordInterruption,
} from './ConversationTurn.js';
export type {
  ConversationTurn,
  TurnLatency,
  TurnInterruption,
} from './ConversationTurn.js';

export { TurnState, TERMINAL_TURN_STATES, VALID_TURN_TRANSITIONS } from './TurnState.js';

export { buildTurnPolicy } from './TurnPolicy.js';
export type { TurnPolicy, TurnRetryPolicy } from './TurnPolicy.js';

export { InterruptManager } from './InterruptManager.js';
export type { InterruptRequest } from './InterruptManager.js';

export { TurnScheduler } from './TurnScheduler.js';
export type { SchedulingDecision, SchedulingInput, SchedulingAction } from './TurnScheduler.js';

export { createConversationOrchestrator } from './OrchestratorFactory.js';
export type { OrchestratorCreationOptions } from './OrchestratorFactory.js';
