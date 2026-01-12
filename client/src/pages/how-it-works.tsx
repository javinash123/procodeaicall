import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadCloud, BrainCircuit, PhoneCall, MessageCircle, LayoutDashboard, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const steps = [
  {
    id: 1,
    title: "Upload Data & Campaign Setup",
    description: "Clients upload a CSV with phone numbers and PDFs to set up a new campaign.",
    icon: UploadCloud,
    color: "bg-orange-500",
    details: "Import your leads and documentation in seconds. Our system handles data cleaning and formatting automatically."
  },
  {
    id: 2,
    title: "AI Training & Scheduling",
    description: "NIJVOX's AI gets trained on PDFs/FAQs and the client schedules auto-calls.",
    icon: BrainCircuit,
    color: "bg-orange-500",
    details: "Our advanced RAG system absorbs your business knowledge, ensuring the AI represents your brand accurately."
  },
  {
    id: 3,
    title: "AI Calling & Lead Qualification",
    description: "NIJVOX's AI starts calling, interacts with users, and qualifies leads based on responses.",
    icon: PhoneCall,
    color: "bg-orange-500",
    details: "Natural-sounding conversations that handle objections and extract key information from prospects."
  },
  {
    id: 4,
    title: "AI WhatsApp & SMS Follow-Up",
    description: "AI continues conversation on WhatsApp or sends DLT-compliant SMS messages.",
    icon: MessageCircle,
    color: "bg-orange-500",
    details: "Multi-channel engagement ensures no lead goes cold. High delivery rates through verified routes."
  },
  {
    id: 5,
    title: "CRM Dashboard & Human Handoff",
    description: "Clients track leads, listen to recordings, and handover hot leads to human agents.",
    icon: LayoutDashboard,
    color: "bg-orange-500",
    details: "Real-time analytics and seamless handoff to your sales team for the final closing."
  }
];

export default function HowItWorks() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative pt-24 pb-16 overflow-hidden border-b">
        <div className="absolute inset-0 z-0 opacity-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary rounded-full blur-[120px]" />
        </div>
        
        <div className="container relative z-10 mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge variant="outline" className="mb-4 border-primary/50 text-primary px-4 py-1">
              Platform Workflow
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              How <span className="text-primary">NIJVOX</span> Works
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              From CSV Upload to AI Calls, WhatsApp, and SMS Follow-Ups, 
              NIJVOX Automates Communication Like Never Before!
            </p>
          </motion.div>
        </div>
      </section>

      {/* Process Steps */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="relative">
            {/* Connection Line (Desktop) */}
            <div className="hidden lg:block absolute top-[60px] left-[10%] right-[10%] h-0.5 bg-gradient-to-r from-orange-500/20 via-orange-500 to-orange-500/20 z-0" />
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 relative z-10">
              {steps.map((step, index) => (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  viewport={{ once: true }}
                >
                  <div className="flex flex-col items-center text-center group">
                    <div className={`w-14 h-14 ${step.color} rounded-full flex items-center justify-center text-white font-bold text-xl mb-6 shadow-lg shadow-orange-500/30 group-hover:scale-110 transition-transform`}>
                      {step.id}
                    </div>
                    <div className="bg-card border-2 border-primary/5 rounded-2xl p-6 hover:border-primary/20 transition-colors h-full shadow-sm">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                        <step.icon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-bold text-lg mb-3 leading-tight">{step.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                    {index < steps.length - 1 && (
                      <div className="lg:hidden mt-4 text-primary/30">
                        <ArrowRight className="rotate-90 md:rotate-0" />
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Deep Dive Section */}
      <section className="py-24 bg-muted/30 border-y">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto space-y-24">
            {steps.map((step, index) => (
              <div 
                key={step.id} 
                className={`flex flex-col md:flex-row gap-12 items-center ${index % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
              >
                <div className="flex-1 space-y-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-bold">
                    <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs">
                      {step.id}
                    </span>
                    Step {step.id}
                  </div>
                  <h2 className="text-3xl font-bold">{step.title}</h2>
                  <p className="text-lg text-muted-foreground leading-relaxed italic">
                    "{step.description}"
                  </p>
                  <p className="text-muted-foreground text-lg">
                    {step.details}
                  </p>
                </div>
                <div className="flex-1 w-full max-w-sm">
                  <Card className="border-4 border-background shadow-2xl overflow-hidden aspect-square bg-muted flex items-center justify-center">
                    <step.icon className="w-32 h-32 text-primary/20" />
                  </Card>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-primary text-primary-foreground text-center">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-5xl font-bold mb-8">Experience the future of calling</h2>
          <Link href="/register">
            <Button size="lg" variant="secondary" className="h-14 px-10 text-lg rounded-full">
              Get Started for Free
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
