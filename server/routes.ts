import type { Express, Request, Response } from "express";
import { Server } from "http";
import { storage } from "./storage";
import { connectDB } from "./db";
import bcryptjs from "bcryptjs";
import session from "express-session";
import multer from "multer";
import path from "path";
import fs from "fs";
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

  // Session middleware MUST be registered BEFORE routes
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "nijvox-secret-key-change-in-production",
      resave: true,
      saveUninitialized: true,
      name: "aiagent.sid",
      rolling: true, // Force session cookie to be set on every response
      cookie: {
        secure: false, // Changed to false for HTTP EC2 instance
        httpOnly: true,
        path: "/", // Use root path for all environments to ensure cookie is always sent
        maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
        sameSite: "lax"
      },
    })
  );

  // Auth middleware
  const requireAuth = (req: Request, res: Response, next: Function) => {
    if (!req.session || !req.session.userId) {
      const isProduction = process.env.NODE_ENV === "production";
      const base = isProduction ? "/aiagent" : "";
      
      if (req.headers.referer?.includes("/admin")) {
        return res.status(401).json({ message: "Unauthorized", redirectTo: `${base}/admin` });
      }
      return res.status(401).json({ message: "Unauthorized", redirectTo: `${base}/login` });
    }
    next();
  };

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
      
      // Explicitly save session before responding
      req.session.save((err) => {
        if (err) {
          return res.status(500).json({ message: "Session save failed" });
        }
        res.json({ user: userWithoutPassword });
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
      res.json({ user });
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

  // Upload endpoint for various files
  app.post("/api/upload", requireAuth, upload.array("files"), (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      const uploadedFiles = files.map(file => ({
        url: `/uploads/${file.filename}`,
        name: file.originalname,
        size: file.size,
        type: file.mimetype
      }));
      res.json(uploadedFiles);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
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

  // Change password
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
  app.get("/api/leads", requireAuth, async (req, res) => {
    try {
      const campaignId = req.query.campaignId as string | undefined;
      const leads = await storage.getLeads(req.session.userId!, campaignId);
      res.json({ leads });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get single lead
  app.get("/api/leads/:id", requireAuth, async (req, res) => {
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
  app.post("/api/leads", requireAuth, async (req, res) => {
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
  app.patch("/api/leads/:id", requireAuth, async (req, res) => {
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
  app.delete("/api/leads/:id", requireAuth, async (req, res) => {
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
  app.post("/api/leads/:id/history", requireAuth, async (req, res) => {
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

  // ==================== CAMPAIGN ROUTES ====================
  
  // Get all campaigns
  app.get("/api/campaigns", requireAuth, async (req, res) => {
    try {
      const campaigns = await storage.getCampaigns(req.session.userId!);
      res.json({ campaigns });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get single campaign
  app.get("/api/campaigns/:id", requireAuth, async (req, res) => {
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
  app.post("/api/campaigns", requireAuth, async (req, res) => {
    try {
      const data = insertCampaignSchema.parse({
        ...req.body,
        userId: req.session.userId,
      });
      
      const campaign = await storage.createCampaign(data);
      res.status(201).json({ campaign });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Update campaign
  app.patch("/api/campaigns/:id", requireAuth, async (req, res) => {
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
  app.delete("/api/campaigns/:id", requireAuth, async (req, res) => {
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

  // Upload files for campaign knowledge base
  app.post("/api/upload", requireAuth, upload.array("files", 10), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      const uploadedFiles = files.map((file) => ({
        id: file.filename.split("-")[0] + "-" + file.filename.split("-")[1],
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
        url: `/uploads/${file.filename}`,
        uploadedAt: new Date(),
      }));

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
        renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        joinedDate: new Date(),
      });
      
      res.json({ user });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Renew subscription
  app.post("/api/billing/renew", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.subscription) {
        return res.status(400).json({ message: "No active subscription" });
      }
      
      const updatedUser = await storage.updateUserSubscription(req.session.userId!, {
        ...user.subscription,
        renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      
      res.json({ user: updatedUser });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ==================== APPOINTMENT ROUTES ====================
  
  // Get all appointments
  app.get("/api/appointments", requireAuth, async (req, res) => {
    try {
      const appointments = await storage.getAppointments(req.session.userId!);
      res.json({ appointments });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get single appointment
  app.get("/api/appointments/:id", requireAuth, async (req, res) => {
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
  app.post("/api/appointments", requireAuth, async (req, res) => {
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
  app.patch("/api/appointments/:id", requireAuth, async (req, res) => {
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
  app.delete("/api/appointments/:id", requireAuth, async (req, res) => {
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
      
      res.json({ settings: user.settings, subscription: user.subscription });
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
}
