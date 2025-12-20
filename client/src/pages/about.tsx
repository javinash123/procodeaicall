import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import aboutImage from "@assets/generated_images/abstract_network_connections_glowing_in_orange_for_about_and_contact_pages..png";

export default function About() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
      <section className="relative py-24 overflow-hidden">
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              We're building the <span className="text-primary">Voice of the Future</span>
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              NIJVOX was founded on a simple belief: Humans shouldn't have to do robotic work. We're replacing the repetitive grind of outbound sales with intelligent, empathetic AI agents.
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 bg-muted/10">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
             <div className="rounded-xl overflow-hidden border border-primary/10 shadow-xl">
                <img src={aboutImage} alt="About Us" className="w-full h-full object-cover" />
             </div>
             <div className="space-y-6">
               <h2 className="text-3xl font-bold">Our Mission</h2>
               <p className="text-muted-foreground">
                 Sales teams are burning out. They spend hours dialing numbers, getting rejected, and repeating the same script. It's inefficient and demoralizing.
               </p>
               <p className="text-muted-foreground">
                 We built NIJVOX to take over the "grunt work" of sales—the cold calling, the qualifying, the follow-ups. This frees up human sales professionals to do what they do best: build genuine relationships and close complex deals.
               </p>
               <div className="pt-4">
                 <Link href="/contact">
                   <Button variant="outline">Contact Us <ArrowRight className="ml-2 h-4 w-4" /></Button>
                 </Link>
               </div>
             </div>
          </div>
        </div>
      </section>

      {/* Team Stats */}
      <section className="py-24">
        <div className="container mx-auto px-4">
           <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
             <div>
               <div className="text-4xl font-bold text-primary mb-2">2023</div>
               <div className="text-sm text-muted-foreground uppercase tracking-widest">Founded</div>
             </div>
             <div>
               <div className="text-4xl font-bold text-primary mb-2">25+</div>
               <div className="text-sm text-muted-foreground uppercase tracking-widest">Team Members</div>
             </div>
             <div>
               <div className="text-4xl font-bold text-primary mb-2">SF</div>
               <div className="text-sm text-muted-foreground uppercase tracking-widest">HQ Location</div>
             </div>
             <div>
               <div className="text-4xl font-bold text-primary mb-2">$10M</div>
               <div className="text-sm text-muted-foreground uppercase tracking-widest">Funding</div>
             </div>
           </div>
        </div>
      </section>
    </div>
  );
}
