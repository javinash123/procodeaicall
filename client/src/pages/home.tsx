import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MessageSquare, BarChart3, Globe, Zap, CheckCircle2, Play } from "lucide-react";
import { Link } from "wouter";
import heroImage from "@assets/generated_images/abstract_visualization_of_ai_voice_technology_with_sound_waves_and_digital_nodes_in_orange_and_black..png";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-24 pb-32 overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-20 dark:opacity-40">
           <img 
             src={heroImage} 
             alt="Background" 
             className="w-full h-full object-cover"
           />
           <div className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background" />
        </div>
        
        <div className="container relative z-10 mx-auto px-4 text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge variant="outline" className="mb-6 border-primary/50 text-primary px-4 py-1 text-sm uppercase tracking-widest">
              Enterprise-Grade Voice Automation
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8">
              Replace Human Effort <br/>
              <span className="text-primary">With Voice AI</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Automate product demos, sales calls, and follow-ups with an AI that sounds human. 
              Book more meetings and close deals while you sleep.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/register">
                <Button size="lg" className="h-12 px-8 text-lg rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all">
                  Start Free Trial <Zap className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="h-12 px-8 text-lg rounded-full backdrop-blur-sm">
                <Play className="mr-2 h-4 w-4" /> Watch the Demo
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-y bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { label: "Calls Automate", value: "10M+" },
              { label: "Sales Closed", value: "$500M+" },
              { label: "Uptime", value: "99.9%" },
              { label: "Languages", value: "30+" },
            ].map((stat, i) => (
              <div key={i}>
                <div className="text-3xl md:text-4xl font-bold text-foreground mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24" id="products">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Everything you need to scale</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A complete suite of tools designed to replace the manual grunt work of sales.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="bg-card/50 backdrop-blur border-primary/10 hover:border-primary/30 transition-all duration-300">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Mic className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>AI Voice Agent</CardTitle>
                <CardDescription>Human-like conversations</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Our agents can dial out, greet prospects, handle objections, and book meetings dynamically based on the conversation flow.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur border-primary/10 hover:border-primary/30 transition-all duration-300">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Bulk SMS</CardTitle>
                <CardDescription>Instant follow-ups</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Send thousands of personalized SMS messages to follow up after calls or re-engage cold leads automatically.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur border-primary/10 hover:border-primary/30 transition-all duration-300">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <BarChart3 className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Integrated CRM</CardTitle>
                <CardDescription>Track every interaction</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Built-in CRM to manage leads, view call transcripts, and track success rates without leaving the platform.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Industry Solutions Section */}
      <section className="py-24 bg-background relative overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full blur-[120px]" />
        </div>
        
        <div className="container relative z-10 mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Fields Where <span className="text-primary">NIJVOX</span> <br/>
              is a Game Changer
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              From AI Calling to Automated WhatsApp and Bulk SMS, 
              NIJVOX revolutionizes communication across industries.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              {
                title: "E-Commerce",
                desc: "Use NIJVOX for product promotions, abandoned cart recovery, and customer feedback.",
                icon: "🛍️",
                color: "bg-purple-500/10 text-purple-500"
              },
              {
                title: "Financial Services",
                desc: "Automate loan processing, KYC verification, and customer reminders with compliant AI.",
                icon: "💰",
                color: "bg-emerald-500/10 text-emerald-500"
              },
              {
                title: "Education & EdTech",
                desc: "Engage students with admission follow-ups, course reminders, and exam notifications.",
                icon: "🎓",
                color: "bg-orange-500/10 text-orange-500"
              },
              {
                title: "Health & Medical",
                desc: "Automate appointment reminders, health check-up follow-ups, and patient feedback.",
                icon: "🏥",
                color: "bg-red-500/10 text-red-500"
              },
              {
                title: "Real Estate & Automotive",
                desc: "Qualify leads instantly, schedule property or car viewings, and follow up on inquiries.",
                icon: "🏠",
                color: "bg-blue-500/10 text-blue-500"
              },
              {
                title: "Travel & Hospitality",
                desc: "Send booking confirmations, travel reminders, and gather customer feedback post-trip.",
                icon: "✈️",
                color: "bg-pink-500/10 text-pink-500"
              },
              {
                title: "Lead Generation Agencies",
                desc: "Automate prospect outreach, score leads, and nurture them effectively with AI.",
                icon: "🎯",
                color: "bg-indigo-500/10 text-indigo-500"
              },
              {
                title: "Consumer Services",
                desc: "Engage customers for maintenance reminders, service feedback and support automation.",
                icon: "🛠️",
                color: "bg-amber-500/10 text-amber-500"
              },
              {
                title: "SaaS & Technology",
                desc: "Automate demo scheduling, trial onboarding, and feature announcement calls.",
                icon: "💻",
                color: "bg-cyan-500/10 text-cyan-500"
              }
            ].map((industry, i) => (
              <Card key={i} className="group hover-elevate border-primary/10 bg-card/50 backdrop-blur-sm overflow-hidden">
                <CardHeader className="flex flex-row items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-inner ${industry.color}`}>
                    {industry.icon}
                  </div>
                  <CardTitle className="text-xl group-hover:text-primary transition-colors">{industry.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    {industry.desc}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 bg-muted/20" id="pricing">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Simple, transparent pricing</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Start small and scale as your team grows.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
             {/* Starter */}
             <Card className="relative overflow-hidden">
               <CardHeader>
                 <CardTitle>Starter</CardTitle>
                 <div className="text-4xl font-bold mt-4">$49<span className="text-base font-normal text-muted-foreground">/mo</span></div>
                 <CardDescription>Perfect for testing the waters</CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                 <ul className="space-y-3">
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> 500 AI Calls/mo</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Basic Scripting</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Standard Voice</li>
                 </ul>
                 <Button className="w-full mt-6" variant="outline">Get Started</Button>
               </CardContent>
             </Card>

             {/* Pro */}
             <Card className="relative overflow-hidden border-primary shadow-lg shadow-primary/10 scale-105 z-10">
               <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-bl-lg font-medium">POPULAR</div>
               <CardHeader>
                 <CardTitle>Growth</CardTitle>
                 <div className="text-4xl font-bold mt-4">$199<span className="text-base font-normal text-muted-foreground">/mo</span></div>
                 <CardDescription>For scaling sales teams</CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                 <ul className="space-y-3">
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> 5,000 AI Calls/mo</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Advanced Logic Engine</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Bulk SMS Included</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> CRM Integration</li>
                 </ul>
                 <Button className="w-full mt-6">Get Started</Button>
               </CardContent>
             </Card>

             {/* Enterprise */}
             <Card className="relative overflow-hidden">
               <CardHeader>
                 <CardTitle>Enterprise</CardTitle>
                 <div className="text-4xl font-bold mt-4">Custom</div>
                 <CardDescription>For high volume needs</CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                 <ul className="space-y-3">
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Unlimited Calls</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Custom Voice Cloning</li>
                   <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Dedicated Account Manager</li>
                 </ul>
                 <Button className="w-full mt-6" variant="outline">Contact Sales</Button>
               </CardContent>
             </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Ready to replace the busywork?</h2>
          <p className="text-xl opacity-90 mb-10 max-w-2xl mx-auto">
            Join 2,000+ companies using NIJVOX to automate their sales outreach.
          </p>
          <Link href="/register">
            <Button size="lg" variant="secondary" className="h-14 px-10 text-lg rounded-full">
              Get Started Now
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
