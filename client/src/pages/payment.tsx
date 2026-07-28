import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Plan } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

export default function Payment() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryParams = new URLSearchParams(window.location.search);
  const planId = queryParams.get("plan");
  const email = queryParams.get("email");
  const isRenewal = queryParams.get("renew") === "true";

  const { data: plan, isLoading } = useQuery<Plan>({
    queryKey: ["/api/plans", planId],
    queryFn: async () => {
      if (!planId) return null;
      const res = await fetch(`/api/plans/${planId}`);
      if (!res.ok) throw new Error("Failed to fetch plan");
      return res.json();
    },
    enabled: !!planId,
  });

  // Upgrade mutation — for new subscriptions
  const upgradeMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await apiRequest("POST", "/api/billing/upgrade", { planId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Your plan has been activated." });
      setTimeout(() => {
        if (email) {
          setLocation(`/login?message=Account activated successfully! Please login with your credentials.&email=${encodeURIComponent(email)}`);
        } else {
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
          setLocation("/dashboard");
        }
      }, 2000);
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Activation failed", description: error.message || "Something went wrong" });
    },
  });

  // Renew mutation — for renewals of existing subscriptions
  const renewMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await apiRequest("POST", "/api/billing/renew", { planId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Renewed!", description: "Your subscription has been renewed successfully." });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setLocation("/dashboard");
      }, 2000);
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Renewal failed", description: error.message || "Something went wrong" });
    },
  });

  const activeMutation = isRenewal ? renewMutation : upgradeMutation;

  const handlePayment = () => {
    if (!plan) return;

    if (!(window as any).Razorpay) {
      toast({ variant: "destructive", title: "Error", description: "Razorpay SDK not loaded. Please refresh and try again." });
      return;
    }

    const options = {
      key: (window as any).__RAZORPAY_KEY__ || "",
      amount: plan.price * 100,
      currency: "INR",
      name: "NIJVOX",
      description: isRenewal ? `Renewal of ${plan.name} Plan` : `Subscription to ${plan.name} Plan`,
      handler: function () {
        activeMutation.mutate(plan._id);
      },
      prefill: {
        name: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "",
        email: email || user?.email || "",
      },
      theme: { color: "#f97316" },
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-2xl font-bold">Invalid Plan</h2>
        <Button onClick={() => setLocation("/pricing")}>Go to Pricing</Button>
      </div>
    );
  }

  const isSuccess = activeMutation.isSuccess;

  return (
    <div className="min-h-screen bg-muted/20 flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">
            {isSuccess
              ? isRenewal ? "Subscription Renewed!" : "Payment Successful!"
              : isRenewal ? "Renew Your Subscription" : "Complete Your Purchase"}
          </CardTitle>
          <CardDescription>
            {isSuccess
              ? "Your subscription is now active. Redirecting you..."
              : isRenewal
                ? `You're renewing your ${plan.name} Plan`
                : `You're subscribing to the ${plan.name} Plan`}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {isSuccess ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="h-20 w-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-center text-muted-foreground font-medium">
                {isRenewal
                  ? "Your subscription has been renewed. Enjoy uninterrupted access!"
                  : "Thank you for your purchase. We are setting up your workspace."}
              </p>
            </div>
          ) : (
            <>
              {isRenewal && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm">
                  <RefreshCw className="h-4 w-4 shrink-0" />
                  <span>Your subscription has expired. Renewing will restore full access and reset your credits.</span>
                </div>
              )}

              <div className="bg-primary/5 rounded-xl p-6 border border-primary/10">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-lg font-medium">Total Amount</span>
                  <span className="text-3xl font-bold text-primary">₹{plan.price}</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 mr-2 text-primary" />
                    {plan.credits.toLocaleString()} Credits included
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 mr-2 text-primary" />
                    Full access to all {plan.name} features
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 mr-2 text-primary" />
                    Valid for {plan.duration === "monthly" ? "1 month" : plan.duration === "quarterly" ? "3 months" : plan.duration === "yearly" ? "1 year" : "lifetime"}
                  </div>
                </div>
              </div>

              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">Secure payment processing via Razorpay</p>
                <Button
                  size="lg"
                  className="w-full h-12 text-lg font-semibold"
                  onClick={handlePayment}
                  disabled={activeMutation.isPending}
                >
                  {activeMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                  ) : isRenewal ? (
                    <><RefreshCw className="mr-2 h-5 w-5" /> Renew for ₹{plan.price}</>
                  ) : (
                    `Pay ₹${plan.price} Now`
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setLocation(isRenewal ? "/dashboard" : "/pricing")}
                  disabled={activeMutation.isPending}
                >
                  {isRenewal ? "Back to Dashboard" : "Change Plan"}
                </Button>
              </div>
            </>
          )}
        </CardContent>

        {!isSuccess && (
          <CardFooter className="justify-center border-t p-6">
            <div className="flex items-center gap-4 grayscale opacity-50">
              <span className="text-xs font-medium uppercase tracking-widest">Secure Checkout</span>
            </div>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
