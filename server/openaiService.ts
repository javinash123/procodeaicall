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
 *   Turn 6+   → Drive to close (visit, callback, next step)
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
  const turnCount = conversationHistory.length; // includes the user turn we're replying to

  // Classify what the user just said
  const u = userInput.trim().toLowerCase();
  const isAffirmative   = /^(yes|yeah|yep|sure|ok|okay|go ahead|please|yea|mhm|of course|absolutely|definitely|fine|alright|right|correct|exactly|totally|sounds good|great|perfect)[\s.!,]*$/i.test(u);
  const wantsSchedule   = /schedul|book|visit|appointment|meet|come over|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s*(am|pm|:)/i.test(u);
  const wantsInfo       = /tell me more|more about|details|how much|price|cost|location|where|ameniti|size|bhk|bedroom|floor|parking|gym|pool|lift|elevator|square|sq|area/i.test(u);
  const asksQuestion    = u.endsWith("?");
  const isShort         = userInput.trim().split(/\s+/).length <= 4;

  // Count actual user turns (not AI turns) to determine stage
  const userTurnCount = conversationHistory.filter(m => m.role === "user").length;

  // Pick the right instruction for this turn
  let stageInstruction: string;
  if (userTurnCount <= 1) {
    // First user message is usually just "yes" / "sure" — permission to proceed.
    // Respond by asking ONE qualifying question only. No product pitch yet.
    stageInstruction = `STAGE — QUALIFY (caller's first response):
The caller just gave permission to continue (e.g. "yes", "sure"). Do NOT pitch product details yet.
Ask exactly ONE short open question to understand their situation.
Good examples: "Are you looking for a 2BHK or 3BHK?" / "Is this for yourself or as an investment?" / "What area are you considering?"
Do NOT ask about scheduling a visit at this stage — that comes much later.`;
  } else if (userTurnCount <= 4) {
    stageInstruction = `STAGE — DISCOVER & PITCH SPECIFICS:
Answer their question directly with ONE specific fact from the knowledge base.
Then ask ONE question that advances the conversation.
Do NOT combine multiple topics in one reply — one piece of information per turn.
Do NOT pitch everything at once.`;
  } else if (userTurnCount <= 7) {
    stageInstruction = `STAGE — BUILD INTEREST:
The caller has engaged for several turns — they are interested.
Offer a concrete next step: suggest a site visit, a callback, or a brochure.
Keep it conversational — do NOT pressure.`;
  } else {
    stageInstruction = `STAGE — CLOSE:
Drive toward a specific commitment: book a visit, confirm a callback time, or get their name.
If they mention a day/time, confirm it immediately and ask for their name.
Do not introduce new product details — focus only on the next step.`;
  }

  // Special override instructions for detected intent.
  // On userTurnCount === 1 the caller just gave permission ("yes/sure") —
  // skip the affirmative override so it doesn't conflict with the QUALIFY stage.
  let intentInstruction = "";
  if (wantsSchedule) {
    intentInstruction = `\n⚡ SCHEDULE INTENT DETECTED: The caller wants to book a visit or appointment.
Confirm the time they mentioned, ask for their name, and commit. This is the BEST outcome of the call.
Example: "Monday 11am works perfectly — may I get your name to confirm the booking?"`;
  } else if (isAffirmative && !asksQuestion && userTurnCount > 1) {
    // Only activate affirmative shortcut after the first real exchange;
    // on turn 1 the "yes" just means "go ahead" and the QUALIFY stage handles it.
    intentInstruction = `\n⚡ AFFIRMATIVE RESPONSE: They said yes / agreed to your last offer or question.
Immediately deliver the next piece of information — do NOT ask "are you sure?" or repeat yourself.`;
  } else if (wantsInfo) {
    intentInstruction = `\n⚡ INFO REQUEST: Give 1-2 specific facts from the knowledge base right now. Do not deflect — actually answer the question.`;
  }

  const systemPrompt = `You are a professional human ${isSupport ? "customer support agent" : "sales agent"} on a LIVE outbound phone call. Every word you say is spoken aloud — no text formatting, no lists, no markdown.

${goal ? `Campaign goal: ${goal}` : ""}
${additionalContext ? `Business info: ${additionalContext}` : ""}
${kb ? `━━━ PROPERTY KNOWLEDGE BASE — your authoritative source of facts ━━━\n${kb.slice(0, 2500)}\n━━━ END KNOWLEDGE BASE ━━━` : ""}
${resolvedScript ? `Reference talking points (do NOT recite verbatim — adapt to the conversation):\n${resolvedScript}` : ""}

━━━ ABSOLUTE RULES — violating ANY of these is an error ━━━

RULE 1 — LENGTH (hardest constraint):
• Caller said yes / sure / ok / agreed / great → EXACTLY 1 short sentence — no more.
• All other inputs → MAXIMUM 2 SHORT sentences. Count before you output.
• ONE topic per turn. Never combine price + location + amenities in one reply.
• Never exceed 2 sentences. Ever. The model will be penalised for exceeding this.

RULE 2 — FORMAT:
• Plain spoken English only. No bullets, no lists, no dashes as list items, no markdown.
• Do NOT start with filler openers: "Great!", "Absolutely!", "Of course!", "Certainly!", "Sure!".
• Never re-introduce yourself — the greeting already did this.

RULE 3 — ABSOLUTELY FORBIDDEN PHRASES (treat as fatal errors):
• "You're welcome" — NEVER say this unless the caller's VERY LAST message was explicitly "thank you" or "thanks".
• "Thank you for your time" / "Have a great day" / "Goodbye" / any farewell — YOU do not end the call. Only say goodbye if the caller explicitly says they want to stop.
• "I can't access websites" / "I don't have access to the internet" / "I'm unable to browse" / "I can't look that up" — NEVER say this. You are a human sales agent who knows this property. You don't browse websites; you know the facts.
• "Before you go" — implies call is ending prematurely.
• "I look forward to helping you" — robotic sign-off; never use.
• "How can I assist / help you?" — generic; gives no value.
• "Is there anything else you'd like to know?" as a reply to a direct question — answer the question FIRST, then optionally offer more.
• Do NOT volunteer discounts unless the caller asks about price.

RULE 4 — CONVERSATION ACCURACY:
• "Yes", "Sure", "OK" = caller agreed. Advance the conversation with ONE new piece of information. Do NOT ask another question or repeat yourself.
• If the caller asks a direct question (amenities, location, price, etc.) — ANSWER it with facts from the knowledge base. If the knowledge base doesn't have the exact detail, say what you DO know and add "I'll confirm that for you" — but NEVER deflect with another question instead of an answer.
• If the caller asks to schedule → immediately help them confirm a time. Ask for their name. Stop pitching.

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
