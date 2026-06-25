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

  const systemPrompt = `You are an expert AI calling script writer. Your job is to create professional, natural-sounding phone call scripts for AI agents.

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
 * Generate a short opening greeting for when the call connects.
 * Extracts the first sentence of the campaign script, or generates one.
 * Keeps it to a single natural sentence — no monologue.
 */
export async function generateGreeting(campaignData: CampaignData): Promise<string> {
  const { name, goal, ai_generated_script, additionalContext } = campaignData;

  // Try to use the first sentence of the campaign script as the greeting
  const script = (ai_generated_script || "").trim();
  if (script) {
    // Take text up to the first sentence-ending punctuation
    const match = script.match(/^(.{20,150}?[.!?])/);
    if (match) {
      // Replace {name}/{company} placeholders with neutral alternatives
      return match[1]
        .replace(/\{name\}/gi, "there")
        .replace(/\{company\}/gi, "your company")
        .trim();
    }
  }

  // Fallback: generate a greeting via GPT
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are an AI phone agent. Write ONE short, natural opening sentence to greet the person who just answered the phone. Maximum 15 words. No placeholders. Just the greeting text, nothing else.",
      },
      {
        role: "user",
        content: `Campaign: ${name || "Sales"}\nGoal: ${goal}\nContext: ${additionalContext || ""}`,
      },
    ],
    max_tokens: 50,
    temperature: 0.6,
  });

  return (
    response.choices[0]?.message?.content?.trim() ||
    `Hello! I'm calling about an exciting opportunity. Is this a good time?`
  );
}

/**
 * Generate a conversational AI reply during a live phone call.
 * Uses proper system/user/assistant chat format.
 * Strictly 1–2 sentences — no monologues.
 */
export async function generateAIResponse(
  conversationHistory: ConversationMessage[],
  userInput: string,
  campaignData: CampaignData
): Promise<AIResponse> {
  const { name, goal, additionalContext, ai_generated_script, knowledge_base, knowledgeBaseText, leadData } = campaignData;

  const resolvedScript = ai_generated_script && leadData
    ? replaceScriptVariables(ai_generated_script, leadData)
    : (ai_generated_script || "");

  const knowledgeBaseContent = knowledge_base || knowledgeBaseText || "";

  const systemPrompt = `You are a professional AI ${goal === "Customer Support" ? "support" : "sales"} agent on a LIVE phone call.

${name ? `Campaign: ${name}` : ""}
Goal: ${goal}
${additionalContext ? `About us: ${additionalContext}` : ""}
${resolvedScript ? `Call script (use as a guide, not word-for-word):\n${resolvedScript}` : ""}
${knowledgeBaseContent ? `Knowledge base:\n${knowledgeBaseContent.slice(0, 2000)}` : ""}

STRICT PHONE CALL RULES — follow these exactly:
1. This is a LIVE PHONE CALL. Reply like a real human agent speaking out loud.
2. Maximum 2 SHORT sentences per reply. Never write more.
3. End every reply with ONE natural question to keep the conversation going.
4. Never read out the full script — have a real back-and-forth conversation.
5. Never repeat something you already said earlier in the conversation.
6. No bullet points, lists, bold text, or formatting — only natural spoken words.
7. If they say they're busy, politely ask when you can call back.
8. If they ask something outside the script, answer helpfully and briefly.`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userInput },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini", // 3-5x faster than gpt-4o, ideal for short conversational replies
    messages,
    temperature: 0.7,
    max_tokens: 80, // ~1–2 short spoken sentences
  });

  const reply = response.choices[0]?.message?.content?.trim() || "";
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
