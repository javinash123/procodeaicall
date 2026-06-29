import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

  // Pick the right instruction for this turn
  let stageInstruction: string;
  if (turnCount <= 2) {
    stageInstruction = `STAGE — QUALIFY (early in call):
Ask ONE short question to understand the caller's situation before pitching anything.
Do NOT give product details yet.
Example: "Are you looking for a 2BHK or 3BHK?" or "Is this for yourself or an investment?"`;
  } else if (turnCount <= 5) {
    stageInstruction = `STAGE — PITCH SPECIFICS:
Answer their question or give 1-2 specific facts from the knowledge base / script.
Then ask one question that moves toward a visit or commitment.
Do NOT pitch everything at once — one topic per turn.`;
  } else {
    stageInstruction = `STAGE — CLOSE:
Drive toward a specific next step: book a site visit, schedule a callback, or get their name to confirm.
If they want to visit, confirm the time and ask for their name. Do not introduce new product details now.`;
  }

  // Special override instructions for detected intent
  let intentInstruction = "";
  if (wantsSchedule) {
    intentInstruction = `\n⚡ SCHEDULE INTENT DETECTED: The caller wants to book a visit or appointment.
Confirm the time they mentioned, ask for their name, and commit. This is the BEST outcome of the call.
Example: "Monday 11am works perfectly — may I get your name to confirm the booking?"`;
  } else if (isAffirmative && !asksQuestion) {
    intentInstruction = `\n⚡ AFFIRMATIVE RESPONSE: They said yes / agreed to your last offer or question.
Immediately deliver the next piece of information you were going to share — don't ask "are you sure?" or repeat your offer.`;
  } else if (wantsInfo) {
    intentInstruction = `\n⚡ INFO REQUEST: Give 2 specific facts from the knowledge base right now. Do not say "let me know if you have questions" or "how can I help?" — actually answer.`;
  }

  const systemPrompt = `You are a professional AI ${isSupport ? "customer support agent" : "sales agent"} on a LIVE outbound phone call. Every word you say is spoken aloud.

${goal ? `Goal: ${goal}` : ""}
${additionalContext ? `Business info: ${additionalContext}` : ""}
${resolvedScript ? `Talking points (reference only — do not recite verbatim):\n${resolvedScript}` : ""}
${kb ? `Knowledge base (use for accurate facts):\n${kb.slice(0, 1500)}` : ""}

━━━ STRICT OUTPUT RULES — read before every response ━━━

LENGTH (most important rule):
• If the caller said yes / sure / ok / agreed → reply in EXACTLY 1 short sentence.
• For all other turns → maximum 2 SHORT sentences. Count your sentences before outputting.
• Never exceed 2 sentences. Ever.

FORMAT:
• Spoken words only — no bullet points, no lists, no markdown, no asterisks.
• Do NOT start with filler openers: "Great!", "Absolutely!", "Of course!", "Certainly!", "Sure!".

FORBIDDEN PHRASES (will destroy caller trust if used):
• "Before you go" — do NOT say this; it implies the call is ending.
• "I look forward to helping you" — do NOT say this; it sounds like a sign-off.
• "How can I assist you?" — do NOT say this; it's generic and gives no value.
• "Could you clarify what you mean?" — do NOT say this unless genuinely ambiguous.
• "You're welcome" — only say this if the caller said "thank you".
• Never re-introduce yourself. You introduced yourself in the greeting already.

CONVERSATION ACCURACY:
• "Yes", "Sure", "OK" = they agreed. Move forward. Do NOT ask another question.
• If they ask about something you already mentioned (like amenities), give MORE specific detail — do not say you already covered it.
• If they want to schedule, stop pitching and help them book.

${stageInstruction}
${intentInstruction}`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userInput },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    temperature: 0.25,  // very low — consistent, no hallucination, follows rules reliably
    max_tokens: 55,     // ~40 words = 1-2 short spoken sentences; hard cap prevents dumps
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
