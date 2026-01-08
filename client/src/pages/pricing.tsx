import { useQuery } from "@tanstack/react-query";
import { type Plan, type Feature } from "@shared/schema";
import { Check, X, Loader2, Phone, MessageSquare, MessageCircle } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";

export default function Pricing() {
  const [, setLocation] = useLocation();
  const { data: plansResponse, isLoading: plansLoading } = useQuery<{ plans: Plan[] }>({ 
    queryKey: ["/api/plans"] 
  });
  const { data: featuresResponse, isLoading: featuresLoading } = useQuery<{ features: Feature[] }>({ 
    queryKey: ["/api/features"] 
  });

  const plans = plansResponse?.plans || [];
  const features = featuresResponse?.features || [];

  const handleGetStarted = (planId: string) => {
    setLocation(`/auth?plan=${planId}`);
  };

  if (plansLoading || featuresLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <section className="py-24 bg-muted/10">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Simple, <span className="text-primary">Transparent</span> Pricing
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            No hidden fees. Scale as you grow. Cancel anytime.
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="container mx-auto px-4 overflow-x-auto">
          <Card className="max-w-6xl mx-auto border-none shadow-none bg-transparent">
            <CardContent className="p-0">
              <Table className="border-collapse">
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b-2">
                    <TableHead className="w-[300px] text-lg font-bold py-6">Features</TableHead>
                    {plans.map((plan) => (
                      <TableHead key={plan._id} className="text-center py-6">
                        <div className="space-y-2">
                          <div className="text-xl font-bold text-foreground">{plan.name}</div>
                          <div className="text-3xl font-bold text-primary">₹{plan.price}</div>
                          <div className="text-sm text-muted-foreground capitalize">{plan.duration}</div>
                          <Button 
                            size="sm" 
                            className="w-full mt-4 hover-elevate active-elevate-2" 
                            variant={plan.name.toLowerCase().includes('growth') ? 'default' : 'outline'}
                            onClick={() => handleGetStarted(plan._id)}
                          >
                            Get Started
                          </Button>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/50">
                    <TableCell className="font-semibold py-4">Credits</TableCell>
                    {plans.map((plan) => (
                      <TableCell key={plan._id} className="text-center font-bold py-4">
                        {plan.credits.toLocaleString()}
                      </TableCell>
                    ))}
                  </TableRow>
                  
                  {/* Rates Row */}
                  <TableRow className="bg-muted/30">
                    <TableCell className="font-semibold py-4">Consumption Rates</TableCell>
                    {plans.map((plan) => (
                      <TableCell key={plan._id} className="py-4">
                        <div className="flex flex-col gap-1 items-center text-xs">
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-primary" />
                            <span>₹{plan.callingRate}/min</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MessageSquare className="h-3 w-3 text-primary" />
                            <span>₹{plan.smsRate}/msg</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MessageCircle className="h-3 w-3 text-primary" />
                            <span>₹{plan.whatsappRate}/msg</span>
                          </div>
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>

                  {features.map((feature) => (
                    <TableRow key={feature._id} className="hover:bg-muted/30 border-b">
                      <TableCell className="py-4">
                        <div className="font-medium">{feature.name}</div>
                      </TableCell>
                      {plans.map((plan) => {
                        const hasFeature = plan.features?.includes(feature.name);
                        return (
                          <TableCell key={plan._id} className="text-center py-4">
                            {hasFeature ? (
                              <Check className="h-5 w-5 text-primary mx-auto" />
                            ) : (
                              <X className="h-5 w-5 text-muted-foreground/30 mx-auto" />
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="py-24 bg-muted/20">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible>
            <AccordionItem value="item-1">
              <AccordionTrigger>Does the AI really sound human?</AccordionTrigger>
              <AccordionContent>
                Yes. We use the latest generative audio models that include breath, pause, and intonation variations. Most prospects cannot tell they are speaking to an AI.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>Can I upload my own leads?</AccordionTrigger>
              <AccordionContent>
                Absolutely. You can upload CSV files or connect your CRM (Salesforce, HubSpot, etc.) to sync leads automatically.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>Is it legal to use AI for calling?</AccordionTrigger>
              <AccordionContent>
                Yes, but you must comply with local regulations like TCPA (in the US). Our platform includes compliance tools to help you manage consent and do-not-call lists.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>What happens if the AI doesn't know the answer?</AccordionTrigger>
              <AccordionContent>
                You can configure "fallback" rules. If confidence is low, the AI can politely offer to have a human specialist call back, or transfer the call immediately if a human is available.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>
    </div>
  );
}
