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

export async function generateAIResponse(
  conversationHistory: ConversationMessage[],
  userInput: string,
  campaignData: CampaignData
): Promise<AIResponse> {
  const { goal, additionalContext, ai_generated_script, knowledge_base, knowledgeBaseText, leadData } = campaignData;

  const resolvedScript = ai_generated_script && leadData
    ? replaceScriptVariables(ai_generated_script, leadData)
    : (ai_generated_script || "");

  const knowledgeBaseContent = knowledge_base || knowledgeBaseText || "";

  const prompt = `
You are a professional AI ${goal === "Customer Support" ? "support" : "sales"} agent.

Business Context:
${additionalContext || ""}

Campaign Goal:
${goal}

IMPORTANT RULES:
- Do NOT repeat introduction again if conversation has started
- Do NOT repeat the same question again
- Avoid asking identical questions multiple times
- Keep responses short (1–2 lines max)
- Be natural and conversational
- Always move conversation forward
- Handle objections smartly
- If unsure, give a helpful answer without saying "not in knowledge base"
- Your goal is to qualify the lead and move towards booking a call/demo/visit

Script:
${resolvedScript}

Knowledge Base:
${knowledgeBaseContent.slice(0, 3000)}

Conversation so far:
${JSON.stringify(conversationHistory)}

User said:
"${userInput}"

Respond like a real human agent.
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 300,
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
