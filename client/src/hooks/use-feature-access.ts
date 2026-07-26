import { useAuth } from "@/lib/auth";
import type { FeatureKey } from "@shared/features";

export function useFeatureAccess(featureKey: FeatureKey | string): {
  hasAccess: boolean;
  isLocked: boolean;
} {
  const { user } = useAuth();

  if (!user) return { hasAccess: false, isLocked: true };

  if (user.role === "admin") return { hasAccess: true, isLocked: false };

  const planFeatures: string[] = user.planFeatures || [];

  if (planFeatures.includes("*")) return { hasAccess: true, isLocked: false };

  const hasAccess = planFeatures.includes(featureKey);
  return { hasAccess, isLocked: !hasAccess };
}

export function useAllFeatureAccess(): (key: string) => boolean {
  const { user } = useAuth();

  return (key: string) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    const planFeatures: string[] = user.planFeatures || [];
    return planFeatures.includes("*") || planFeatures.includes(key);
  };
}
