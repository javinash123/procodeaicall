/**
 * @module ConversationContext
 *
 * Mutable accumulator of all state that changes over the lifetime of a
 * single live conversation.
 *
 * ## Purpose
 * `ConversationContext` is the only place inside the orchestrator that
 * intentionally holds mutable state. It tracks the current and previous
 * turn, conversation history, active instructions, and references to the
 * frozen campaign and knowledge snapshots.
 *
 * ## Ownership
 * Created by the `ConversationOrchestrator` at conversation start and
 * discarded on shutdown. Not persisted — persistence is handled by the
 * session layer above the orchestrator.
 *
 * ## Thread Safety
 * All mutations must be performed by the orchestrator's sequential async
 * pipeline. No concurrent writes are safe.
 */

import type { Timestamp, Nullable, SessionId, CampaignId } from '../types/index.js';
import type { ConversationTurn } from './ConversationTurn.js';
import type { CampaignSnapshot } from '../session/index.js';
import type { KnowledgeSnapshot } from '../runtime/RuntimeContext.js';

/**
 * A registered tool available to the LLM in the current context.
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parametersSchema: Readonly<Record<string, unknown>>;
}

/**
 * A pending tool call from the LLM awaiting a result submission.
 */
export interface PendingToolCall {
  readonly callId: string;
  readonly toolName: string;
  readonly argumentsJson: string;
  readonly receivedAt: Timestamp;
}

/**
 * A summarised representation of a completed turn stored in conversation memory.
 */
export interface TurnMemoryEntry {
  readonly turnIndex: number;
  readonly userTranscript: Nullable<string>;
  readonly assistantResponse: Nullable<string>;
  readonly completedAt: Nullable<Timestamp>;
  readonly wasInterrupted: boolean;
}

/**
 * The mutable context object owned by one `ConversationOrchestrator`.
 */
export class ConversationContext {
  /** Unique identifier of the session this conversation belongs to. */
  readonly sessionId: SessionId;

  /** Campaign this conversation is executing. */
  readonly campaignId: CampaignId;

  /** Frozen campaign configuration snapshot. */
  readonly campaign: Readonly<CampaignSnapshot>;

  /** Frozen knowledge base snapshot for this campaign. */
  readonly knowledge: Readonly<KnowledgeSnapshot>;

  /** Conversation start timestamp. */
  readonly startedAt: Timestamp;

  private _currentTurn: Nullable<ConversationTurn> = null;
  private _previousTurn: Nullable<ConversationTurn> = null;
  private _history: TurnMemoryEntry[] = [];
  private _instructions: string;
  private _tools: ToolDefinition[] = [];
  private _pendingToolCalls: Map<string, PendingToolCall> = new Map();
  private _completedTurnCount = 0;
  private _lastActivityAt: Timestamp;

  constructor(
    sessionId: SessionId,
    campaignId: CampaignId,
    campaign: Readonly<CampaignSnapshot>,
    knowledge: Readonly<KnowledgeSnapshot>,
    initialInstructions: string,
    now: Timestamp
  ) {
    this.sessionId = sessionId;
    this.campaignId = campaignId;
    this.campaign = campaign;
    this.knowledge = knowledge;
    this._instructions = initialInstructions;
    this.startedAt = now;
    this._lastActivityAt = now;
  }

  // ─── Turn Management ──────────────────────────────────────────────────────

  /**
   * The turn currently being processed. Null between turns.
   */
  get currentTurn(): Nullable<ConversationTurn> {
    return this._currentTurn;
  }

  /**
   * The turn that completed immediately before the current one.
   */
  get previousTurn(): Nullable<ConversationTurn> {
    return this._previousTurn;
  }

  /**
   * Total number of turns that have reached a terminal state.
   */
  get completedTurnCount(): number {
    return this._completedTurnCount;
  }

  /**
   * Sets the current active turn. The previous turn is not modified here;
   * call `archiveTurn()` to rotate turns on completion.
   */
  setCurrentTurn(turn: ConversationTurn): void {
    this._currentTurn = turn;
  }

  /**
   * Moves the current turn to `previousTurn`, increments the completed count,
   * appends a memory entry, and clears `currentTurn`.
   */
  archiveTurn(completedTurn: ConversationTurn, now: Timestamp): void {
    const entry: TurnMemoryEntry = {
      turnIndex: completedTurn.turnIndex,
      userTranscript: completedTurn.transcript,
      assistantResponse: completedTurn.response,
      completedAt: completedTurn.completedAt,
      wasInterrupted: completedTurn.interruptions.length > 0,
    };
    this._history.push(entry);
    this._previousTurn = completedTurn;
    this._currentTurn = null;
    this._completedTurnCount += 1;
    this._lastActivityAt = now;
  }

  // ─── Conversation Memory ──────────────────────────────────────────────────

  /**
   * Ordered history of completed turns, oldest first.
   */
  get history(): readonly TurnMemoryEntry[] {
    return this._history;
  }

  // ─── Instructions ─────────────────────────────────────────────────────────

  /**
   * The current system instructions sent to the LLM provider.
   */
  get instructions(): string {
    return this._instructions;
  }

  /**
   * Replaces the active instructions (e.g. dynamic prompt updates mid-call).
   */
  updateInstructions(instructions: string, now: Timestamp): void {
    this._instructions = instructions;
    this._lastActivityAt = now;
  }

  // ─── Tool Context ─────────────────────────────────────────────────────────

  /**
   * Tools currently registered for this conversation.
   */
  get tools(): readonly ToolDefinition[] {
    return this._tools;
  }

  /**
   * Replaces the set of available tools.
   */
  setTools(tools: readonly ToolDefinition[], now: Timestamp): void {
    this._tools = [...tools];
    this._lastActivityAt = now;
  }

  /**
   * Records a pending tool call awaiting a result.
   */
  addPendingToolCall(call: PendingToolCall): void {
    this._pendingToolCalls.set(call.callId, call);
  }

  /**
   * Returns and removes a pending tool call by callId, or null if not found.
   */
  consumePendingToolCall(callId: string): Nullable<PendingToolCall> {
    const call = this._pendingToolCalls.get(callId) ?? null;
    if (call) this._pendingToolCalls.delete(callId);
    return call;
  }

  /**
   * All pending tool calls awaiting results.
   */
  get pendingToolCalls(): readonly PendingToolCall[] {
    return Array.from(this._pendingToolCalls.values());
  }

  // ─── Activity ─────────────────────────────────────────────────────────────

  /**
   * Timestamp of the most recent state change in this context.
   */
  get lastActivityAt(): Timestamp {
    return this._lastActivityAt;
  }

  /**
   * Updates the last activity timestamp. Call whenever external audio or
   * events arrive.
   */
  touch(now: Timestamp): void {
    this._lastActivityAt = now;
  }
}
