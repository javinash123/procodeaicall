import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Phone, ArrowLeft, Loader2, Check } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { authApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { Plan } from "@shared/schema";

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export default function Auth() {
  const [location, setLocation] = useLocation();
  const isLogin = location === "/login";
  const { login } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Registration multi-step state
  const [regStep, setRegStep] = useState<1 | 2>(1);
  const [pendingForm, setPendingForm] = useState<FormData | null>(null);

  // Show success message passed via ?message= query param (e.g. after paid plan activation)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const msg = params.get("message");
    if (msg) {
      toast({ title: "Account Activated", description: msg });
      // Remove the param from the URL so it doesn't show again on refresh
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    }
  }, []);

  // Fetch plans (for step 2 plan picker)
  const { data: plansData } = useQuery<{ plans: Plan[] } | Plan[]>({
    queryKey: ["/api/plans"],
    enabled: !isLogin,
  });
  const plans: Plan[] = Array.isArray(plansData)
    ? plansData
    : (plansData && "plans" in plansData ? plansData.plans : []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      await login(email, password);
      toast({ title: "Welcome back!", description: "You've successfully logged in." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Login failed", description: error.message || "Invalid email or password" });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1: Collect form data
  const handleRegisterStep1 = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: FormData = {
      firstName: formData.get("first-name") as string,
      lastName: formData.get("last-name") as string,
      email: formData.get("reg-email") as string,
      password: formData.get("reg-password") as string,
    };

    // Check if plan is already in URL (user came from pricing page)
    const queryParams = new URLSearchParams(window.location.search);
    const selectedPlanId = queryParams.get("plan");

    if (selectedPlanId) {
      // Plan already chosen — skip step 2, go straight to registering
      doRegister(data, selectedPlanId);
    } else {
      // No plan yet — move to step 2 (plan picker)
      setPendingForm(data);
      setRegStep(2);
    }
  };

  // Step 2: User picked a plan
  const handlePlanSelected = (planId: string) => {
    if (!pendingForm) return;
    doRegister(pendingForm, planId);
  };

  // Actual API call + routing
  const doRegister = async (data: FormData, planId: string) => {
    setIsLoading(true);
    try {
      await authApi.register({
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        role: "user",
        selectedPlanId: planId,
      });

      const planRes = await fetch(`/api/plans/${planId}`);
      const plan = await planRes.json();

      if (plan && plan.price === 0) {
        await login(data.email, data.password);
        toast({ title: "Account created!", description: "Free Plan Activated. Welcome to NIJVOX!" });
        setLocation("/dashboard");
      } else {
        toast({ title: "Account created!", description: "Please complete the payment to activate your account." });
        setLocation(`/payment?plan=${planId}&email=${encodeURIComponent(data.email)}`);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Registration failed", description: error.message || "Could not create account" });
      // On error go back to step 1
      setRegStep(1);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 px-4">
      <div className="absolute top-8 left-8">
        <Link href="/" className="flex items-center text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
        </Link>
      </div>

      <Card className="w-full max-w-md border-primary/10 shadow-xl shadow-primary/5">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Phone className="h-6 w-6" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tighter">NIJVOX</CardTitle>
          <CardDescription>
            Sign in to your account or create a new one to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            defaultValue={isLogin ? "login" : "register"}
            className="w-full"
            onValueChange={(val) => {
              setRegStep(1);
              setPendingForm(null);
              setLocation(val === "login" ? "/login" : "/register");
            }}
          >
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            {/* ── LOGIN ─────────────────────────────────────────────────────── */}
            <TabsContent value="login">
              <form className="space-y-4" onSubmit={handleLogin}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" placeholder="name@example.com" required data-testid="input-email" disabled={isLoading} />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="password">Password</Label>
                    <a href="#" className="text-xs text-primary hover:underline">Forgot password?</a>
                  </div>
                  <Input id="password" name="password" type="password" required data-testid="input-password" disabled={isLoading} />
                </div>
                <Button type="submit" className="w-full h-10" data-testid="button-login" disabled={isLoading}>
                  {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</> : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            {/* ── REGISTER ──────────────────────────────────────────────────── */}
            <TabsContent value="register">
              {/* Step indicators */}
              <div className="flex items-center justify-center gap-2 mb-6">
                <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold border-2 transition-colors ${regStep >= 1 ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground text-muted-foreground"}`}>
                  {regStep > 1 ? <Check className="h-3.5 w-3.5" /> : "1"}
                </div>
                <div className={`h-0.5 w-10 transition-colors ${regStep > 1 ? "bg-primary" : "bg-muted"}`} />
                <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold border-2 transition-colors ${regStep >= 2 ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground text-muted-foreground"}`}>
                  2
                </div>
              </div>

              {regStep === 1 && (
                <form className="space-y-4" onSubmit={handleRegisterStep1}>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="first-name">First name</Label>
                      <Input id="first-name" name="first-name" placeholder="John" required data-testid="input-firstname" disabled={isLoading} defaultValue={pendingForm?.firstName} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last-name">Last name</Label>
                      <Input id="last-name" name="last-name" placeholder="Doe" required data-testid="input-lastname" disabled={isLoading} defaultValue={pendingForm?.lastName} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input id="reg-email" name="reg-email" type="email" placeholder="name@example.com" required data-testid="input-reg-email" disabled={isLoading} defaultValue={pendingForm?.email} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Password</Label>
                    <Input id="reg-password" name="reg-password" type="password" required minLength={6} data-testid="input-reg-password" disabled={isLoading} />
                  </div>
                  <Button type="submit" className="w-full h-10" data-testid="button-register" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Please wait...</> : "Continue"}
                  </Button>
                </form>
              )}

              {regStep === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground text-center">Choose a plan to get started</p>
                  {plans.length === 0 ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <div className="space-y-3">
                      {plans.map((plan) => (
                        <button
                          key={plan._id}
                          onClick={() => !isLoading && handlePlanSelected(plan._id)}
                          disabled={isLoading}
                          className="w-full text-left rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all p-4 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-semibold text-sm">{plan.name}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">{plan.credits.toLocaleString()} credits · {plan.duration}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {plan.price === 0 ? (
                                <Badge variant="secondary">Free</Badge>
                              ) : (
                                <span className="text-sm font-bold text-primary">₹{plan.price}</span>
                              )}
                              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <Button variant="ghost" className="w-full text-sm" onClick={() => setRegStep(1)} disabled={isLoading}>
                    ← Back
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="justify-center border-t p-6 text-sm text-muted-foreground">
          By clicking continue, you agree to our <a href="#" className="underline hover:text-primary ml-1">Terms of Service</a>
        </CardFooter>
      </Card>
    </div>
  );
}
