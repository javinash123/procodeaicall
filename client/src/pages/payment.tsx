import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Plan } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Payment() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryParams = new URLSearchParams(window.location.search);
  const planId = queryParams.get("plan");

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

  const upgradeMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await apiRequest("POST", "/api/billing/upgrade", { planId });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Your plan has been upgraded successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/dashboard");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Upgrade failed",
        description: error.message || "Something went wrong",
      });
    },
  });

  const handlePayment = () => {
    if (!plan) return;
    
    // Check if Razorpay is available
    if (!(window as any).Razorpay) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Razorpay SDK not loaded. Please refresh and try again.",
      });
      return;
    }

    // In a real scenario, you'd get an orderId from the backend first
    // For now, we'll simulate the Razorpay options
    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID || "rzp_test_placeholder",
      amount: plan.price * 100, // in paise
      currency: "INR",
      name: "NIJVOX",
      description: `Payment for ${plan.name} Plan`,
      handler: function (response: any) {
        // Handle successful payment
        upgradeMutation.mutate(plan._id);
      },
      prefill: {
        name: "", // Will be filled from auth state if needed
        email: "",
      },
      theme: {
        color: "#f97316", // Primary color
      },
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

  return (
    <div className="min-h-screen bg-muted/20 flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">Complete Your Purchase</CardTitle>
          <CardDescription>
            You're subscribing to the {plan.name} Plan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
            </div>
          </div>

          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Secure payment processing via Razorpay
            </p>
            <Button 
              size="lg" 
              className="w-full h-12 text-lg font-semibold"
              onClick={handlePayment}
              disabled={upgradeMutation.isPending}
            >
              {upgradeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Pay ₹${plan.price} Now`
              )}
            </Button>
            <Button 
              variant="ghost" 
              className="w-full"
              onClick={() => setLocation("/pricing")}
              disabled={upgradeMutation.isPending}
            >
              Change Plan
            </Button>
          </div>
        </CardContent>
        <CardFooter className="justify-center border-t p-6">
          <div className="flex items-center gap-4 grayscale opacity-50">
            {/* Razorpay and Card Icons */}
            <span className="text-xs font-medium uppercase tracking-widest">Secure Checkout</span>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
