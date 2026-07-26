import { Lock, ArrowUpRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { SYSTEM_FEATURES, type FeatureKey } from "@shared/features";

interface UpgradePromptProps {
  featureKey: FeatureKey | string;
  onUpgrade?: () => void;
}

export function UpgradePrompt({ featureKey, onUpgrade }: UpgradePromptProps) {
  const { user } = useAuth();
  const feature = SYSTEM_FEATURES.find((f) => f.key === featureKey);
  const currentPlan = user?.subscription?.plan || "Free";

  return (
    <div className="flex items-center justify-center h-full min-h-[400px] p-8">
      <Card className="max-w-md w-full border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card shadow-lg">
        <CardContent className="pt-8 pb-8 px-8 flex flex-col items-center text-center gap-5">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Lock className="h-7 w-7 text-primary" />
          </div>

          <div className="space-y-2">
            <Badge variant="outline" className="text-xs px-3 py-1 border-primary/30 text-primary mb-1">
              Upgrade Required
            </Badge>
            <h3 className="text-xl font-bold">
              {feature?.label ?? featureKey}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {feature?.description ?? "This feature is not included in your current plan."}
            </p>
          </div>

          <div className="w-full p-4 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Your Plan</p>
              <p className="font-semibold text-sm">{currentPlan}</p>
            </div>
            <ArrowUpRight className="h-5 w-5 text-muted-foreground" />
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Required</p>
              <p className="font-semibold text-sm text-primary">Higher Plan</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full">
            <Button
              className="w-full gap-2 bg-primary hover:bg-primary/90"
              onClick={onUpgrade}
            >
              <Zap className="h-4 w-4" />
              Upgrade Plan
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Contact your administrator to upgrade your subscription.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface FeatureGateProps {
  featureKey: FeatureKey | string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onUpgrade?: () => void;
}

export function FeatureGate({ featureKey, children, fallback, onUpgrade }: FeatureGateProps) {
  const { user } = useAuth();

  if (!user) return null;

  if (user.role === "admin") return <>{children}</>;

  const planFeatures: string[] = user.planFeatures || [];
  const hasAccess = planFeatures.includes("*") || planFeatures.includes(featureKey);

  if (hasAccess) return <>{children}</>;

  return fallback ? <>{fallback}</> : <UpgradePrompt featureKey={featureKey as FeatureKey} onUpgrade={onUpgrade} />;
}
