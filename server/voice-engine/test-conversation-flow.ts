/**
 * Conversation Flow Simulation Test
 *
 * Runs the exact same state machine + evaluator + policy builder that runs
 * during a real call. Verifies the two reported issues are fixed:
 *
 * 1. AI must NOT advance a stage before the customer has responded.
 * 2. The TurnControlPolicy is present in the generated system prompt.
 *
 * Run with: npx tsx server/voice-engine/test-conversation-flow.ts
 */

import {
  ConversationStateFactory,
  ConversationStage,
  Signals,
} from './conversation-state/index.js';

import {
  ConversationPolicyBuilder,
  SalesConversationPolicy,
} from './conversation/index.js';

// ─── Colours ──────────────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    console.log(`  ${GREEN}✓${RESET} ${label}`);
    passed++;
  } else {
    console.log(`  ${RED}✗ FAIL${RESET} ${label}${detail ? `\n    ${RED}→ ${detail}${RESET}` : ''}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${BOLD}${CYAN}━━━ ${title} ━━━${RESET}`);
}

// ─── Mock context ─────────────────────────────────────────────────────────────

const MOCK_POLICY_CTX = {
  agentName: 'Alex',
  companyName: 'NIJVOX',
  campaignGoal: 'Book a product demo for our AI calling platform',
  campaignType: 'sales' as const,
  productDescription: 'AI-powered outbound calling agent',
  language: 'English',
  existingScript: '',
  knowledgeBase: [],
  caller: { firstName: 'Rahul', company: 'TechCorp' },
};

// ─── Test 1: Stage does NOT advance before customer responds ──────────────────

section('Test 1 — Hard gate: stage CANNOT advance before customer responds');

{
  const { machine, evaluator } = ConversationStateFactory.create({});

  // AI greets (agent turn 1)
  let state = machine.dispatch(Signals.agentTurnCompleted(true));
  let action = evaluator.evaluate(state);

  assert(
    state.currentStage === ConversationStage.GREETING,
    'Stage stays GREETING after 1 agent turn (customer has not spoken yet)',
    `Got: ${state.currentStage}`
  );
  assert(
    !action.shouldAdvanceStage,
    'Evaluator does NOT recommend advance — customer has not spoken',
    `shouldAdvanceStage=${action.shouldAdvanceStage}, rationale="${action.rationale}"`
  );
  assert(
    state.customerHasRespondedThisStage === false,
    'customerHasRespondedThisStage is false',
    `Got: ${state.customerHasRespondedThisStage}`
  );
  assert(
    state.customerTurnsInCurrentStage === 0,
    'customerTurnsInCurrentStage is 0',
    `Got: ${state.customerTurnsInCurrentStage}`
  );

  // Even after many agent turns — still blocked without customer response
  machine.dispatch(Signals.agentTurnCompleted(true));
  machine.dispatch(Signals.agentTurnCompleted(true));
  state = machine.dispatch(Signals.agentTurnCompleted(true));
  action = evaluator.evaluate(state);
  assert(
    !action.shouldAdvanceStage,
    'Still blocked after 4 agent turns — customer MUST respond before advance',
    `shouldAdvanceStage=${action.shouldAdvanceStage}`
  );
  assert(
    state.currentStage === ConversationStage.GREETING,
    'Still in GREETING stage after 4 agent turns without customer response',
    `Got: ${state.currentStage}`
  );
}

// ─── Test 2: Stage advances correctly AFTER customer responds ─────────────────

section('Test 2 — Stage advances correctly after customer speaks + min turns met');

{
  const { machine, evaluator } = ConversationStateFactory.create({});

  // Agent says greeting (turn 1)
  let state = machine.dispatch(Signals.agentTurnCompleted(true));

  // Customer speaks — VAD commits buffer
  state = machine.dispatch(Signals.customerTurnCompleted());
  assert(
    state.customerHasRespondedThisStage === true,
    'customerHasRespondedThisStage becomes true after customer speaks',
    `Got: ${state.customerHasRespondedThisStage}`
  );
  assert(
    state.customerTurnsInCurrentStage === 1,
    'customerTurnsInCurrentStage is 1',
    `Got: ${state.customerTurnsInCurrentStage}`
  );

  // Agent says call purpose (turn 2 — meets minTurns=2)
  state = machine.dispatch(Signals.agentTurnCompleted(true));
  let action = evaluator.evaluate(state);
  assert(
    action.shouldAdvanceStage === true,
    'Evaluator recommends ADVANCE_STAGE after customer responded AND minTurns(2) met',
    `shouldAdvanceStage=${action.shouldAdvanceStage}, rationale="${action.rationale}"`
  );

  state = machine.dispatch(Signals.advanceStage());
  assert(
    state.currentStage === ConversationStage.RAPPORT,
    'Stage advanced from GREETING → RAPPORT',
    `Got: ${state.currentStage}`
  );
}

// ─── Test 3: GREETING → RAPPORT → DISCOVERY with gate checks ─────────────────

section('Test 3 — Greeting and Rapport funnel with customer gate at each stage');

{
  const { machine, evaluator } = ConversationStateFactory.create({});

  // ── GREETING ──────────────────────────────────────────────────────────────
  // No advance before customer speaks
  machine.dispatch(Signals.agentTurnCompleted(true));
  let action = evaluator.evaluate(machine.getState());
  assert(!action.shouldAdvanceStage, '[GREETING] Blocked before customer responds');

  // Customer speaks → gate unlocked
  machine.dispatch(Signals.customerTurnCompleted());
  assert(machine.getState().customerHasRespondedThisStage, '[GREETING] Gate unlocked after customer speaks');

  // Second agent turn → advance
  machine.dispatch(Signals.agentTurnCompleted(true));
  action = evaluator.evaluate(machine.getState());
  assert(action.shouldAdvanceStage, '[GREETING] Advance recommended after customer responded + 2 agent turns');

  machine.dispatch(Signals.advanceStage());
  assert(machine.currentStage === ConversationStage.RAPPORT, '[GREETING] → RAPPORT ✓');

  // ── RAPPORT ───────────────────────────────────────────────────────────────
  // New stage — customer gate resets
  machine.dispatch(Signals.agentTurnCompleted(true));
  action = evaluator.evaluate(machine.getState());
  assert(!action.shouldAdvanceStage, '[RAPPORT] Blocked before customer responds in new stage');
  assert(
    machine.getState().customerHasRespondedThisStage === false,
    '[RAPPORT] customerHasRespondedThisStage resets to false in new stage'
  );

  // Customer speaks → gate unlocked
  machine.dispatch(Signals.customerTurnCompleted());
  assert(machine.getState().customerHasRespondedThisStage, '[RAPPORT] Gate unlocked after customer speaks');

  // Second agent turn → advance
  machine.dispatch(Signals.agentTurnCompleted(true));
  action = evaluator.evaluate(machine.getState());
  assert(action.shouldAdvanceStage, '[RAPPORT] Advance recommended after customer responded + 2 agent turns');

  machine.dispatch(Signals.advanceStage());
  assert(machine.currentStage === ConversationStage.DISCOVERY, '[RAPPORT] → DISCOVERY ✓');
}

// ─── Test 4: DISCOVERY — requires pain point signal to advance ────────────────

section('Test 4 — Discovery: requires a pain point AND customer response to advance');

{
  const { machine, evaluator } = ConversationStateFactory.create({});
  // Fast-forward to DISCOVERY
  machine.dispatch(Signals.agentTurnCompleted(true));
  machine.dispatch(Signals.customerTurnCompleted());
  machine.dispatch(Signals.agentTurnCompleted(true));
  machine.dispatch(Signals.advanceStage()); // → RAPPORT
  machine.dispatch(Signals.agentTurnCompleted(true));
  machine.dispatch(Signals.customerTurnCompleted());
  machine.dispatch(Signals.agentTurnCompleted(true));
  machine.dispatch(Signals.advanceStage()); // → DISCOVERY

  assert(machine.currentStage === ConversationStage.DISCOVERY, 'Now in DISCOVERY stage');

  // No pain point yet — evaluator cannot advance
  machine.dispatch(Signals.agentTurnCompleted(true));
  machine.dispatch(Signals.customerTurnCompleted()); // customer responds
  machine.dispatch(Signals.agentTurnCompleted(true));
  let action = evaluator.evaluate(machine.getState());
  assert(!action.shouldAdvanceStage, '[DISCOVERY] Blocked — no pain point identified yet');
  assert(machine.currentStage === ConversationStage.DISCOVERY, '[DISCOVERY] Still in Discovery');

  // AI identifies a pain point from customer's response
  machine.dispatch(Signals.painPointIdentified('Difficulty managing outbound calls at scale'));
  action = evaluator.evaluate(machine.getState());
  assert(action.shouldAdvanceStage, '[DISCOVERY] Advance recommended after pain point identified + customer responded');

  machine.dispatch(Signals.advanceStage());
  assert(machine.currentStage === ConversationStage.QUALIFICATION, '[DISCOVERY] → QUALIFICATION ✓');
}

// ─── Test 5: QUALIFICATION — requires specific data fields to advance ─────────

section('Test 5 — Qualification: requires decision-maker + budget + timeline');

{
  const { machine, evaluator } = ConversationStateFactory.create({});
  // Fast-forward to QUALIFICATION
  machine.dispatch(Signals.agentTurnCompleted(true));
  machine.dispatch(Signals.customerTurnCompleted());
  machine.dispatch(Signals.agentTurnCompleted(true));
  machine.dispatch(Signals.advanceStage()); // → RAPPORT
  machine.dispatch(Signals.agentTurnCompleted(true));
  machine.dispatch(Signals.customerTurnCompleted());
  machine.dispatch(Signals.agentTurnCompleted(true));
  machine.dispatch(Signals.advanceStage()); // → DISCOVERY
  machine.dispatch(Signals.agentTurnCompleted(true));
  machine.dispatch(Signals.customerTurnCompleted());
  machine.dispatch(Signals.agentTurnCompleted(true));
  machine.dispatch(Signals.painPointIdentified('Need better call automation'));
  machine.dispatch(Signals.advanceStage()); // → QUALIFICATION

  assert(machine.currentStage === ConversationStage.QUALIFICATION, 'Now in QUALIFICATION stage');

  // No data yet — blocked
  machine.dispatch(Signals.agentTurnCompleted(true));
  machine.dispatch(Signals.customerTurnCompleted());
  machine.dispatch(Signals.agentTurnCompleted(true));
  let action = evaluator.evaluate(machine.getState());
  assert(!action.shouldAdvanceStage, '[QUALIFICATION] Blocked — no qualification data yet');

  // Gather all three required fields
  machine.dispatch(Signals.qualificationData('decisionMaker', true));
  machine.dispatch(Signals.qualificationData('budget', '₹50,000/month'));
  machine.dispatch(Signals.qualificationData('timeline', 'within 3 months'));

  action = evaluator.evaluate(machine.getState());
  assert(action.shouldAdvanceStage, '[QUALIFICATION] Advance recommended once all 3 fields gathered');

  machine.dispatch(Signals.advanceStage());
  assert(machine.currentStage === ConversationStage.PRESENTATION, '[QUALIFICATION] → PRESENTATION ✓');
}

// ─── Test 6: TurnControlPolicy is in the generated system prompt ──────────────

section('Test 6 — TurnControlPolicy rules are in the generated system prompt');

{
  const builder = new ConversationPolicyBuilder(new SalesConversationPolicy());
  const prompt = builder.build(MOCK_POLICY_CTX);

  assert(prompt.includes('TURN CONTROL'),             'Prompt contains "TURN CONTROL" section');
  assert(prompt.includes('STOP after every single response'), 'Prompt: "STOP after every single response"');
  assert(prompt.includes('NEVER answer your own questions'),  'Prompt: "NEVER answer your own questions"');
  assert(prompt.includes('NEVER generate a hypothetical customer answer'), 'Prompt: "NEVER generate a hypothetical customer answer"');
  assert(prompt.includes('LIVE TWO-WAY PHONE CALL'),  'Prompt: "LIVE TWO-WAY PHONE CALL" reminder');
  assert(prompt.includes('YOU STOP HERE'),             'Greeting example uses "[YOU STOP HERE]" placeholders');
  assert(!prompt.match(/^Customer:/m),                 'No raw "Customer:" dialogue lines in prompt');
}

// ─── Test 7: Stage minTurns values ───────────────────────────────────────────

section('Test 7 — Stage minTurns are ≥ 2 for key stages');

{
  const { STAGE_METADATA } = await import('./conversation-state/ConversationStage.js');

  const checks: Array<[ConversationStage, number]> = [
    [ConversationStage.GREETING,      2],
    [ConversationStage.RAPPORT,       2],
    [ConversationStage.DISCOVERY,     2],
    [ConversationStage.QUALIFICATION, 2],
  ];

  for (const [stage, min] of checks) {
    const meta = STAGE_METADATA[stage];
    assert(
      meta.minTurns >= min,
      `${stage} minTurns=${meta.minTurns} (≥ ${min})`,
      `Got: ${meta.minTurns}`
    );
  }
}

// ─── Test 8: Customer turns reset per stage ───────────────────────────────────

section('Test 8 — Customer turn count resets properly when entering a new stage');

{
  const { machine } = ConversationStateFactory.create({});

  // GREETING: customer speaks twice
  machine.dispatch(Signals.agentTurnCompleted(true));
  machine.dispatch(Signals.customerTurnCompleted());
  machine.dispatch(Signals.customerTurnCompleted());
  machine.dispatch(Signals.agentTurnCompleted(true));

  const greetingState = machine.getState();
  assert(
    greetingState.customerTurnsInCurrentStage === 2,
    'GREETING: 2 customer turns recorded',
    `Got: ${greetingState.customerTurnsInCurrentStage}`
  );

  // Advance to RAPPORT
  machine.dispatch(Signals.advanceStage());

  // RAPPORT: customer turns should start at 0
  const rapportState = machine.getState();
  assert(
    rapportState.customerTurnsInCurrentStage === 0,
    'RAPPORT: customerTurnsInCurrentStage resets to 0 in new stage',
    `Got: ${rapportState.customerTurnsInCurrentStage}`
  );
  assert(
    rapportState.customerHasRespondedThisStage === false,
    'RAPPORT: customerHasRespondedThisStage is false in new stage',
    `Got: ${rapportState.customerHasRespondedThisStage}`
  );
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n' + '━'.repeat(52));
const total = passed + failed;
if (failed === 0) {
  console.log(`${GREEN}${BOLD}✓ All ${total} assertions passed — conversation flow is correct${RESET}`);
} else {
  console.log(`${RED}${BOLD}✗ ${failed} of ${total} assertions failed${RESET}`);
}
console.log('━'.repeat(52));

process.exit(failed > 0 ? 1 : 0);
