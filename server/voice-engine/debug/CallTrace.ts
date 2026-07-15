/**
 * @module CallTrace
 *
 * Collects per-call diagnostic counters and prints ONE concise evidence block
 * when the call ends. Activated by setting the environment variable:
 *
 *   CALL_TRACE=1
 *
 * ── NOT a functional component ──
 * Pure observation: counters only. Zero effect on audio routing, VAD,
 * session state, or any other runtime behaviour. Safe to leave enabled
 * in staging; disable for production.
 *
 * ── Usage ──
 * 1. Call `CallTrace.create(sessionId)` when a session starts.
 * 2. Call `CallTrace.greetingDone(sessionId)` after the first response.done.
 * 3. Call the record* methods from the relevant subsystems.
 * 4. Call `CallTrace.printAndDestroy(sessionId)` when the WS closes.
 */

const ENABLED = process.env['CALL_TRACE'] === '1';

interface TraceData {
  readonly sessionId: string;
  greetingCompletedAt: number | null;
  // Post-greeting inbound counters
  mediaPackets: number;
  mediaBytes: number;
  chunksForwarded: number;
  appendSent: number;
  appendBytes: number;
  // OpenAI event flags (post-greeting)
  speechStarted: boolean;
  speechStopped: boolean;
  committed: boolean;
  responseCreated: boolean;
  audioDelta: boolean;
  responseDone: boolean;
}

const _store = new Map<string, TraceData>();

export const CallTrace = {
  get enabled(): boolean {
    return ENABLED;
  },

  /** Call once when the V2 session is initialised. No-op if CALL_TRACE≠1. */
  create(sessionId: string): void {
    if (!ENABLED) return;
    _store.set(sessionId, {
      sessionId,
      greetingCompletedAt: null,
      mediaPackets: 0,
      mediaBytes: 0,
      chunksForwarded: 0,
      appendSent: 0,
      appendBytes: 0,
      speechStarted: false,
      speechStopped: false,
      committed: false,
      responseCreated: false,
      audioDelta: false,
      responseDone: false,
    });
  },

  /** Returns the trace record, or undefined if disabled / not found. */
  _get(sessionId: string | null | undefined): TraceData | undefined {
    if (!ENABLED || !sessionId) return undefined;
    return _store.get(sessionId);
  },

  /** Returns true once the greeting response.done has been recorded. */
  isGreetingDone(sessionId: string | null | undefined): boolean {
    return (_store.get(sessionId ?? '') ?? { greetingCompletedAt: null }).greetingCompletedAt !== null;
  },

  /**
   * Call on the FIRST response.done — marks the greeting as complete.
   * Subsequent calls are no-ops so the flag is idempotent.
   */
  greetingDone(sessionId: string | null | undefined): void {
    const t = CallTrace._get(sessionId);
    if (!t || t.greetingCompletedAt !== null) return;
    t.greetingCompletedAt = Date.now();
  },

  /**
   * Call for every valid Exotel `media` packet received.
   * Only counted after the greeting is done.
   */
  recordMediaPacket(sessionId: string | null | undefined, base64Len: number): void {
    const t = CallTrace._get(sessionId);
    if (!t || t.greetingCompletedAt === null) return;
    t.mediaPackets++;
    t.mediaBytes += Math.floor(base64Len * 0.75);
  },

  /**
   * Call each time InboundAudioFlow forwards a chunk to the bridge.
   * Only counted after the greeting is done.
   */
  recordChunkForwarded(sessionId: string | null | undefined): void {
    const t = CallTrace._get(sessionId);
    if (!t || t.greetingCompletedAt === null) return;
    t.chunksForwarded++;
  },

  /**
   * Call each time an `input_audio_buffer.append` is sent to OpenAI.
   * Only counted after the greeting is done.
   */
  recordAppend(sessionId: string | null | undefined, base64Len: number): void {
    const t = CallTrace._get(sessionId);
    if (!t || t.greetingCompletedAt === null) return;
    t.appendSent++;
    t.appendBytes += Math.floor(base64Len * 0.75);
  },

  /**
   * Call for every OpenAI server event.  Tracks specific post-greeting events.
   * Unknown types are silently ignored.
   */
  recordOpenAIEvent(sessionId: string | null | undefined, type: string): void {
    const t = CallTrace._get(sessionId);
    if (!t) return;
    const postGreeting = t.greetingCompletedAt !== null;
    switch (type) {
      case 'input_audio_buffer.speech_started':
        t.speechStarted = true;
        break;
      case 'input_audio_buffer.speech_stopped':
        t.speechStopped = true;
        break;
      case 'input_audio_buffer.committed':
        t.committed = true;
        break;
      case 'response.created':
        if (postGreeting) t.responseCreated = true;
        break;
      case 'response.output_audio.delta':
      case 'response.audio.delta':
        if (postGreeting) t.audioDelta = true;
        break;
      case 'response.done':
        if (postGreeting) t.responseDone = true;
        break;
    }
  },

  /**
   * Prints the CALL TRACE block and removes the record.
   * Call from the WebSocket close handler.
   */
  printAndDestroy(sessionId: string | null | undefined): void {
    if (!sessionId) return;
    const t = _store.get(sessionId);
    if (!t) return;

    const ts = t.greetingCompletedAt
      ? new Date(t.greetingCompletedAt).toISOString()
      : 'NOT RECORDED';

    const yn = (b: boolean) => (b ? 'YES' : 'NO');

    console.log(
      '\n====================================' +
      '\nCALL TRACE' +
      '\n====================================' +
      '\n' +
      '\nGreeting completed:' +
      `\n  ${ts}` +
      '\n' +
      '\nCustomer media packets received:' +
      `\n  count        ${t.mediaPackets}` +
      `\n  total bytes  ${t.mediaBytes}` +
      '\n' +
      '\nInboundAudioFlow chunks forwarded:' +
      `\n  count        ${t.chunksForwarded}` +
      '\n' +
      '\ninput_audio_buffer.append sent:' +
      `\n  count        ${t.appendSent}` +
      `\n  total bytes  ${t.appendBytes}` +
      '\n' +
      '\nOpenAI events:' +
      `\n  speech_started               ${yn(t.speechStarted)}` +
      `\n  speech_stopped               ${yn(t.speechStopped)}` +
      `\n  input_audio_buffer.committed ${yn(t.committed)}` +
      `\n  response.created             ${yn(t.responseCreated)}` +
      `\n  response.output_audio.delta  ${yn(t.audioDelta)}` +
      `\n  response.done                ${yn(t.responseDone)}` +
      '\n' +
      '\n====================================\n'
    );

    _store.delete(sessionId);
  },
};
