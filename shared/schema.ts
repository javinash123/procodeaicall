import { z } from "zod";

// Subscription Info Type
export type SubscriptionInfo = {
  plan: string; // Dynamic plan name
  status: "Active" | "Inactive" | "Cancelled";
  monthlyCallCredits: number;
  creditsUsed: number;
  renewalDate?: Date;
  joinedDate: Date;
};

// Plan Schema
export const insertPlanSchema = z.object({
  name: z.string().min(1),
  price: z.number().min(0),
  duration: z.enum(["monthly", "yearly", "quarterly", "lifetime"]),
  credits: z.number().min(0),
  callingRate: z.number().min(0).default(0),
  smsRate: z.number().min(0).default(0),
  whatsappRate: z.number().min(0).default(0),
  features: z.array(z.string()),
  limitations: z.array(z.string()),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = InsertPlan & {
  _id: string;
  createdAt: Date;
};

// Feature Schema (for dynamic management)
export const insertFeatureSchema = z.object({
  name: z.string().min(1),
});

export type InsertFeature = z.infer<typeof insertFeatureSchema>;
export type Feature = InsertFeature & {
  _id: string;
};

// User Schema
export const insertUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["admin", "user"]).default("user"),
  companyName: z.string().optional(),
  phone: z.string().optional(),
  selectedPlanId: z.string().optional(),
});

export const updateUserSchema = insertUserSchema.partial().omit({ password: true });

export const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(6),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type User = Omit<InsertUser, "password"> & {
  _id: string;
  createdAt: Date;
  settings?: {
    dailyCallLimit: number;
    dndEnabled: boolean;
    localPresenceDialing: boolean;
  };
  subscription?: SubscriptionInfo;
  logoUrl?: string;
};

// Lead Schema
export const insertLeadSchema = z.object({
  userId: z.string(),
  campaignId: z.string().optional(), // Associated campaign ID
  name: z.string().min(1),
  company: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().min(1),
  status: z.enum(["New", "Interested", "Follow Up", "Closed", "Unqualified", "In Progress"]).default("New"),
  outcome: z.string().default("Pending"),
  notes: z.string().optional(),
});

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = InsertLead & {
  _id: string;
  campaignId?: string; // Associated campaign ID
  campaignName?: string; // Populated from campaign (for display)
  lastContact: Date;
  history: LeadHistoryItem[];
  appointments: string[]; // appointment IDs
  createdAt: Date;
};

// Lead History Item
export type LeadHistoryItem = {
  type: "call" | "email" | "note";
  date: Date;
  duration?: string;
  outcome?: string;
  subject?: string;
  note: string;
  campaignId?: string; // Track which campaign triggered this interaction
  campaignName?: string;
};

// Knowledge Base File Type
export type KnowledgeBaseFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedAt: Date;
};

// Campaign Schema
export const insertCampaignSchema = z.object({
  userId: z.string(),
  name: z.string().min(1),
  goal: z.enum(["sales", "support", "survey", "appointment"]),
  script: z.string().optional(),
  status: z.enum(["Active", "Paused", "Draft"]).default("Draft"),
  voice: z.string().default("Rachel (American)"),
  knowledgeBase: z.array(z.string()).optional(),
  knowledgeBaseFiles: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    size: z.number(),
    url: z.string(),
    uploadedAt: z.date().or(z.string()),
  })).optional(),
  additionalContext: z.string().optional(),
  callingHours: z.object({
    start: z.string(),
    end: z.string(),
  }).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = InsertCampaign & {
  _id: string;
  progress: number;
  callsMade: number;
  goalsMet: number;
  knowledgeBaseFiles?: KnowledgeBaseFile[];
  startDate?: string;
  endDate?: string;
  createdAt: Date;
};

// Appointment Schema
export const insertAppointmentSchema = z.object({
  userId: z.string(),
  leadId: z.string(),
  leadName: z.string(),
  title: z.string().min(1),
  date: z.string(), // ISO date string
  time: z.string(),
  type: z.string().default("Zoom"),
  notes: z.string().optional(),
});

export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = InsertAppointment & {
  _id: string;
  createdAt: Date;
};

// User Settings Schema
export const updateSettingsSchema = z.object({
  dailyCallLimit: z.number().min(0).max(10000).optional(),
  dndEnabled: z.boolean().optional(),
  localPresenceDialing: z.boolean().optional(),
});

export type UpdateSettings = z.infer<typeof updateSettingsSchema>;
export type UserSettings = UpdateSettings & {
  _id: string;
  userId: string;
};

// Notes Schema
export const insertNoteSchema = z.object({
  userId: z.string(),
  title: z.string().min(1),
  content: z.string().min(1),
});

export const updateNoteSchema = insertNoteSchema.partial();

export type InsertNote = z.infer<typeof insertNoteSchema>;
export type UpdateNote = z.infer<typeof updateNoteSchema>;
export type Note = InsertNote & {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
};
