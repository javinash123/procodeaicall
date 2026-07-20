import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}
// keep backward-compat alias used throughout this file
const openai = { chat: { completions: { create: (...args: Parameters<OpenAI["chat"]["completions"]["create"]>) => getOpenAI().chat.completions.create(...args) } } } as unknown as OpenAI;

export interface CallScriptInput {
  campaignGoal: string;
  existingScript?: string;
  additionalContext?: string;
  campaignName?: string;
  knowledgeBaseText?: string;
}

export interface GeneratedScript {
  script: string;
}

export async function generateCallScript(input: CallScriptInput): Promise<GeneratedScript> {
  const { campaignGoal, existingScript, additionalContext, campaignName, knowledgeBaseText } = input;

  const systemPrompt = `You are an expert AI calling script writer. Create professional, natural-sounding phone call scripts for AI agents.

Guidelines:
- Write in a conversational, friendly tone
- Include personalization placeholders like {name} and {company} where appropriate
- Keep the opening concise and engaging
- Match the tone to the campaign goal
- Structure the script with a clear opening, value proposition, and call-to-action
- Make it sound human and empathetic, not robotic
- If knowledge base content is provided, use it to tailor the script with accurate product/service details
- Keep it under 200 words for the main script`;

  const userPrompt = `Create a professional AI calling script for the following campaign:

Campaign Name: ${campaignName || "Unnamed Campaign"}
Campaign Goal: ${campaignGoal}
${existingScript ? `Existing Script (improve upon this): ${existingScript}` : ""}
${additionalContext ? `Additional Context/Business Information: ${additionalContext}` : ""}
${knowledgeBaseText ? `Knowledge Base (use this for accurate product/service details):\n${knowledgeBaseText.slice(0, 3000)}` : ""}

Return ONLY the call script text, ready to use. Include personalization variables like {name} where appropriate. Do not include any explanations or headers.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  const script = response.choices[0]?.message?.content?.trim() || "";
  return { script };
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LeadData {
  name?: string;
  company?: string;
  phone?: string;
  email?: string;
  [key: string]: string | undefined;
}

export interface CampaignData {
  name?: string;
  goal: string;
  script?: string;
  additionalContext?: string;
  knowledgeBaseText?: string;
  ai_generated_script?: string;
  knowledge_base?: string;
  leadData?: LeadData;
}

export interface AIResponse {
  reply: string;
}

function replaceScriptVariables(text: string, lead: LeadData): string {
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    const value = lead[key as keyof LeadData];
    return value !== undefined && value !== "" ? value : match;
  });
}

/**
 * Short, permission-seeking greeting ONLY — single sentence.
 * No product, price, location, or reason for calling.
 */
export async function generateGreeting(campaignData: CampaignData): Promise<string> {
  const { goal } = campaignData;
  const isSupport = (goal || "").toLowerCase().includes("support");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Write ONE sentence spoken by an AI phone agent at the very start of an outbound call.

RULES (failure to follow any rule = wrong answer):
- One sentence ONLY. Introduce yourself with a first name + ask for a moment of time.
- Do NOT mention the product, service, price, location, company name, or reason for calling.
- Do NOT say more than one sentence. No second clause about anything else.
- Keep it under 12 words total.
- Examples of correct output:
    Hi, this is Sarah — do you have a quick minute?
    Hey, this is James — is now a good time?
    Hi, this is Alex — got a moment to chat?
- Output ONLY the spoken sentence, no quotes.`,
      },
      {
        role: "user",
        content: isSupport ? "support call" : "sales call",
      },
    ],
    max_tokens: 30,
    temperature: 0.3,
  });

  return (
    response.choices[0]?.message?.content?.trim() ||
    "Hi, this is Sarah — do you have a quick minute?"
  );
}

/**
 * Generate a conversational AI reply during a live phone call.
 *
 * Conversation arc:
 *   Turn 1-2  → Qualify (ask 1 short question to understand their situation)
 *   Turn 3-5  → Pitch specifics from knowledge base / script
 *   Turn 6+   → Drive to close (callback, next step, commitment)
 *
 * Hard constraints enforced in prompt:
 *   - Max 1 sentence for confirmations / affirmatives
 *   - Max 2 sentences for information turns
 *   - NEVER dump everything at once
 *   - NEVER use closing language before turn 6
 */
export async function generateAIResponse(
  conversationHistory: ConversationMessage[],
  userInput: string,
  campaignData: CampaignData
): Promise<AIResponse> {
  const {
    name: campaignName,
    goal,
    additionalContext,
    ai_generated_script,
    knowledge_base,
    knowledgeBaseText,
    leadData,
  } = campaignData;

  const resolvedScript = ai_generated_script && leadData
    ? replaceScriptVariables(ai_generated_script, leadData)
    : (ai_generated_script || "");

  const kb = knowledge_base || knowledgeBaseText || "";
  const isSupport = (goal || "").toLowerCase().includes("support");

  // Classify what the user just said
  const u = userInput.trim().toLowerCase();
  const isAffirmative = /^(yes|yeah|yep|sure|ok|okay|go ahead|please|yea|mhm|of course|absolutely|definitely|fine|alright|right|correct|exactly|totally|sounds good|great|perfect)[\s.!,]*$/i.test(u);
  const wantsSchedule = /schedul|book|appointment|meet|call back|callback|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s*(am|pm|:)/i.test(u);
  const wantsInfo     = /tell me more|more about|details|how much|price|cost|what is|how does|explain|describe|what are/i.test(u);
  const asksQuestion  = u.endsWith("?");

  // Count actual user turns (not AI turns) to determine stage
  const userTurnCount = conversationHistory.filter(m => m.role === "user").length;

  // Campaign context for stage instructions
  const campaignContext = additionalContext || campaignName || goal || "our product or service";

  // Pick the right instruction for this turn
  let stageInstruction: string;
  if (userTurnCount <= 1) {
    stageInstruction = `STAGE — UNDERSTAND (caller's first response):
The caller just gave permission to continue. Do NOT pitch details yet.
Ask exactly ONE short open question to understand their current situation or needs related to: ${campaignContext}.
Keep the question short, natural, and conversational — like you'd ask a friend.
Do NOT suggest scheduling anything at this stage.`;
  } else if (userTurnCount <= 4) {
    stageInstruction = `STAGE — INFORM & EXPLORE:
Answer their point or question directly using ONE specific fact from the knowledge base.
Then ask ONE natural follow-up question to advance the conversation.
Do NOT combine multiple topics — one thing per turn.
Do NOT pitch everything at once.`;
  } else if (userTurnCount <= 7) {
    stageInstruction = `STAGE — BUILD INTEREST:
The caller has been engaged for several turns — they are interested.
Offer ONE concrete next step tied to the campaign goal: ${campaignContext}.
Keep it casual and low-pressure — suggest, don't push.`;
  } else {
    stageInstruction = `STAGE — COMMIT:
Steer toward a specific commitment that fits the campaign goal: ${campaignContext}.
If they mention a day/time, confirm it immediately and ask for their name.
Do not introduce new details — focus only on the next step.`;
  }

  // Special override instructions for detected intent
  let intentInstruction = "";
  if (wantsSchedule) {
    intentInstruction = `\n⚡ SCHEDULE INTENT: The caller wants to set up a meeting or callback.
Confirm the time they mentioned, ask for their name, and lock it in. This is the best outcome.
Example: "Tuesday at 3 works perfectly — can I get your name to confirm?"`;
  } else if (isAffirmative && !asksQuestion && userTurnCount > 1) {
    intentInstruction = `\n⚡ AFFIRMATIVE RESPONSE: They agreed. Immediately deliver the next relevant piece of information — do NOT re-ask or repeat yourself.`;
  } else if (wantsInfo) {
    intentInstruction = `\n⚡ INFO REQUEST: Answer directly using a specific fact from the knowledge base. If the KB doesn't cover it exactly, say what you DO know and offer to have someone follow up — never dodge the question with a different question.`;
  }

  const systemPrompt = `You are a professional human ${isSupport ? "customer support representative" : "sales agent"} on a LIVE outbound phone call. Every word you say is spoken aloud — no text formatting, no lists, no markdown.

${goal ? `Campaign goal: ${goal}` : ""}
${additionalContext ? `About the business / product: ${additionalContext}` : ""}
${kb ? `━━━ KNOWLEDGE BASE — use this to answer questions accurately ━━━\n${kb.slice(0, 2500)}\n━━━ END KNOWLEDGE BASE ━━━` : ""}
${resolvedScript ? `Reference talking points (adapt naturally — do NOT read verbatim):\n${resolvedScript}` : ""}

━━━ ABSOLUTE RULES — violating ANY of these is an error ━━━

RULE 1 — LENGTH (hardest constraint):
• Caller said yes / sure / ok / agreed / great → EXACTLY 1 short sentence — no more.
• All other inputs → MAXIMUM 2 SHORT sentences. Count before you output.
• ONE topic per turn. Never combine multiple facts in one reply.
• Never exceed 2 sentences. Ever.

RULE 2 — FORMAT & TONE:
• Plain spoken English only. No bullets, no lists, no dashes, no markdown.
• Do NOT start with hollow openers: "Great!", "Absolutely!", "Of course!", "Certainly!", "Sure!".
• Never re-introduce yourself — the greeting already did this.
• Speak the way a confident, friendly human professional would on the phone.
• Use contractions naturally: "I'm", "we've", "that's", "don't".
• Vary your sentence starters — never open two replies the same way.

RULE 3 — ABSOLUTELY FORBIDDEN PHRASES:
• "You're welcome" — only if the caller literally just said "thank you" or "thanks".
• "Thank you for your time" / "Have a great day" / "Goodbye" / any farewell — never say these unless the caller is ending the call.
• "I can't access websites" / "I don't have access to the internet" / "I'm just an AI" — NEVER. You are a knowledgeable human agent.
• "Before you go" — implies the call is ending prematurely.
• "I look forward to helping you" — robotic sign-off, never use.
• "How can I assist / help you?" — gives no value.

RULE 4 — HANDLING QUESTIONS:
• "Yes", "Sure", "OK" = they agreed. Advance with ONE new piece of information — do NOT ask another question or repeat yourself.
• If the caller asks a direct question — ANSWER it with a fact from the knowledge base. If you don't have the exact detail, say "I don't have that specific detail handy, but I can make sure our team gets that to you" and move on. Never dodge a question with another question.
• For general questions unrelated to the campaign — answer briefly and naturally as a knowledgeable person would ("That's a good one — from what I know, [brief answer]. But the main thing I wanted to share with you today...") then bridge back to the goal.
• If the caller asks to schedule something → help them confirm a time, ask for their name, stop pitching.

${stageInstruction}
${intentInstruction}`;

  // Build messages list.  Some callers (Exotel stream handler, wsServer) push the
  // latest user turn into conversationHistory BEFORE calling this function.
  // Others (REST API routes) pass the history without it and rely on userInput.
  // We guard against duplicating the message: if history already ends with the
  // current user input, do not append it again.
  const lastEntry = conversationHistory[conversationHistory.length - 1];
  const userAlreadyInHistory =
    lastEntry?.role === "user" && lastEntry?.content === userInput;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    // Append current user turn only when it isn't already the last history entry
    ...(userAlreadyInHistory ? [] : [{ role: "user" as const, content: userInput }]),
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    temperature: 0.2,   // very low — consistent, no hallucination, follows rules reliably
    max_tokens: 80,     // ~60 words = 1-2 short spoken sentences; hard cap prevents dumps
  });

  const raw = response.choices[0]?.message?.content?.trim() || "";

  // Safety net: if GPT still produces >2 sentences, truncate to 2
  const sentences = raw.match(/[^.!?]+[.!?]+/g) || [raw];
  const reply = sentences.slice(0, 2).join(" ").trim();

  return { reply };
}

export async function generateTextResponse(prompt: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 1000,
  });

  return response.choices[0]?.message?.content?.trim() || "";
}

export async function testOpenAI(): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Say exactly: Hello from AI" }],
    max_tokens: 20,
  });

  return response.choices[0]?.message?.content?.trim() || "No response";
}
