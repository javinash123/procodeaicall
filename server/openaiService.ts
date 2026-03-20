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

export interface CampaignData {
  name?: string;
  goal: string;
  script?: string;
  additionalContext?: string;
  knowledgeBaseText?: string;
}

export interface AIResponse {
  reply: string;
}

export async function generateAIResponse(
  conversationHistory: ConversationMessage[],
  userInput: string,
  campaignData: CampaignData
): Promise<AIResponse> {
  const { name, goal, script, additionalContext, knowledgeBaseText } = campaignData;

  const goalDescriptions: Record<string, string> = {
    sales: "close sales and generate revenue by understanding the prospect's needs and presenting value",
    support: "resolve customer issues efficiently and empathetically, ensuring satisfaction",
    survey: "gather honest feedback by asking clear, neutral questions and listening carefully",
    appointment: "schedule appointments by finding suitable times and confirming availability",
  };

  const goalDescription = goalDescriptions[goal] || goal;

  const systemPrompt = `You are an AI calling agent for the campaign "${name || "Unnamed Campaign"}".

Your primary goal: ${goalDescription}.

${script ? `Opening script to follow (adapt naturally as the conversation evolves):\n${script}\n` : ""}
${additionalContext ? `Business context:\n${additionalContext}\n` : ""}
${knowledgeBaseText ? `Knowledge base (use for accurate answers):\n${knowledgeBaseText.slice(0, 3000)}\n` : ""}

Conversation guidelines:
- Stay strictly in character as a professional, helpful calling agent
- Keep responses concise and conversational (2-4 sentences max)
- Use the conversation history to maintain context and avoid repeating yourself
- Acknowledge what the user said before responding
- Steer the conversation toward the campaign goal naturally
- If asked something outside your knowledge base, politely say you'll follow up
- Never break character or mention that you are an AI unless directly asked`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user", content: userInput },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
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
