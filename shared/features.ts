export const SYSTEM_FEATURES = [
  {
    key: "crm",
    label: "CRM & Leads",
    description: "Manage contacts, track lead pipeline and log activities",
    navTab: "crm",
    icon: "Users",
  },
  {
    key: "campaigns",
    label: "AI Calling Campaigns",
    description: "Create and run AI-powered outbound calling campaigns",
    navTab: "campaigns",
    icon: "Megaphone",
  },
  {
    key: "calendar",
    label: "Appointments & Calendar",
    description: "Schedule and manage meetings and appointments with leads",
    navTab: "calendar",
    icon: "Calendar",
  },
  {
    key: "whatsapp",
    label: "Bulk WhatsApp",
    description: "Send bulk WhatsApp messages and run messaging campaigns",
    navTab: "whatsapp",
    icon: "MessageCircle",
  },
  {
    key: "bulk_sms",
    label: "Bulk SMS",
    description: "Send bulk SMS messages and campaigns to contacts",
    navTab: "sms",
    icon: "MessageSquare",
  },
  {
    key: "call_history",
    label: "Call History",
    description: "View detailed AI call logs, recordings and outcomes",
    navTab: "callhistory",
    icon: "History",
  },
  {
    key: "analytics",
    label: "Advanced Analytics",
    description: "Performance charts, conversion funnels and detailed reports",
    navTab: "analytics",
    icon: "BarChart2",
  },
] as const;

export type FeatureKey = typeof SYSTEM_FEATURES[number]["key"];

export const FEATURE_MAP = Object.fromEntries(
  SYSTEM_FEATURES.map((f) => [f.key, f])
) as Record<FeatureKey, typeof SYSTEM_FEATURES[number]>;
