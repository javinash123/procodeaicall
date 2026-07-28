import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Coins, Loader2, Zap } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface BuyCreditsDialogProps {
  plan: {
    _id: string;
    name: string;
    extraCreditPrice: number;
    maxCreditPurchase: number;
  };
  onSuccess: () => void;
}

export default function BuyCreditsDialog({ plan, onSuccess }: BuyCreditsDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [credits, setCredits] = useState<number>(100);

  const maxCredits = plan.maxCreditPurchase > 0 ? plan.maxCreditPurchase : 100000;
  const totalAmount = Math.round(credits * plan.extraCreditPrice * 100) / 100;

  const buyMutation = useMutation({
    mutationFn: async (creditsToBuy: number) => {
      const res = await apiRequest("POST", "/api/billing/buy-credits", { credits: creditsToBuy });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Credits Added!", description: `${data.creditsAdded} credits have been added to your account.` });
      setOpen(false);
      onSuccess();
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Purchase failed", description: error.message || "Something went wrong" });
    },
  });

  const handlePayment = () => {
    if (!credits || credits <= 0) {
      toast({ variant: "destructive", title: "Invalid amount", description: "Please enter a valid number of credits." });
      return;
    }
    if (credits > maxCredits) {
      toast({ variant: "destructive", title: "Exceeds limit", description: `You can purchase a maximum of ${maxCredits} credits at once.` });
      return;
    }

    if (!(window as any).Razorpay) {
      toast({ variant: "destructive", title: "Error", description: "Razorpay SDK not loaded. Please refresh and try again." });
      return;
    }

    const options = {
      key: (window as any).__RAZORPAY_KEY__ || "",
      amount: Math.round(totalAmount * 100), // paise
      currency: "INR",
      name: "NIJVOX",
      description: `${credits} Extra Credits`,
      handler: function () {
        buyMutation.mutate(credits);
      },
      theme: { color: "#f97316" },
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-yellow-500/50 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950/20">
          <Coins className="h-4 w-4 mr-2" />
          Buy Credits
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Purchase Extra Credits
          </DialogTitle>
          <DialogDescription>
            Top up your credit balance instantly. Credits are added to your account right after payment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Plan info */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
            <div>
              <p className="text-sm font-medium">{plan.name} Plan Rate</p>
              <p className="text-xs text-muted-foreground">Your plan's extra credit price</p>
            </div>
            <Badge variant="secondary" className="text-sm font-bold">
              ₹{plan.extraCreditPrice} / credit
            </Badge>
          </div>

          {/* Credit input */}
          <div className="space-y-2">
            <Label htmlFor="credits-input">Number of credits to buy</Label>
            <Input
              id="credits-input"
              type="number"
              min={1}
              max={maxCredits}
              value={credits}
              onChange={e => setCredits(Math.max(1, Math.min(maxCredits, parseInt(e.target.value) || 0)))}
              className="text-lg font-medium"
            />
            {plan.maxCreditPurchase > 0 && (
              <p className="text-xs text-muted-foreground">Maximum {plan.maxCreditPurchase.toLocaleString()} credits per purchase</p>
            )}
            <div className="flex gap-2 pt-1">
              {[100, 500, 1000, 5000].filter(n => n <= maxCredits).map(n => (
                <Button key={n} variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => setCredits(n)}>
                  {n.toLocaleString()}
                </Button>
              ))}
            </div>
          </div>

          {/* Price summary */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{credits.toLocaleString()} credits × ₹{plan.extraCreditPrice}</span>
              <span className="font-medium">₹{totalAmount.toFixed(2)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold text-base">
              <span>Total</span>
              <span className="text-primary">₹{totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handlePayment}
            disabled={buyMutation.isPending || credits <= 0}
          >
            {buyMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
            ) : (
              <><Coins className="h-4 w-4 mr-2" /> Pay ₹{totalAmount.toFixed(2)} & Get {credits.toLocaleString()} Credits</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
