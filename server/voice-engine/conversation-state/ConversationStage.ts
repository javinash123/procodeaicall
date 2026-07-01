/**
 * @module ConversationStage
 *
 * Defines every valid stage in the AI sales conversation lifecycle, the
 * allowed transitions between them, and metadata associated with each stage.
 *
 * ## Design principle
 * The stage graph is the single source of truth for what transitions are
 * legal.  No other module may permit a transition that is not declared here.
 */

// ─── Stage Enum ───────────────────────────────────────────────────────────────

export enum ConversationStage {
  GREETING          = 'GREETING',
  RAPPORT           = 'RAPPORT',
  DISCOVERY         = 'DISCOVERY',
  QUALIFICATION     = 'QUALIFICATION',
  PRESENTATION      = 'PRESENTATION',
  OBJECTION_HANDLING = 'OBJECTION_HANDLING',
  CLOSING           = 'CLOSING',
  CALL_COMPLETED    = 'CALL_COMPLETED',
}

// ─── Stage Metadata ───────────────────────────────────────────────────────────

export interface StageMetadata {
  /** Human-readable label for the stage. */
  readonly label: string;
  /**
   * Recommended minimum number of agent turns before advancing.
   * 0 means the stage can be skipped immediately if conditions are met.
   */
  readonly minTurns: number;
  /** Whether this stage is a terminal state (no further transitions). */
  readonly isTerminal: boolean;
  /** Brief description of the stage's purpose. */
  readonly description: string;
}

export const STAGE_METADATA: Readonly<Record<ConversationStage, StageMetadata>> = {
  [ConversationStage.GREETING]: {
    label: 'Greeting',
    minTurns: 1,
    isTerminal: false,
    description: 'Warm introduction and opening question.',
  },
  [ConversationStage.RAPPORT]: {
    label: 'Rapport',
    minTurns: 1,
    isTerminal: false,
    description: 'Build genuine connection before any business discussion.',
  },
  [ConversationStage.DISCOVERY]: {
    label: 'Discovery',
    minTurns: 2,
    isTerminal: false,
    description: 'Understand the customer\'s current situation and pain points.',
  },
  [ConversationStage.QUALIFICATION]: {
    label: 'Qualification',
    minTurns: 1,
    isTerminal: false,
    description: 'Confirm budget, authority, need, and timeline.',
  },
  [ConversationStage.PRESENTATION]: {
    label: 'Presentation',
    minTurns: 1,
    isTerminal: false,
    description: 'Present the relevant solution tied to discovered pain.',
  },
  [ConversationStage.OBJECTION_HANDLING]: {
    label: 'Objection Handling',
    minTurns: 0,
    isTerminal: false,
    description: 'Acknowledge and address customer concerns.',
  },
  [ConversationStage.CLOSING]: {
    label: 'Closing',
    minTurns: 1,
    isTerminal: false,
    description: 'Summarise, confirm next step, and thank the customer.',
  },
  [ConversationStage.CALL_COMPLETED]: {
    label: 'Call Completed',
    minTurns: 0,
    isTerminal: true,
    description: 'Conversation has ended; no further transitions are possible.',
  },
};

// ─── Allowed Transitions ──────────────────────────────────────────────────────

/**
 * Defines which stages can be transitioned to from each source stage.
 *
 * Rules:
 * - Forward-only movement through the funnel (primary path).
 * - Objection handling can be entered from DISCOVERY, QUALIFICATION,
 *   PRESENTATION, or CLOSING, and exits back to the originating stage.
 * - Any non-terminal stage can transition directly to CALL_COMPLETED
 *   (call dropped, customer hangs up, hard stop).
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<ConversationStage, readonly ConversationStage[]>> = {
  [ConversationStage.GREETING]: [
    ConversationStage.RAPPORT,
    ConversationStage.DISCOVERY,        // skip rapport if customer is direct
    ConversationStage.CALL_COMPLETED,
  ],
  [ConversationStage.RAPPORT]: [
    ConversationStage.DISCOVERY,
    ConversationStage.CALL_COMPLETED,
  ],
  [ConversationStage.DISCOVERY]: [
    ConversationStage.QUALIFICATION,
    ConversationStage.OBJECTION_HANDLING,
    ConversationStage.CALL_COMPLETED,
  ],
  [ConversationStage.QUALIFICATION]: [
    ConversationStage.PRESENTATION,
    ConversationStage.OBJECTION_HANDLING,
    ConversationStage.CALL_COMPLETED,
  ],
  [ConversationStage.PRESENTATION]: [
    ConversationStage.OBJECTION_HANDLING,
    ConversationStage.CLOSING,
    ConversationStage.CALL_COMPLETED,
  ],
  [ConversationStage.OBJECTION_HANDLING]: [
    ConversationStage.DISCOVERY,        // resurface pain after objection
    ConversationStage.QUALIFICATION,
    ConversationStage.PRESENTATION,
    ConversationStage.CLOSING,
    ConversationStage.CALL_COMPLETED,
  ],
  [ConversationStage.CLOSING]: [
    ConversationStage.OBJECTION_HANDLING, // last-minute objection
    ConversationStage.CALL_COMPLETED,
  ],
  [ConversationStage.CALL_COMPLETED]: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if `to` is an allowed successor of `from`.
 */
export function isTransitionAllowed(
  from: ConversationStage,
  to: ConversationStage
): boolean {
  return (ALLOWED_TRANSITIONS[from] as readonly ConversationStage[]).includes(to);
}

/**
 * Returns the list of stages reachable from `stage`.
 */
export function getReachableStages(stage: ConversationStage): readonly ConversationStage[] {
  return ALLOWED_TRANSITIONS[stage];
}

/**
 * Returns true if `stage` is a terminal state.
 */
export function isTerminalStage(stage: ConversationStage): boolean {
  return STAGE_METADATA[stage].isTerminal;
}

/**
 * Ordered forward progression of the main sales funnel (excluding terminals).
 */
export const FUNNEL_ORDER: readonly ConversationStage[] = [
  ConversationStage.GREETING,
  ConversationStage.RAPPORT,
  ConversationStage.DISCOVERY,
  ConversationStage.QUALIFICATION,
  ConversationStage.PRESENTATION,
  ConversationStage.OBJECTION_HANDLING,
  ConversationStage.CLOSING,
  ConversationStage.CALL_COMPLETED,
];
