import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, HelpCircle } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function Pricing() {
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
        <div className="container mx-auto px-4">
           <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
             {/* Starter */}
             <Card className="flex flex-col">
               <CardHeader>
                 <CardTitle className="text-xl">Starter</CardTitle>
                 <div className="text-4xl font-bold mt-4">$49<span className="text-base font-normal text-muted-foreground">/mo</span></div>
                 <CardDescription>For solo founders and small tests.</CardDescription>
               </CardHeader>
               <CardContent className="flex-1 space-y-4">
                 <ul className="space-y-3 text-sm">
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> 500 AI Call Minutes</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> 1 Voice Agent</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Basic Analytics</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Email Support</li>
                 </ul>
               </CardContent>
               <CardFooter>
                 <Button className="w-full" variant="outline">Get Started</Button>
               </CardFooter>
             </Card>

             {/* Growth */}
             <Card className="flex flex-col border-primary shadow-lg shadow-primary/10 relative scale-105 z-10">
               <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-bl-lg font-medium">MOST POPULAR</div>
               <CardHeader>
                 <CardTitle className="text-xl">Growth</CardTitle>
                 <div className="text-4xl font-bold mt-4">$199<span className="text-base font-normal text-muted-foreground">/mo</span></div>
                 <CardDescription>For growing sales teams.</CardDescription>
               </CardHeader>
               <CardContent className="flex-1 space-y-4">
                 <ul className="space-y-3 text-sm">
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> 5,000 AI Call Minutes</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> 5 Voice Agents</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Advanced Analytics</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Bulk SMS Module</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> CRM Integrations</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Priority Support</li>
                 </ul>
               </CardContent>
               <CardFooter>
                 <Button className="w-full">Get Started</Button>
               </CardFooter>
             </Card>

             {/* Enterprise */}
             <Card className="flex flex-col">
               <CardHeader>
                 <CardTitle className="text-xl">Enterprise</CardTitle>
                 <div className="text-4xl font-bold mt-4">Custom</div>
                 <CardDescription>For large organizations.</CardDescription>
               </CardHeader>
               <CardContent className="flex-1 space-y-4">
                 <ul className="space-y-3 text-sm">
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Unlimited Minutes</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Unlimited Agents</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Custom Voice Cloning</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Dedicated Success Manager</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> SSO & Audit Logs</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> SLA Guarantee</li>
                 </ul>
               </CardContent>
               <CardFooter>
                 <Button className="w-full" variant="outline">Contact Sales</Button>
               </CardFooter>
             </Card>
           </div>
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
