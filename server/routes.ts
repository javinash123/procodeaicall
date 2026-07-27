import type { Express, Request, Response } from "express";
import { Server } from "http";
import { storage } from "./storage";
import { connectDB, UserModel, CreditUsageModel, PlanModel } from "./db";
import crypto from "crypto";
import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import session from "express-session";
import MongoStore from "connect-mongo";
import multer from "multer";
import path from "path";
import fs from "fs";
import { generateCallScript, testOpenAI, generateAIResponse, generateTextResponse } from "./openaiService";
import { makeExotelCall, getWssUrl, terminateExotelCall } from "./exotelService";
import { phoneCallMap, callSidMap, callCreditTimers, normalizePhone } from "./callMap";
import { getV2Coordinator } from "./voice-engine/migration/CoordinatorBootstrap";
import { extractTextFromFile } from "./textExtractor";
import {
  insertUserSchema,
  updateUserSchema,
  changePasswordSchema,
  insertLeadSchema,
  insertCampaignSchema,
  insertAppointmentSchema,
  updateSettingsSchema,
  insertNoteSchema,
  updateNoteSchema,
  insertPlanSchema,
  insertFeatureSchema,
  insertNotificationSchema,
} from "@shared/schema";

// ... Configure multer for file uploads ...
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage: fileStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Allowed: PDF, DOC, DOCX, TXT, JPG, PNG, GIF, WEBP"));
    }
  },
});

// Extend session data
declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export async function registerRoutes(server: Server, app: Express): Promise<void> {
  // Connect to MongoDB
  await connectDB();

  // Health check — used by load balancers and uptime monitors
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Session middleware MUST be registered BEFORE routes
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is required");
  }

  // Secure cookie logic:
  //   - In dev: never secure (plain HTTP)
  //   - In production: secure by default, but can be overridden with COOKIE_SECURE=false
  //     (useful on EC2 when running HTTP-only without a TLS terminator, or during
  //     initial setup before SSL is configured).
  const cookieSecure =
    process.env.NODE_ENV === "production" &&
    process.env.COOKIE_SECURE !== "false";

  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      name: "aiagent.sid",
      rolling: true, // Refresh cookie expiry on each request
      // MongoDB-backed store: sessions survive server restarts.
      // Falls back to in-memory if MONGODB_URI is not set (local dev without DB).
      store: process.env.MONGODB_URI
        ? MongoStore.create({
            mongoUrl: process.env.MONGODB_URI,
            collectionName: "sessions",
            ttl: 60 * 60 * 24 * 7, // 1 week in seconds (matches cookie maxAge)
            touchAfter: 24 * 3600,  // only update the session once per 24h unless data changed
          })
        : undefined,
      cookie: {
        secure: cookieSecure,
        httpOnly: true,
        path: "/",
        maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
        sameSite: "lax",
      },
    })
  );

  // Auth middleware
  const requireAuth = (req: Request, res: Response, next: Function) => {
    if (!req.session || !req.session.userId) {
      if (req.headers.referer?.includes("/admin")) {
        return res.status(401).json({ message: "Unauthorized", redirectTo: `/admin` });
      }
      return res.status(401).json({ message: "Unauthorized", redirectTo: `/login` });
    }
    next();
  };

  // Helper: check if a subscription is expired
  function isSubscriptionExpired(user: any): boolean {
    if (!user.subscription?.renewalDate) return false;
    return new Date(user.subscription.renewalDate) < new Date();
  }

  // One-time migration: fix "Call Suport" typo → "Call Support" in all plan documents
  (async () => {
    try {
      const result = await PlanModel.updateMany(
        { features: "Call Suport" },
        { $set: { "features.$[elem]": "Call Support" } },
        { arrayFilters: [{ "elem": "Call Suport" }] }
      );
      if (result.modifiedCount > 0) {
        console.log(`[Migration] Fixed "Call Suport" typo in ${result.modifiedCount} plan(s).`);
      }
    } catch (e) {
      console.error("[Migration] Failed to fix Call Suport typo:", e);
    }
  })();

  // Map human-readable plan feature names (stored in DB) → system feature keys (used by gates)
  const PLAN_FEATURE_NAME_TO_KEY: Record<string, string> = {
    "Basic CRM": "crm",
    "AI Agent Call": "campaigns",
    "Scheduling": "calendar",
    "Bulk WhatsApp": "whatsapp",
    "Bulk SMS": "bulk_sms",
    "Call Support": "call_history",
    "Analytics": "analytics",
  };

  // Helper: resolve a user's plan feature keys from their subscription
  async function getUserPlanFeatures(userId: string): Promise<string[]> {
    try {
      const user = await storage.getUser(userId);
      if (!user) return [];
      if (user.role === "admin") return ["*"];
      if (!user.subscription?.plan) return [];
      // Block features if subscription is expired
      if (isSubscriptionExpired(user)) return [];
      const plans = await storage.getPlans();
      const plan = plans.find((p: any) => p.name === user.subscription?.plan && p.isActive !== false);
      if (!plan) return [];
      // Convert human-readable feature names to system feature keys
      const rawFeatures: string[] = (plan.features as string[]) || [];
      return rawFeatures
        .map((f) => PLAN_FEATURE_NAME_TO_KEY[f] ?? null)
        .filter((k): k is string => k !== null);
    } catch {
      return [];
    }
  }

  // Feature-gate middleware factory — blocks API access if user's plan lacks the feature
  const requireFeature = (featureKey: string) => async (req: Request, res: Response, next: Function) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(req.session.userId);
    if (user && isSubscriptionExpired(user)) {
      return res.status(403).json({
        message: "Your subscription has expired. Please renew to continue.",
        feature: featureKey,
        subscriptionExpired: true,
      });
    }
    const features = await getUserPlanFeatures(req.session.userId);
    if (features.includes("*") || features.includes(featureKey)) return next();
    return res.status(403).json({
      message: "Your current plan does not include this feature. Please upgrade to continue.",
      feature: featureKey,
      upgradeRequired: true,
    });
  };

  // Register
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already in use" });
      }
      const user = await storage.createUser(data);

      // Auto-assign subscription if a plan was selected during registration
      if (data.selectedPlanId) {
        const plan = await storage.getPlan(data.selectedPlanId);
        if (plan) {
          const isFree = plan.price === 0;
          await storage.updateUserSubscription(user._id, {
            plan: plan.name,
            status: isFree ? "Active" : "Inactive",
            monthlyCallCredits: isFree ? plan.credits : 0,
            creditsUsed: 0,
            purchasedCredits: 0,
            renewalDate: isFree
              ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              : undefined,
            joinedDate: new Date(),
          });
        }
      }

      res.status(201).json({ user });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      const userWithPassword: any = await storage.getUserByEmail(email);
      const isValid = await bcryptjs.compare(password, userWithPassword.password);
      
      if (!isValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      req.session.userId = user._id;
      const { password: _, ...userWithoutPassword } = userWithPassword;
      
      // Resolve plan features for this user
      const planFeatures = await getUserPlanFeatures(user._id);
      
      // Explicitly save session before responding
      req.session.save((err) => {
        if (err) {
          return res.status(500).json({ message: "Session save failed" });
        }
        res.json({ user: { ...userWithoutPassword, planFeatures } });
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current user
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const planFeatures = await getUserPlanFeatures(req.session.userId!);
      res.json({ user: { ...user, planFeatures } });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== USER ROUTES ====================
  
  // Get all users (admin only)
  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const users = await storage.getAllUsers();
      res.json({ users });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });


  // Update user profile
  app.patch("/api/user", requireAuth, async (req, res) => {
    try {
      const id = req.session.userId!;
      console.log("Updating user profile:", id, req.body);
      const updates = updateUserSchema.partial().parse(req.body);
      const user = await storage.updateUser(id, updates);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ user });
    } catch (error: any) {
      console.error("Profile update error:", error);
      res.status(400).json({ message: error.message });
    }
  });

  // Update user profile by ID (admin only or self)
  app.patch("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Users can only update their own profile unless admin
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "admin" && id !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const updates = updateUserSchema.parse(req.body);
      const user = await storage.updateUser(id, updates);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ user });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Change password — convenience route used by the dashboard (/api/user/change-password)
  app.post("/api/user/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      const success = await storage.changePassword(req.session.userId!, currentPassword, newPassword);
      if (!success) return res.status(400).json({ message: "Invalid current password" });
      res.json({ message: "Password changed successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Change password (legacy route — kept for backwards compatibility)
  app.post("/api/users/:id/password", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Users can only change their own password
      if (id !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      const success = await storage.changePassword(id, currentPassword, newPassword);
      
      if (!success) {
        return res.status(400).json({ message: "Invalid current password" });
      }
      
      res.json({ message: "Password changed successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ==================== LEAD ROUTES ====================
  
  // Get all leads for current user (optionally filter by campaign)
  app.get("/api/leads", requireAuth, requireFeature("crm"), async (req, res) => {
    try {
      const campaignId = req.query.campaignId as string | undefined;
      const leads = await storage.getLeads(req.session.userId!, campaignId);
      res.json({ leads });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get single lead
  app.get("/api/leads/:id", requireAuth, requireFeature("crm"), async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      
      // Verify ownership
      if (lead.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      res.json({ lead });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create lead
  app.post("/api/leads", requireAuth, requireFeature("crm"), async (req, res) => {
    try {
      const data = insertLeadSchema.parse({
        ...req.body,
        userId: req.session.userId,
      });
      
      const lead = await storage.createLead(data);
      res.status(201).json({ lead });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Update lead
  app.patch("/api/leads/:id", requireAuth, requireFeature("crm"), async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      
      if (lead.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const updatedLead = await storage.updateLead(req.params.id, req.body);
      res.json({ lead: updatedLead });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Delete lead
  app.delete("/api/leads/:id", requireAuth, requireFeature("crm"), async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      
      if (lead.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      await storage.deleteLead(req.params.id);
      res.json({ message: "Lead deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Add lead history entry
  app.post("/api/leads/:id/history", requireAuth, requireFeature("crm"), async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      
      if (lead.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const updatedLead = await storage.addLeadHistory(req.params.id, req.body);
      res.json({ lead: updatedLead });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ==================== OPENAI TEST ROUTE ====================

  // Simple test to verify OpenAI API is connected and working
  app.get("/api/test-openai", async (req, res) => {
    try {
      const message = await testOpenAI();
      res.json({ success: true, message });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Test AI response with a campaign's context (no auth required for quick testing)
  app.post("/api/test-ai", async (req, res) => {
    try {
      const { userInput, campaignId, leadData } = req.body;

      if (!userInput || typeof userInput !== "string") {
        return res.status(400).json({ message: "userInput is required" });
      }

      let campaign: any = null;
      if (campaignId) {
        campaign = await storage.getCampaign(campaignId);
        if (!campaign) {
          return res.status(404).json({ message: `Campaign not found: ${campaignId}` });
        }
      } else {
        // Fall back to any first campaign available
        campaign = await storage.getAnyCampaign();
      }

      if (!campaign) {
        return res.status(404).json({ message: "No campaigns found to use for context" });
      }

      const knowledgeBaseText = (campaign.knowledgeBaseFiles || [])
        .map((f: any) => f.extractedText)
        .filter(Boolean)
        .join("\n\n");

      const campaignData = {
        name: campaign.name,
        goal: campaign.goal,
        script: campaign.script || "",
        additionalContext: campaign.additionalContext || "",
        ai_generated_script: campaign.ai_generated_script || campaign.script || "",
        knowledge_base: (campaign.knowledgeBaseTexts || []).join("\n\n") || knowledgeBaseText,
        knowledgeBaseText,
      };

      const result = await generateAIResponse([], userInput, {
        ...campaignData,
        leadData: leadData || undefined,
      });
      res.json({ reply: result.reply, campaign: { id: campaign._id, name: campaign.name, goal: campaign.goal } });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to generate AI response" });
    }
  });

  // ==================== CAMPAIGN ROUTES ====================

  // Generate a conversational AI response within a campaign context
  app.post("/api/campaigns/ai-response", requireAuth, async (req, res) => {
    try {
      const { conversationHistory, userInput, campaignData, leadData } = req.body;

      if (!userInput || typeof userInput !== "string") {
        return res.status(400).json({ message: "userInput is required" });
      }
      if (!campaignData || !campaignData.goal) {
        return res.status(400).json({ message: "campaignData with goal is required" });
      }

      const history = Array.isArray(conversationHistory) ? conversationHistory : [];

      const result = await generateAIResponse(history, userInput, {
        ...campaignData,
        leadData: leadData || undefined,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to generate AI response" });
    }
  });

  // Quick test to trigger an Exotel call — accepts ?phone=xxx&campaignId=yyy
  app.get("/test-call", async (req, res) => {
    console.log(
      `[TEST-CALL]\noriginalUrl = ${req.originalUrl}\n` +
      `-------------------------\nreq.url = ${req.url}\n` +
      `-------------------------\nreq.query = ${JSON.stringify(req.query)}\n` +
      `-------------------------\ncampaignId = ${req.query.campaignId}\n` +
      `-------------------------\nphone = ${req.query.phone}`
    );
    const phone      = (req.query.phone      as string) || "+917828288001";
    const campaignId = (req.query.campaignId as string) || undefined;

    // ── V2: Register session before placing the call ──────────────────────────
    let v2SessionId: string | undefined;
    if (campaignId) {
      try {
        const session = await getV2Coordinator().createSession({ campaignId, phone });
        v2SessionId = session.sessionId;
        console.log(`[test-call] V2 session created: ${v2SessionId}`);
      } catch (err: any) {
        console.error(`[test-call] V2 session creation failed: ${err.message}`);
      }
    }

    // ── V1: Place the outbound call (unchanged) ───────────────────────────────
    const result = await makeExotelCall(phone);

    if (result.success && campaignId) {
      const TTL = 10 * 60 * 1000; // 10 min auto-cleanup

      // Primary: callSid → campaignId (exact match, most reliable)
      if (result.callSid) {
        callSidMap.set(result.callSid, campaignId);
        setTimeout(() => callSidMap.delete(result.callSid!), TTL);
        console.log(`[test-call] callSidMap: ${result.callSid} → ${campaignId}`);
      }

      // Fallback: phone → campaignId
      const phoneKey = normalizePhone(phone);
      phoneCallMap.set(phoneKey, campaignId);
      setTimeout(() => phoneCallMap.delete(phoneKey), TTL);
      console.log(`[test-call] phoneCallMap: ${phoneKey} → ${campaignId}`);

      // ── V2: Attach telephony identifiers to the registered session ──────────
      if (v2SessionId) {
        try {
          const coordinator = getV2Coordinator();
          if (result.callSid) coordinator.attachCallSid(v2SessionId, result.callSid);
          coordinator.attachPhone(v2SessionId, phone);
          console.log(`[test-call] V2 session ${v2SessionId} — callSid+phone attached`);
        } catch (err: any) {
          console.error(`[test-call] V2 attach failed: ${err.message}`);
        }
      }
    } else if (!result.success && v2SessionId) {
      // ── V2: Call failed — destroy the session, no leaked sessions ───────────
      try {
        getV2Coordinator().destroySession(v2SessionId);
        console.log(`[test-call] V2 session ${v2SessionId} destroyed (call failed)`);
      } catch (err: any) {
        console.error(`[test-call] V2 session destroy failed: ${err.message}`);
      }
    }

    const wssUrl = result.wssUrl || getWssUrl();
    if (result.success) {
      res.send(
        `Call triggered to ${phone} with campaign=${campaignId || "default"}. Check your phone!\n\n` +
        `Active stream URL: ${wssUrl}\n` +
        `If AI is silent, update your Exotel app to use this WebSocket URL.`
      );
    } else {
      res.status(500).send(`Failed to trigger call: ${result.error}\n\nExpected WSS URL: ${wssUrl}`);
    }
  });

  // Initiate an outbound call to a specific lead (CRM → Exotel)
  // Called by: client/src/lib/api.ts → leadsApi.initiateCall()
  app.post("/api/leads/:id/call", requireAuth, async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);

      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      if (lead.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (!lead.phone) {
        return res.status(400).json({ message: "Lead has no phone number" });
      }

      // ── Credit check before placing the call ───────────────────────────────
      const caller = await storage.getUser(req.session.userId!);
      if (caller?.subscription?.plan) {
        const allPlans = await storage.getPlans();
        const userPlan = allPlans.find((p: any) => p.name === caller.subscription!.plan);
        if (userPlan && (userPlan as any).callingRate > 0) {
          const available = (caller.subscription.monthlyCallCredits || 0)
            + ((caller.subscription as any).purchasedCredits || 0)
            - (caller.subscription.creditsUsed || 0);
          const minRequired = Math.ceil((userPlan as any).callingRate); // cost of 1 minute
          if (available < minRequired) {
            return res.status(402).json({
              message: `Insufficient credits. You need at least ${minRequired} credits for a 1-minute call. Available: ${available}. Please purchase more credits.`,
              creditsRequired: minRequired,
              creditsAvailable: available,
            });
          }
        }
      }

      const phone      = lead.phone as string;
      const campaignId = lead.campaignId ? String(lead.campaignId) : undefined;

      // ── V2: Register session before placing the call ────────────────────────
      let v2SessionId: string | undefined;
      if (campaignId) {
        try {
          const v2Session = await getV2Coordinator().createSession({ campaignId, phone });
          v2SessionId = v2Session.sessionId;
          console.log(`[leads/call] V2 session created: ${v2SessionId} for lead ${lead._id}`);
        } catch (err: any) {
          console.error(`[leads/call] V2 session creation failed: ${err.message}`);
        }
      }

      // ── V1: Place the outbound call (unchanged) ─────────────────────────────
      const result = await makeExotelCall(phone);

      if (result.success) {
        const TTL = 10 * 60 * 1000; // 10 min auto-cleanup

        if (campaignId) {
          if (result.callSid) {
            callSidMap.set(result.callSid, campaignId);
            setTimeout(() => callSidMap.delete(result.callSid!), TTL);
          }
          const phoneKey = normalizePhone(phone);
          phoneCallMap.set(phoneKey, campaignId);
          setTimeout(() => phoneCallMap.delete(phoneKey), TTL);
        }

        // ── V2: Attach telephony identifiers ───────────────────────────────────
        if (v2SessionId) {
          try {
            const coordinator = getV2Coordinator();
            if (result.callSid) coordinator.attachCallSid(v2SessionId, result.callSid);
            coordinator.attachPhone(v2SessionId, phone);
            console.log(`[leads/call] V2 session ${v2SessionId} — callSid+phone attached`);
          } catch (err: any) {
            console.error(`[leads/call] V2 attach failed: ${err.message}`);
          }
        }

        // ── Credit-based call timer: hang up when credits run out ──────────────
        if (result.callSid) {
          try {
            const timerUser = await storage.getUser(req.session.userId!);
            if (timerUser?.subscription?.plan) {
              const allTimerPlans = await storage.getPlans();
              const timerPlan = allTimerPlans.find((p: any) => p.name === timerUser.subscription!.plan) as any;
              if (timerPlan?.callingRate > 0) {
                const available = (timerUser.subscription.monthlyCallCredits || 0)
                  + ((timerUser.subscription as any).purchasedCredits || 0)
                  - (timerUser.subscription.creditsUsed || 0);
                // maxSeconds = (credits / rate_per_min) * 60, rounded down
                const maxSeconds = Math.floor((available / timerPlan.callingRate) * 60);
                if (maxSeconds > 0) {
                  const sid = result.callSid;
                  const timer = setTimeout(async () => {
                    callCreditTimers.delete(sid);
                    console.log(`[credits] Max call duration (${maxSeconds}s) reached for ${sid} — terminating`);
                    await terminateExotelCall(sid);
                  }, maxSeconds * 1000);
                  callCreditTimers.set(sid, timer);
                  console.log(`[credits] Call ${sid} — credit timer set for ${maxSeconds}s (${available} credits @ ₹${timerPlan.callingRate}/min)`);
                }
              }
            }
          } catch (timerErr: any) {
            console.error("[credits] Failed to set call timer:", timerErr.message);
          }
        }

        res.json({
          success:   true,
          callSid:   result.callSid,
          wssUrl:    result.wssUrl || getWssUrl(),
          v2Session: v2SessionId ?? null,
        });
      } else {
        // ── V2: Call failed — no leaked sessions ───────────────────────────────
        if (v2SessionId) {
          try {
            getV2Coordinator().destroySession(v2SessionId);
            console.log(`[leads/call] V2 session ${v2SessionId} destroyed (call failed)`);
          } catch (err: any) {
            console.error(`[leads/call] V2 session destroy failed: ${err.message}`);
          }
        }

        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to initiate call" });
    }
  });

  // Returns the current WebSocket stream URL — use this to configure the Exotel app
  app.get("/api/config/stream-url", (req, res) => {
    const wssUrl = getWssUrl();
    console.log(`[config] stream URL requested: ${wssUrl}`);
    res.json({ wssUrl, hint: "Configure your Exotel app to use this WebSocket URL for bidirectional streaming." });
  });

  // Exotel fetches this when the customer answers.
  // Returns a bidirectional Stream to our voicebot WebSocket.
  app.get("/exotel/voice", (req, res) => {
    res.set("Content-Type", "text/xml");

    const publicBase =
      process.env.PUBLIC_URL ||
      (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null) ||
      "https://nijvox.com";

    const publicWss = publicBase.replace(/^https?:\/\//, "wss://");

    const streamUrl = `${publicWss}/exotel-stream`;
    console.log(`[exotel/voice] returning Stream → ${streamUrl}`);

    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" bidirectional="true" audioTrack="inbound_track" contentType="audio/x-mulaw;rate=8000" />
  </Connect>
</Response>`);
  });

  // ==================== EXOTEL WEBHOOK ====================

  // Receive call status updates from Exotel (answered, missed, failed, completed, etc.)
  app.post("/webhook/exotel", async (req, res) => {
    try {
      const payload = req.body as Record<string, any>;

      const callSid     = payload.CallSid || payload.call_sid || payload.sid || "";
      const rawStatus   = (payload.Status || payload.CallStatus || payload.call_status || "unknown").toLowerCase();
      const to          = payload.To || payload.to || payload.DialTo || "";
      const from        = payload.From || payload.from || payload.CallFrom || "";
      const duration    = parseInt(payload.Duration || payload.RecordingDuration || "0", 10);
      const recordingUrl = payload.RecordingUrl || payload.recording_url || undefined;
      const startTime   = payload.StartTime ? new Date(payload.StartTime) : undefined;
      const endTime     = payload.EndTime   ? new Date(payload.EndTime)   : undefined;

      if (!callSid) {
        return res.status(400).json({ message: "CallSid is required" });
      }

      // Normalise Exotel statuses to our vocabulary
      const statusMap: Record<string, string> = {
        completed:   "answered",
        answered:    "answered",
        "in-progress": "answered",
        busy:        "missed",
        "no-answer": "missed",
        failed:      "failed",
        canceled:    "failed",
      };
      const status = statusMap[rawStatus] || rawStatus;

      // Try to find matching lead by phone number (strip non-digits for comparison)
      const digits = (num: string) => num.replace(/\D/g, "");
      let leadId: string | undefined;
      if (to) {
        const { LeadModel } = await import("./db");
        const lead = await LeadModel.findOne({ phone: { $regex: digits(to).slice(-10) } }).lean();
        if (lead) leadId = (lead as any)._id.toString();
      }

      const logEntry = {
        callSid,
        status,
        from,
        to,
        duration,
        recordingUrl,
        startTime,
        endTime,
        leadId,
        rawPayload: payload,
      };

      // ── Clear credit timer if the call ended naturally ─────────────────────
      if (callSid && callCreditTimers.has(callSid)) {
        clearTimeout(callCreditTimers.get(callSid)!);
        callCreditTimers.delete(callSid);
        console.log(`[credits] Credit timer cleared for ${callSid} (call ended via webhook)`);
      }

      const callLog = await storage.upsertCallLog(callSid, logEntry);

      // If we found a lead, add a history entry so the timeline updates
      if (leadId) {
        const outcomeLabel = status === "answered"
          ? `Call answered (${duration}s)`
          : status === "missed" ? "Call missed" : "Call failed";

        await storage.addLeadHistory(leadId, {
          type: "call",
          date: startTime || new Date(),
          duration: duration ? `${duration}s` : undefined,
          outcome: status,
          note: outcomeLabel,
        });

        // ── Credit deduction for answered calls ─────────────────────────────
        if (status === "answered" && duration > 0) {
          try {
            const { LeadModel: LM } = await import("./db");
            const leadDoc = await LM.findById(leadId).lean() as any;
            if (leadDoc?.userId) {
              const callerUser = await storage.getUser(leadDoc.userId.toString());
              if (callerUser?.subscription?.plan) {
                const allPlans = await storage.getPlans();
                const userPlan = allPlans.find((p: any) => p.name === callerUser.subscription!.plan);
                if (userPlan && (userPlan as any).callingRate > 0) {
                  const minutes = Math.ceil(duration / 60);
                  const creditsToDeduct = Math.ceil(minutes * (userPlan as any).callingRate);
                  if (creditsToDeduct > 0) {
                    await storage.deductCredits(
                      leadDoc.userId.toString(),
                      creditsToDeduct,
                      "call",
                      `Call to ${to} (${duration}s, ${minutes} min × ₹${(userPlan as any).callingRate}/min = ${creditsToDeduct} credits)`
                    );
                  }
                }
              }
            }
          } catch (creditErr: any) {
            console.error("Credit deduction error:", creditErr.message);
          }
        }
      }

      res.json({ received: true, callSid, status, leadId: leadId || null });
    } catch (error: any) {
      console.error("Exotel webhook error:", error);
      res.status(500).json({ message: error.message || "Webhook processing failed" });
    }
  });

  // Get stored call logs (authenticated)
  app.get("/api/call-logs", requireAuth, requireFeature("call_history"), async (req, res) => {
    try {
      const { leadId, campaignId } = req.query as { leadId?: string; campaignId?: string };
      const logs = await storage.getCallLogs({ leadId, campaignId });
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Generate AI-powered dashboard insights
  app.post("/api/insights", requireAuth, async (req, res) => {
    try {
      const {
        totalLeads, interestedLeads, followUpLeads, closedLeads,
        activeCampaigns, totalCampaigns, todaysCalls, totalCalls,
        upcomingAppointments, topCampaign,
      } = req.body;

      const prompt = `You are an expert sales analytics AI. Based on the following CRM metrics, generate exactly 4 concise, actionable insights for a sales team. Each insight must be 1-2 sentences, specific to the numbers given, and focus on a distinct aspect (conversion, follow-up, activity, or performance). Return a JSON array of 4 strings only — no keys, no markdown, no extra text.

Metrics:
- Total leads: ${totalLeads}
- Interested leads: ${interestedLeads} (${totalLeads > 0 ? Math.round(interestedLeads / totalLeads * 100) : 0}% conversion)
- Leads needing follow-up: ${followUpLeads}
- Closed deals: ${closedLeads}
- Active campaigns: ${activeCampaigns} of ${totalCampaigns} total
- Calls today: ${todaysCalls}
- Total calls logged: ${totalCalls}
- Upcoming appointments: ${upcomingAppointments}
${topCampaign ? `- Top campaign: "${topCampaign.name}" with ${topCampaign.closed} closed leads` : ""}

Return only a JSON array like: ["insight 1","insight 2","insight 3","insight 4"]`;

      const raw = await generateTextResponse(prompt);
      // Parse the JSON array — strip any accidental markdown fences
      const cleaned = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
      let insights: string[];
      try {
        insights = JSON.parse(cleaned);
        if (!Array.isArray(insights)) throw new Error("not an array");
        insights = insights.filter(s => typeof s === "string").slice(0, 5);
      } catch {
        // Fallback: split on newlines if JSON parse fails
        insights = cleaned.split(/\n+/).filter(l => l.trim().length > 10).slice(0, 4);
      }

      res.json({ insights });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to generate insights" });
    }
  });

  // Generate AI call script using OpenAI
  app.post("/api/campaigns/generate-script", requireAuth, async (req, res) => {
    try {
      const { campaignGoal, existingScript, additionalContext, campaignName, knowledgeBaseText } = req.body;

      if (!campaignGoal) {
        return res.status(400).json({ message: "campaignGoal is required" });
      }

      const result = await generateCallScript({
        campaignGoal,
        existingScript,
        additionalContext,
        campaignName,
        knowledgeBaseText,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to generate script" });
    }
  });

  // Get all campaigns
  app.get("/api/campaigns", requireAuth, requireFeature("campaigns"), async (req, res) => {
    try {
      const campaigns = await storage.getCampaigns(req.session.userId!);
      res.json({ campaigns });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get single campaign
  app.get("/api/campaigns/:id", requireAuth, requireFeature("campaigns"), async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      if (campaign.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      res.json({ campaign });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create campaign
  app.post("/api/campaigns", requireAuth, requireFeature("campaigns"), async (req, res) => {
    try {
      const data = insertCampaignSchema.parse({
        ...req.body,
        userId: req.session.userId,
      });

      const campaign = await storage.createCampaign(data);

      // Auto-generate AI script after saving (non-blocking background task)
      const campaignId = campaign._id;
      (async () => {
        try {
          // Collect extracted text from all knowledge base files
          const knowledgeBaseText = (data.knowledgeBaseFiles || [])
            .map((f: any) => f.extractedText)
            .filter(Boolean)
            .join("\n\n");

          const { script } = await generateCallScript({
            campaignGoal: data.goal,
            existingScript: data.script,
            additionalContext: data.additionalContext,
            campaignName: data.name,
            knowledgeBaseText: knowledgeBaseText || undefined,
          });

          await storage.updateCampaign(campaignId, { ai_generated_script: script } as any);
          console.log(`[AI] Generated script saved for campaign ${campaignId}`);
        } catch (err: any) {
          console.error(`[AI] Failed to generate script for campaign ${campaignId}:`, err.message);
        }
      })();

      res.status(201).json({ campaign });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Update campaign
  app.patch("/api/campaigns/:id", requireAuth, requireFeature("campaigns"), async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      if (campaign.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const updatedCampaign = await storage.updateCampaign(req.params.id, req.body);
      res.json({ campaign: updatedCampaign });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Delete campaign
  app.delete("/api/campaigns/:id", requireAuth, requireFeature("campaigns"), async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      if (campaign.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      await storage.deleteCampaign(req.params.id);
      res.json({ message: "Campaign deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== NOTIFICATION ROUTES ====================

  // Get all notifications
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const notifications = await storage.getNotifications();
      res.json({ notifications });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create notification (admin only)
  app.post("/api/notifications", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const data = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(data);
      res.status(201).json({ notification });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Mark notification as read
  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      await storage.markNotificationRead(req.params.id, req.session.userId!);
      res.json({ message: "Notification marked as read" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== FILE UPLOAD ROUTES ====================

  // Serve uploaded files
  const express = await import("express");
  app.use("/uploads", express.default.static(uploadDir));

  // Upload files for campaign knowledge base (with text extraction for PDF/DOCX/TXT)
  app.post("/api/upload", requireAuth, upload.array("files", 10), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      const uploadedFiles = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(uploadDir, file.filename);
          const extractedText = await extractTextFromFile(filePath, file.mimetype);

          return {
            id: file.filename.split("-")[0] + "-" + file.filename.split("-")[1],
            name: file.originalname,
            type: file.mimetype,
            size: file.size,
            url: `/uploads/${file.filename}`,
            uploadedAt: new Date(),
            extractedText: extractedText || undefined,
          };
        })
      );

      res.json({ files: uploadedFiles });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Delete uploaded file
  app.delete("/api/upload/:filename", requireAuth, async (req, res) => {
    try {
      const filePath = path.join(uploadDir, req.params.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      res.json({ message: "File deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get single plan
  app.get("/api/plans/:id", async (req, res) => {
    try {
      const plan = await storage.getPlan(req.params.id);
      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }
      res.json(plan);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Upgrade plan
  app.post("/api/billing/upgrade", requireAuth, async (req, res) => {
    try {
      const { planId } = req.body;
      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }
      
      const user = await storage.updateUserSubscription(req.session.userId!, {
        plan: plan.name,
        status: "Active",
        monthlyCallCredits: plan.credits,
        creditsUsed: 0,
        purchasedCredits: 0,
        renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        joinedDate: new Date(),
      });
      
      res.json({ user });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ==================== CREDIT PURCHASE ROUTES ====================

  // Buy extra credits (called client-side after successful Razorpay payment)
  app.post("/api/billing/buy-credits", requireAuth, async (req, res) => {
    try {
      const { credits } = req.body;
      if (!credits || typeof credits !== "number" || credits <= 0) {
        return res.status(400).json({ message: "Invalid credits amount" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.subscription) {
        return res.status(400).json({ message: "No active subscription" });
      }

      // Validate against plan limits
      const allPlans = await storage.getPlans();
      const userPlan = allPlans.find((p: any) => p.name === user.subscription!.plan) as any;
      if (!userPlan) {
        return res.status(400).json({ message: "Plan not found" });
      }
      if (!userPlan.extraCreditPrice || userPlan.extraCreditPrice <= 0) {
        return res.status(400).json({ message: "Credit purchases are not enabled for your plan" });
      }
      if (userPlan.maxCreditPurchase > 0 && credits > userPlan.maxCreditPurchase) {
        return res.status(400).json({ message: `Maximum ${userPlan.maxCreditPurchase} credits can be purchased at once` });
      }

      const updatedUser = await storage.addPurchasedCredits(
        req.session.userId!,
        credits,
        `Purchased ${credits} extra credits at ₹${userPlan.extraCreditPrice}/credit`
      );

      res.json({ user: updatedUser, creditsAdded: credits });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get credit usage history
  app.get("/api/credits/usage", requireAuth, async (req, res) => {
    try {
      const limit = parseInt((req.query.limit as string) || "50");
      const usage = await storage.getCreditUsage(req.session.userId!, limit);
      res.json(usage);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== SMS / WHATSAPP PROXY ROUTES ====================

  // Send bulk SMS via Gupshup (deducts smsRate credits per message)
  app.post("/api/sms/send", requireAuth, requireFeature("bulk_sms"), async (req, res) => {
    try {
      const { leadIds, message } = req.body as { leadIds: string[]; message: string };
      if (!leadIds?.length || !message?.trim()) {
        return res.status(400).json({ message: "leadIds and message are required" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user?.gupshupConfig?.apiKey || !user?.gupshupConfig?.userId) {
        return res.status(400).json({ message: "Gupshup is not configured. Please add your API credentials in Settings." });
      }

      const allPlans = await storage.getPlans();
      const userPlan = allPlans.find((p: any) => p.name === user.subscription?.plan) as any;
      const smsRate: number = userPlan?.smsRate || 0;

      const available = (user.subscription?.monthlyCallCredits || 0)
        + ((user.subscription as any)?.purchasedCredits || 0)
        - (user.subscription?.creditsUsed || 0);

      const totalCostCredits = Math.ceil(smsRate * leadIds.length);
      if (smsRate > 0 && available < totalCostCredits) {
        return res.status(402).json({
          message: `Insufficient credits. Sending ${leadIds.length} SMS requires ${totalCostCredits} credits. Available: ${available}.`,
          creditsRequired: totalCostCredits,
          creditsAvailable: available,
        });
      }

      // Fetch leads to get phone numbers
      const results: { leadId: string; success: boolean; error?: string }[] = [];
      for (const leadId of leadIds) {
        const lead = await storage.getLead(leadId);
        if (!lead || lead.userId !== req.session.userId) {
          results.push({ leadId, success: false, error: "Lead not found" });
          continue;
        }
        try {
          const gupshupRes = await fetch(
            `https://api.gupshup.io/sm/api/v1/msg`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "apikey": user.gupshupConfig.apiKey,
              },
              body: new URLSearchParams({
                channel: "sms",
                source: user.gupshupConfig.userId,
                destination: lead.phone,
                message: JSON.stringify({ type: "text", text: message }),
                "src.name": user.gupshupConfig.userId,
              }).toString(),
            }
          );
          const ok = gupshupRes.ok;
          results.push({ leadId, success: ok, error: ok ? undefined : await gupshupRes.text() });
        } catch (err: any) {
          results.push({ leadId, success: false, error: err.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      // Deduct credits only for successfully sent messages
      if (smsRate > 0 && successCount > 0) {
        const creditsToDeduct = Math.ceil(smsRate * successCount);
        await storage.deductCredits(
          req.session.userId!,
          creditsToDeduct,
          "sms",
          `Bulk SMS: ${successCount} messages sent (${creditsToDeduct} credits @ ₹${smsRate}/msg)`
        );
      }

      res.json({ sent: successCount, failed: results.length - successCount, results });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Send WhatsApp message via Gupshup (deducts whatsappRate credits per message)
  app.post("/api/whatsapp/send", requireAuth, requireFeature("whatsapp"), async (req, res) => {
    try {
      const { leadIds, message, templateId } = req.body as { leadIds: string[]; message: string; templateId?: string };
      if (!leadIds?.length || !message?.trim()) {
        return res.status(400).json({ message: "leadIds and message are required" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user?.gupshupConfig?.apiKey || !user?.gupshupConfig?.userId) {
        return res.status(400).json({ message: "Gupshup is not configured. Please add your API credentials in Settings." });
      }

      const allPlans = await storage.getPlans();
      const userPlan = allPlans.find((p: any) => p.name === user.subscription?.plan) as any;
      const waRate: number = userPlan?.whatsappRate || 0;

      const available = (user.subscription?.monthlyCallCredits || 0)
        + ((user.subscription as any)?.purchasedCredits || 0)
        - (user.subscription?.creditsUsed || 0);

      const totalCostCredits = Math.ceil(waRate * leadIds.length);
      if (waRate > 0 && available < totalCostCredits) {
        return res.status(402).json({
          message: `Insufficient credits. Sending ${leadIds.length} WhatsApp messages requires ${totalCostCredits} credits. Available: ${available}.`,
          creditsRequired: totalCostCredits,
          creditsAvailable: available,
        });
      }

      const results: { leadId: string; success: boolean; error?: string }[] = [];
      for (const leadId of leadIds) {
        const lead = await storage.getLead(leadId);
        if (!lead || lead.userId !== req.session.userId) {
          results.push({ leadId, success: false, error: "Lead not found" });
          continue;
        }
        try {
          const gupshupRes = await fetch(
            `https://api.gupshup.io/sm/api/v1/msg`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "apikey": user.gupshupConfig.apiKey,
              },
              body: new URLSearchParams({
                channel: "whatsapp",
                source: user.gupshupConfig.userId,
                destination: lead.phone,
                message: JSON.stringify({ type: "text", text: message }),
                "src.name": user.gupshupConfig.userId,
                ...(templateId ? { template: templateId } : {}),
              }).toString(),
            }
          );
          const ok = gupshupRes.ok;
          results.push({ leadId, success: ok, error: ok ? undefined : await gupshupRes.text() });
        } catch (err: any) {
          results.push({ leadId, success: false, error: err.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      if (waRate > 0 && successCount > 0) {
        const creditsToDeduct = Math.ceil(waRate * successCount);
        await storage.deductCredits(
          req.session.userId!,
          creditsToDeduct,
          "whatsapp",
          `WhatsApp: ${successCount} messages sent (${creditsToDeduct} credits @ ₹${waRate}/msg)`
        );
      }

      res.json({ sent: successCount, failed: results.length - successCount, results });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Renew subscription (called after successful Razorpay payment for renewal)
  app.post("/api/billing/renew", requireAuth, async (req, res) => {
    try {
      const { planId } = req.body;
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.subscription) {
        return res.status(400).json({ message: "No active subscription" });
      }

      // Look up plan to get fresh credits/name (planId optional — falls back to current plan)
      let plan: any = null;
      if (planId) {
        plan = await storage.getPlan(planId);
      } else {
        const allPlans = await storage.getPlans();
        plan = allPlans.find((p: any) => p.name === user.subscription!.plan);
      }

      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }

      // Calculate new renewalDate based on plan duration
      const durationMs: Record<string, number> = {
        monthly: 30 * 24 * 60 * 60 * 1000,
        quarterly: 90 * 24 * 60 * 60 * 1000,
        yearly: 365 * 24 * 60 * 60 * 1000,
        lifetime: 100 * 365 * 24 * 60 * 60 * 1000,
      };
      const ms = durationMs[plan.duration] ?? durationMs.monthly;

      const updatedUser = await storage.updateUserSubscription(req.session.userId!, {
        plan: plan.name,
        status: "Active",
        monthlyCallCredits: plan.credits,
        creditsUsed: 0,
        purchasedCredits: 0, // reset purchased credits on renewal
        renewalDate: new Date(Date.now() + ms),
        joinedDate: user.subscription.joinedDate, // preserve original join date
      });

      res.json({ user: updatedUser });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ==================== APPOINTMENT ROUTES ====================
  
  // Get all appointments
  app.get("/api/appointments", requireAuth, requireFeature("calendar"), async (req, res) => {
    try {
      const appointments = await storage.getAppointments(req.session.userId!);
      res.json({ appointments });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get single appointment
  app.get("/api/appointments/:id", requireAuth, requireFeature("calendar"), async (req, res) => {
    try {
      const appointment = await storage.getAppointment(req.params.id);
      
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      
      if (appointment.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      res.json({ appointment });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create appointment
  app.post("/api/appointments", requireAuth, requireFeature("calendar"), async (req, res) => {
    try {
      const data = insertAppointmentSchema.parse({
        ...req.body,
        userId: req.session.userId,
      });
      
      const appointment = await storage.createAppointment(data);
      res.status(201).json({ appointment });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Update appointment
  app.patch("/api/appointments/:id", requireAuth, requireFeature("calendar"), async (req, res) => {
    try {
      const appointment = await storage.getAppointment(req.params.id);
      
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      
      if (appointment.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const updatedAppointment = await storage.updateAppointment(req.params.id, req.body);
      res.json({ appointment: updatedAppointment });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Delete appointment
  app.delete("/api/appointments/:id", requireAuth, requireFeature("calendar"), async (req, res) => {
    try {
      const appointment = await storage.getAppointment(req.params.id);
      
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      
      if (appointment.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      await storage.deleteAppointment(req.params.id);
      res.json({ message: "Appointment deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== SETTINGS ROUTES ====================
  
  // Get user settings
  app.get("/api/settings", requireAuth, async (req, res) => {
    try {
      const user = await storage.getSettings(req.session.userId!);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ settings: user.settings, subscription: user.subscription, exotelConfig: user.exotelConfig, gupshupConfig: user.gupshupConfig });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get Admin Exotel Config
  app.get("/api/admin/exotel", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
      const config = await storage.getAdminSettings();
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update Admin Exotel Config
  app.post("/api/admin/exotel", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (user?.role !== "admin") return res.status(403).json({ message: "Forbidden" });
      const config = await storage.updateAdminSettings(req.body);
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update User Exotel Config
  app.post("/api/user/exotel", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      
      const plan = await storage.getPlans().then(plans => plans.find(p => p.name === user.subscription?.plan));
      if (user.role !== "admin" && !plan?.selfBranding) {
        return res.status(403).json({ message: "Plan does not support self-branding" });
      }
      
      const updatedUser = await storage.updateExotelConfig(user._id, req.body);
      res.json({ user: updatedUser });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update User Gupshup Config
  app.post("/api/user/gupshup", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });

      const plan = await storage.getPlans().then(plans => plans.find(p => p.name === user.subscription?.plan));
      if (user.role !== "admin" && !plan?.selfBranding) {
        return res.status(403).json({ message: "Plan does not support self-branding" });
      }

      const updatedUser = await storage.updateGupshupConfig(user._id, req.body);
      res.json({ user: updatedUser });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update user settings
  app.patch("/api/settings", requireAuth, async (req, res) => {
    try {
      const settings = updateSettingsSchema.parse(req.body);
      const user = await storage.updateSettings(req.session.userId!, settings);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ settings: user.settings });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ==================== NOTES ROUTES ====================

  // Get all notes
  app.get("/api/notes", requireAuth, async (req, res) => {
    try {
      const notes = await storage.getNotes(req.session.userId!);
      res.json({ notes });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create note
  app.post("/api/notes", requireAuth, async (req, res) => {
    try {
      const data = insertNoteSchema.parse({
        ...req.body,
        userId: req.session.userId,
      });
      const note = await storage.createNote(data);
      res.status(201).json({ note });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Update note
  app.patch("/api/notes/:id", requireAuth, async (req, res) => {
    try {
      const note = await storage.getNote(req.params.id);
      if (!note) {
        return res.status(404).json({ message: "Note not found" });
      }
      if (note.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const updatedNote = await storage.updateNote(req.params.id, req.body);
      res.json({ note: updatedNote });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Delete note
  app.delete("/api/notes/:id", requireAuth, async (req, res) => {
    try {
      const note = await storage.getNote(req.params.id);
      if (!note) {
        return res.status(404).json({ message: "Note not found" });
      }
      if (note.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteNote(req.params.id);
      res.json({ message: "Note deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== PLAN ROUTES ====================

  // Get all plans
  app.get("/api/plans", async (req, res) => {
    try {
      const plans = await storage.getPlans();
      res.json({ plans });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get all features
  app.get("/api/features", async (req, res) => {
    try {
      const features = await storage.getFeatures();
      res.json({ features });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create feature (admin only)
  app.post("/api/features", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (user?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const data = insertFeatureSchema.parse(req.body);
      const feature = await storage.createFeature(data);
      res.status(201).json({ feature });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Delete feature (admin only)
  app.delete("/api/features/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (user?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const success = await storage.deleteFeature(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Feature not found" });
      }
      res.json({ message: "Feature deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin assign plan to a user
  app.post("/api/admin/users/:userId/assign-plan", requireAuth, async (req, res) => {
    try {
      const admin = await storage.getUser(req.session.userId!);
      if (admin?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { planId } = req.body;
      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }
      const updatedUser = await storage.updateUserSubscription(req.params.userId, {
        plan: plan.name,
        status: "Active",
        monthlyCallCredits: plan.credits,
        creditsUsed: 0,
        purchasedCredits: 0,
        renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        joinedDate: new Date(),
      });
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ user: updatedUser });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Create plan (admin only)
  app.post("/api/plans", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (user?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const data = insertPlanSchema.parse(req.body);
      const plan = await storage.createPlan(data);
      res.status(201).json({ plan });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Update plan (admin only)
  app.patch("/api/plans/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (user?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const updatedPlan = await storage.updatePlan(req.params.id, req.body);
      if (!updatedPlan) {
        return res.status(404).json({ message: "Plan not found" });
      }
      res.json({ plan: updatedPlan });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Delete plan (admin only)
  app.delete("/api/plans/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (user?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const success = await storage.deletePlan(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Plan not found" });
      }
      res.json({ message: "Plan deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== PASSWORD RESET ====================

  // Request password reset — generate token, store it, log reset URL
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      const user = await storage.getUserByEmail(email);
      // Always return success to prevent email enumeration
      if (!user) {
        return res.json({ message: "If an account with that email exists, a reset link has been sent." });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await UserModel.findByIdAndUpdate(user._id, {
        resetPasswordToken: token,
        resetPasswordExpiry: expiry,
      });

      const host = req.get("host") || "localhost:5000";
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const resetUrl = `${protocol}://${host}/reset-password?token=${token}`;

      // Log to console — wire up an email provider here when ready
      console.log(`[Password Reset] Link for ${email}: ${resetUrl}`);

      res.json({ message: "If an account with that email exists, a reset link has been sent." });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Consume reset token and set new password
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ message: "Token and password are required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const user = await UserModel.findOne({
        resetPasswordToken: token,
        resetPasswordExpiry: { $gt: new Date() },
      }).lean();

      if (!user) {
        return res.status(400).json({ message: "Reset link is invalid or has expired." });
      }

      const hashed = await bcryptjs.hash(password, 10);
      await UserModel.findByIdAndUpdate((user as any)._id, {
        password: hashed,
        $unset: { resetPasswordToken: "", resetPasswordExpiry: "" },
      });

      res.json({ message: "Password reset successfully. You can now log in." });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== CREDIT USAGE DAILY CHART ====================

  // Returns per-day aggregated credit deductions for the billing chart
  app.get("/api/credits/usage/daily", requireAuth, async (req, res) => {
    try {
      const month = parseInt((req.query.month as string) ?? String(new Date().getMonth()));
      const year  = parseInt((req.query.year  as string) ?? String(new Date().getFullYear()));

      const start = new Date(year, month, 1);
      const end   = new Date(year, month + 1, 0, 23, 59, 59, 999);

      const records = await CreditUsageModel.find({
        userId:    new mongoose.Types.ObjectId(req.session.userId!),
        createdAt: { $gte: start, $lte: end },
        amount:    { $lt: 0 }, // deductions only
      }).lean();

      const byDay: Record<number, { call: number; sms: number; whatsapp: number }> = {};
      for (const r of records as any[]) {
        const day = new Date(r.createdAt).getDate();
        if (!byDay[day]) byDay[day] = { call: 0, sms: 0, whatsapp: 0 };
        const amt = Math.abs(r.amount);
        if (r.type === "call")      byDay[day].call      += amt;
        else if (r.type === "sms")  byDay[day].sms       += amt;
        else if (r.type === "whatsapp") byDay[day].whatsapp += amt;
      }

      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const result = Array.from({ length: daysInMonth }, (_, i) => ({
        date:      i + 1,
        call:      Math.round(byDay[i + 1]?.call      ?? 0),
        sms:       Math.round(byDay[i + 1]?.sms       ?? 0),
        whatsapp:  Math.round(byDay[i + 1]?.whatsapp  ?? 0),
      }));

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Monthly channel usage — count of credit-deduction records per type per month ──
  // Used by the Analytics tab WP/SMS performance charts.
  app.get("/api/analytics/monthly-usage", requireAuth, async (req, res) => {
    try {
      const year  = parseInt((req.query.year  as string) ?? String(new Date().getFullYear()));
      const start = new Date(year, 0, 1);
      const end   = new Date(year, 11, 31, 23, 59, 59, 999);

      const records = await CreditUsageModel.find({
        userId:    new mongoose.Types.ObjectId(req.session.userId!),
        createdAt: { $gte: start, $lte: end },
        amount:    { $lt: 0 },
      }).lean();

      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const byMonth: Record<number, { whatsapp: number; sms: number }> = {};
      for (let i = 0; i < 12; i++) byMonth[i] = { whatsapp: 0, sms: 0 };

      for (const r of records as any[]) {
        const m = new Date(r.createdAt).getMonth();
        if      (r.type === "whatsapp") byMonth[m].whatsapp++;
        else if (r.type === "sms")      byMonth[m].sms++;
      }

      res.json(months.map((m, i) => ({ m, whatsapp: byMonth[i].whatsapp, sms: byMonth[i].sms })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
