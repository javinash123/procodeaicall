import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, ArrowLeft, Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { authApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function Auth() {
  const [location, setLocation] = useLocation();
  const isLogin = location === "/login";
  const { login } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      await login(email, password);
      toast({
        title: "Welcome back!",
        description: "You've successfully logged in.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error.message || "Invalid email or password",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const firstName = formData.get("first-name") as string;
    const lastName = formData.get("last-name") as string;
    const email = formData.get("reg-email") as string;
    const password = formData.get("reg-password") as string;
    
    const queryParams = new URLSearchParams(window.location.search);
    const selectedPlanId = queryParams.get("plan");

    if (!selectedPlanId) {
      toast({
        variant: "destructive",
        title: "Plan required",
        description: "Please select a pricing plan before registering.",
      });
      setLocation("/pricing");
      return;
    }

    try {
      const user = await authApi.register({
        email,
        password,
        firstName,
        lastName,
        role: "user",
        selectedPlanId: selectedPlanId || undefined,
      });
      await login(email, password);
      
      toast({
        title: "Account created!",
        description: "Redirecting to payment gateway...",
      });
      
      // In a real scenario, you'd redirect to Razorpay here
      // We will check for the plan and if it's free, skip payment
      const response = await fetch(`/api/plans/${selectedPlanId}`);
      const plan = await response.json();

      if (plan && plan.price === 0) {
        toast({
          title: "Free Plan Activated",
          description: "Welcome to NIJVOX!",
        });
        setLocation("/dashboard");
      } else {
        // Redirect to a dedicated payment page or trigger Razorpay
        setLocation(`/payment?plan=${selectedPlanId}`);
      }
      
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: error.message || "Could not create account",
      });
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
          <Tabs defaultValue={isLogin ? "login" : "register"} className="w-full" onValueChange={(val) => setLocation(val === "login" ? "/login" : "/register")}>
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form className="space-y-4" onSubmit={handleLogin}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    name="email"
                    type="email" 
                    placeholder="name@example.com" 
                    required 
                    data-testid="input-email"
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="password">Password</Label>
                    <a href="#" className="text-xs text-primary hover:underline">Forgot password?</a>
                  </div>
                  <Input 
                    id="password" 
                    name="password"
                    type="password" 
                    required 
                    data-testid="input-password"
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" className="w-full h-10" data-testid="button-login" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="register">
              <form className="space-y-4" onSubmit={handleRegister}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first-name">First name</Label>
                    <Input 
                      id="first-name" 
                      name="first-name"
                      placeholder="John" 
                      required 
                      data-testid="input-firstname"
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last-name">Last name</Label>
                    <Input 
                      id="last-name" 
                      name="last-name"
                      placeholder="Doe" 
                      required 
                      data-testid="input-lastname"
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input 
                    id="reg-email" 
                    name="reg-email"
                    type="email" 
                    placeholder="name@example.com" 
                    required 
                    data-testid="input-reg-email"
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input 
                    id="reg-password" 
                    name="reg-password"
                    type="password" 
                    required 
                    minLength={6}
                    data-testid="input-reg-password"
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" className="w-full h-10" data-testid="button-register" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </form>
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
