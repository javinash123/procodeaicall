import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, User, Send, Trash2, Info } from "lucide-react";

interface Message {
  role: "user" | "ai";
  text: string;
}

interface TestAIResponse {
  reply: string;
  campaign: {
    id: string;
    name: string;
    goal: string;
  };
}

const DEFAULT_CAMPAIGN_ID = "69bd5558a57e122161197eab";

export default function TestAI() {
  const [campaignId, setCampaignId] = useState(DEFAULT_CAMPAIGN_ID);
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<TestAIResponse["campaign"] | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const mutation = useMutation({
    mutationFn: async (input: string) => {
      const res = await apiRequest("POST", "/api/test-ai", {
        userInput: input,
        campaignId: campaignId.trim() || undefined,
      });
      return res.json() as Promise<TestAIResponse>;
    },
    onSuccess: (data) => {
      setActiveCampaign(data.campaign);
      setMessages((prev) => [...prev, { role: "ai", text: data.reply }]);
    },
    onError: (err: any) => {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: `Error: ${err.message || "Something went wrong"}` },
      ]);
    },
  });

  const handleSend = () => {
    const trimmed = userInput.trim();
    if (!trimmed || mutation.isPending) return;
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setUserInput("");
    mutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, mutation.isPending]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-2xl space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">AI Response Tester</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Test how the AI agent responds within a specific campaign context
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Info className="w-4 h-4 text-muted-foreground" />
              Campaign Configuration
            </CardTitle>
            <CardDescription className="text-xs">
              Leave blank to auto-select the first available campaign
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="campaign-id" className="text-xs">Campaign ID</Label>
            <Input
              id="campaign-id"
              data-testid="input-campaign-id"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              placeholder="Enter campaign ID or leave blank"
              className="font-mono text-xs"
            />
            {activeCampaign && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground">Active:</span>
                <span className="text-xs font-medium">{activeCampaign.name}</span>
                <Badge variant="secondary" className="text-xs capitalize">{activeCampaign.goal}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Conversation</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="min-h-[300px] max-h-[400px] overflow-y-auto space-y-3 pr-1">
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                  Send a message to start the conversation
                </div>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  data-testid={`message-${msg.role}-${i}`}
                  className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "ai" && (
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {msg.text}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}
              {mutation.isPending && (
                <div className="flex gap-2 justify-start">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="bg-muted rounded-xl px-3 py-2 text-sm text-muted-foreground flex items-center gap-1">
                    <span className="animate-pulse">Thinking</span>
                    <span className="animate-bounce delay-75">.</span>
                    <span className="animate-bounce delay-150">.</span>
                    <span className="animate-bounce delay-300">.</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Textarea
                data-testid="input-user-message"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                className="resize-none text-sm min-h-[60px] max-h-[120px]"
                disabled={mutation.isPending}
              />
              <div className="flex flex-col gap-2">
                <Button
                  data-testid="button-send"
                  onClick={handleSend}
                  disabled={!userInput.trim() || mutation.isPending}
                  size="icon"
                  className="h-10 w-10"
                >
                  <Send className="w-4 h-4" />
                </Button>
                <Button
                  data-testid="button-clear"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => {
                    setMessages([]);
                    setActiveCampaign(null);
                  }}
                  disabled={messages.length === 0}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
