import { Switch, Route, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Auth from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import Features from "@/pages/features";
import Pricing from "@/pages/pricing";
import About from "@/pages/about";
import Contact from "@/pages/contact";
import HowItWorks from "@/pages/how-it-works";
import AdminLogin from "@/pages/admin-login";
import AdminPlans from "@/pages/admin-plans";
import Notifications from "@/pages/notifications";
import BulkWhatsapp from "@/pages/bulk-whatsapp";

function Router() {
  // Check if we are in production and use /aiagent base
  // In development (Replit), use root base /
  const isProd = import.meta.env.PROD;
  const base = isProd ? "/aiagent" : "";
  
  return (
    <WouterRouter base={base}>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/bulk-whatsapp" component={BulkWhatsapp} />
        <Route path="/admin/dashboard" component={Dashboard} />
        <Route path="/admin/plans" component={AdminPlans} />
        <Route path="/admin" component={AdminLogin} />
        <Route path="/login" component={Auth} />
        <Route path="/register" component={Auth} />
        <Route path="/features" component={Features} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/about" component={About} />
        <Route path="/contact" component={Contact} />
        <Route path="/how-it-works" component={HowItWorks} />
        
        <Route path="/">
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow">
              <Home />
            </main>
            <Footer />
          </div>
        </Route>
        
        <Route path="/:page">
          {(params) => (
            <div className="flex flex-col min-h-screen">
              <Navbar />
              <main className="flex-grow flex items-center justify-center">
                 <div className="text-center py-24">
                   <h1 className="text-4xl font-bold mb-4 capitalize">{params.page}</h1>
                   <p className="text-muted-foreground">This page is under construction.</p>
                 </div>
              </main>
              <Footer />
            </div>
          )}
        </Route>

        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
