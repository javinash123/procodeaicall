/**
 * @module diagnostics
 *
 * Turn-level diagnostics for the Voice Engine.
 *
 * ## Usage
 *
 * ```ts
 * import { TurnDiagnosticsCollector } from '../diagnostics/index.js';
 *
 * const session = provider.openSession({ policyContext });
 * await session.connect();
 *
 * const collector = new TurnDiagnosticsCollector({ session, logger });
 * collector.attach(session);
 *
 * // … call proceeds …
 *
 * await session.close();
 * collector.detach();
 * ```
 *
 * ## Custom callback
 *
 * ```ts
 * const collector = new TurnDiagnosticsCollector({
 *   session,
 *   logger,
 *   onTurnComplete: (log) => {
 *     myMonitoring.track('turn', log);
 *   },
 * });
 * ```
 */

export { TurnDiagnosticsCollector } from './TurnDiagnosticsCollector.js';
export type { TurnCompleteCallback, TurnDiagnosticsCollectorOptions } from './TurnDiagnosticsCollector.js';
export { formatTurnDiagnosticsLog, computeEstimatedCost } from './TurnDiagnosticsLog.js';
export type { TurnDiagnosticsLog } from './TurnDiagnosticsLog.js';
