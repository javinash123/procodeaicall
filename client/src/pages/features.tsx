import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Zap, Mic, MessageSquare, BarChart3, Shield, Globe, Clock } from "lucide-react";
import { motion } from "framer-motion";
import featureImage from "@assets/generated_images/futuristic_server_room_or_data_center_for_features_page..png";

export default function Features() {
  const features = [
    {
      icon: Mic,
      title: "Natural Voice AI",
      description: "Our AI speaks with human-like intonation, pauses, and emotional intelligence. It's indistinguishable from a top-tier sales rep."
    },
    {
      icon: Zap,
      title: "Instant Response",
      description: "Zero latency. The AI processes speech and responds in milliseconds, ensuring fluid, natural conversations without awkward pauses."
    },
    {
      icon: MessageSquare,
      title: "Dynamic Scripting",
      description: "Build complex conversation flows with a visual editor. The AI adapts to objections and questions in real-time."
    },
    {
      icon: BarChart3,
      title: "Real-time Analytics",
      description: "Track sentiment, objection rates, and conversion metrics instantly. optimizing your pitch based on data."
    },
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "SOC2 compliant infrastructure. Your data is encrypted at rest and in transit. Role-based access control included."
    },
    {
      icon: Globe,
      title: "Multilingual Support",
      description: "Scale globally with support for 30+ languages and dialects. The AI detects language automatically."
    },
    {
      icon: Clock,
      title: "24/7 Availability",
      description: "Never miss a lead. Your AI agents work round the clock, handling inbound inquiries and outbound campaigns."
    },
    {
      icon: CheckCircle2,
      title: "Seamless Integration",
      description: "Connects with Salesforce, HubSpot, Pipedrive, and Zapier out of the box. Syncs data automatically."
    }
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
      <section className="relative py-24 overflow-hidden bg-muted/10">
        <div className="container mx-auto px-4 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Features that <span className="text-primary">Drive Revenue</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              Built for sales teams who demand performance, reliability, and scale.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="bg-card/50 border-primary/10 hover:border-primary/30 transition-all duration-300 group">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Specs Section */}
      <section className="py-24 bg-black text-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">Under the Hood</h2>
              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-bold text-primary mb-2">Latency</h3>
                  <p className="text-gray-400">Sub-500ms voice-to-voice response time using optimized edge computing.</p>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-primary mb-2">Telephony</h3>
                  <p className="text-gray-400">Direct carrier integration via Twilio for crystal clear call quality and high deliverability.</p>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-primary mb-2">LLM Engine</h3>
                  <p className="text-gray-400">Powered by fine-tuned models specifically trained on successful sales conversations.</p>
                </div>
              </div>
            </div>
            <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl">
               <img src={featureImage} alt="Tech Dashboard" className="w-full h-full object-cover opacity-80" />
               <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            </div>
          </div>
        </div>
      </section>
      
      {/* CTA */}
      <section className="py-24 text-center">
         <div className="container mx-auto px-4">
           <h2 className="text-3xl font-bold mb-6">Ready to experience the future?</h2>
           <Button size="lg" className="h-12 px-8 rounded-full">
             Get Started Today
           </Button>
         </div>
      </section>
    </div>
  );
}
