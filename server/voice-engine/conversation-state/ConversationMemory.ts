/**
 * @module ConversationMemory
 *
 * Tracks all customer-specific information gathered during a conversation.
 *
 * ## Purpose
 * Acts as the AI's working memory for one call — everything the agent has
 * learned about the customer is stored here so it can be referenced when
 * evaluating the next action, advancing the state machine, or generating
 * a closing summary.
 *
 * ## Ownership
 * Created by `ConversationStateFactory` and mutated exclusively through its
 * public update methods.  The state machine reads it; only external callers
 * (orchestrator, evaluator) write to it via the update API.
 *
 * ## No AI imports
 * Pure data container — no OpenAI, Exotel, or prompt logic.
 */

// ─── Sub-types ────────────────────────────────────────────────────────────────

/**
 * A single objection raised by the customer.
 */
export interface CustomerObjection {
  /** Short label for this objection. */
  readonly topic: string;
  /** The customer's verbatim phrasing, if captured. */
  readonly verbatim?: string;
  /** Whether the agent has addressed this objection. */
  resolved: boolean;
  /** ISO timestamp when the objection was first raised. */
  readonly raisedAt: string;
}

/**
 * A commitment or agreement made during the call.
 */
export interface CallCommitment {
  /** Description of what was agreed. */
  readonly description: string;
  /** ISO timestamp when the commitment was made. */
  readonly agreedAt: string;
}

// ─── ConversationMemory ───────────────────────────────────────────────────────

/**
 * All customer data gathered during the conversation.
 * Fields are optional because information arrives incrementally.
 */
export class ConversationMemory {
  // ── Identity ───────────────────────────────────────────────────────────────
  private _customerName?: string;
  private _company?: string;

  // ── Intent & Need ──────────────────────────────────────────────────────────
  private _intent?: string;
  private _painPoints: string[] = [];

  // ── Qualification Data ─────────────────────────────────────────────────────
  private _budget?: string;
  private _timeline?: string;
  private _isDecisionMaker?: boolean;

  // ── Objections & Commitments ───────────────────────────────────────────────
  private _objections: CustomerObjection[] = [];
  private _commitments: CallCommitment[] = [];

  // ── Next Action ────────────────────────────────────────────────────────────
  private _nextAction?: string;

  // ─── Identity ──────────────────────────────────────────────────────────────

  get customerName(): string | undefined { return this._customerName; }
  get company(): string | undefined { return this._company; }

  setCustomerName(name: string): void { this._customerName = name.trim(); }
  setCompany(company: string): void { this._company = company.trim(); }

  // ─── Intent & Need ─────────────────────────────────────────────────────────

  get intent(): string | undefined { return this._intent; }
  get painPoints(): readonly string[] { return this._painPoints; }

  setIntent(intent: string): void { this._intent = intent.trim(); }

  addPainPoint(point: string): void {
    const trimmed = point.trim();
    if (trimmed && !this._painPoints.includes(trimmed)) {
      this._painPoints.push(trimmed);
    }
  }

  // ─── Qualification ─────────────────────────────────────────────────────────

  get budget(): string | undefined { return this._budget; }
  get timeline(): string | undefined { return this._timeline; }
  get isDecisionMaker(): boolean | undefined { return this._isDecisionMaker; }

  setBudget(budget: string): void { this._budget = budget.trim(); }
  setTimeline(timeline: string): void { this._timeline = timeline.trim(); }
  setIsDecisionMaker(value: boolean): void { this._isDecisionMaker = value; }

  // ─── Objections ────────────────────────────────────────────────────────────

  get objections(): readonly CustomerObjection[] { return this._objections; }

  get unresolvedObjections(): readonly CustomerObjection[] {
    return this._objections.filter((o) => !o.resolved);
  }

  get hasUnresolvedObjections(): boolean {
    return this.unresolvedObjections.length > 0;
  }

  addObjection(topic: string, verbatim?: string): void {
    const already = this._objections.find(
      (o) => o.topic.toLowerCase() === topic.toLowerCase()
    );
    if (!already) {
      this._objections.push({
        topic,
        verbatim,
        resolved: false,
        raisedAt: new Date().toISOString(),
      });
    }
  }

  resolveObjection(topic: string): boolean {
    const obj = this._objections.find(
      (o) => o.topic.toLowerCase() === topic.toLowerCase()
    );
    if (obj) {
      obj.resolved = true;
      return true;
    }
    return false;
  }

  // ─── Commitments ───────────────────────────────────────────────────────────

  get commitments(): readonly CallCommitment[] { return this._commitments; }

  addCommitment(description: string): void {
    this._commitments.push({
      description: description.trim(),
      agreedAt: new Date().toISOString(),
    });
  }

  // ─── Next Action ───────────────────────────────────────────────────────────

  get nextAction(): string | undefined { return this._nextAction; }
  setNextAction(action: string): void { this._nextAction = action.trim(); }

  // ─── Derived Helpers ───────────────────────────────────────────────────────

  /**
   * True when enough qualification data has been gathered to present a solution.
   */
  get isQualified(): boolean {
    return (
      this._painPoints.length > 0 &&
      this._isDecisionMaker !== undefined
    );
  }

  /**
   * True when a next action has been committed to.
   */
  get hasNextAction(): boolean {
    return !!this._nextAction;
  }

  /**
   * Serialises the memory to a plain object for logging or persistence.
   */
  toSnapshot(): Readonly<Record<string, unknown>> {
    return Object.freeze({
      customerName: this._customerName,
      company: this._company,
      intent: this._intent,
      painPoints: [...this._painPoints],
      budget: this._budget,
      timeline: this._timeline,
      isDecisionMaker: this._isDecisionMaker,
      objections: this._objections.map((o) => ({ ...o })),
      commitments: this._commitments.map((c) => ({ ...c })),
      nextAction: this._nextAction,
    });
  }
}
