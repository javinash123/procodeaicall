import { UserModel, LeadModel, CampaignModel, AppointmentModel, NoteModel, PlanModel, FeatureModel, NotificationModel } from "./db";
import type {
  User,
  InsertUser,
  UpdateUser,
  Lead,
  InsertLead,
  Campaign,
  InsertCampaign,
  Appointment,
  InsertAppointment,
  UpdateSettings,
  LeadHistoryItem,
  Note,
  InsertNote,
  UpdateNote,
  Plan,
  InsertPlan,
  Feature,
  InsertFeature,
  SubscriptionInfo,
  Notification,
  InsertNotification,
} from "@shared/schema";
import bcryptjs from "bcryptjs";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: UpdateUser): Promise<User | null>;
  changePassword(id: string, currentPassword: string, newPassword: string): Promise<boolean>;
  getAllUsers(): Promise<User[]>;
  
  // Lead methods
  getLeads(userId: string, campaignId?: string): Promise<Lead[]>;
  getLead(id: string): Promise<Lead | null>;
  createLead(lead: InsertLead): Promise<Lead>;
  updateLead(id: string, updates: Partial<InsertLead>): Promise<Lead | null>;
  deleteLead(id: string): Promise<boolean>;
  addLeadHistory(leadId: string, historyItem: LeadHistoryItem): Promise<Lead | null>;
  
  // Campaign methods
  getCampaigns(userId: string): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | null>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: string, updates: Partial<InsertCampaign>): Promise<Campaign | null>;
  deleteCampaign(id: string): Promise<boolean>;
  
  // Appointment methods
  getAppointments(userId: string): Promise<Appointment[]>;
  getAppointment(id: string): Promise<Appointment | null>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, updates: Partial<InsertAppointment>): Promise<Appointment | null>;
  deleteAppointment(id: string): Promise<boolean>;
  
  // Settings methods
  updateSettings(userId: string, settings: UpdateSettings): Promise<User | null>;
  getSettings(userId: string): Promise<User | null>;
  updateUserSubscription(userId: string, subscription: SubscriptionInfo): Promise<User | null>;
  updateExotelConfig(userId: string, config: any): Promise<User | null>;
  updateGupshupConfig(userId: string, config: any): Promise<User | null>;
  getAdminSettings(): Promise<any>;
  updateAdminSettings(settings: any): Promise<any>;

  // Note methods
  getNotes(userId: string): Promise<Note[]>;
  getNote(id: string): Promise<Note | null>;
  createNote(note: InsertNote): Promise<Note>;
  updateNote(id: string, updates: UpdateNote): Promise<Note | null>;
  deleteNote(id: string): Promise<boolean>;

  // Plan methods
  getPlans(): Promise<Plan[]>;
  getPlan(id: string): Promise<Plan | null>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: string, updates: Partial<InsertPlan>): Promise<Plan | null>;
  deletePlan(id: string): Promise<boolean>;

  // Feature methods
  getFeatures(): Promise<Feature[]>;
  createFeature(feature: InsertFeature): Promise<Feature>;

  // Notification methods
  getNotifications(): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string, userId: string): Promise<boolean>;
}

export class MongoStorage implements IStorage {
  // ... existing user methods ...
  async getUser(id: string): Promise<User | null> {
    const user = await UserModel.findById(id).select("-password").lean();
    if (!user) return null;
    return { ...(user as any), _id: (user as any)._id.toString() } as any as User;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const user = await UserModel.findOne({ email }).lean();
    if (!user) return null;
    return { ...(user as any), _id: (user as any)._id.toString() } as any as User;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = await bcryptjs.hash(insertUser.password, 10);
    const user = await UserModel.create({
      ...insertUser,
      password: hashedPassword,
      subscription: {
        plan: "Pending",
        status: "Inactive",
        monthlyCallCredits: 0,
        creditsUsed: 0,
        joinedDate: new Date(),
      },
    });
    
    const userObj = user.toObject();
    const { password, _id, __v, ...rest } = userObj;
    return { ...rest, _id: _id.toString() } as any as User;
  }

  // ... rest of MongoStorage methods ...
  async updateUser(id: string, updates: UpdateUser): Promise<User | null> {
    const user = await UserModel.findByIdAndUpdate(id, { $set: updates }, { new: true }).select("-password").lean();
    if (!user) return null;
    return { ...(user as any), _id: (user as any)._id.toString() } as any as User;
  }

  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<boolean> {
    const user = await UserModel.findById(id);
    if (!user) return false;
    
    const isValid = await bcryptjs.compare(currentPassword, user.password);
    if (!isValid) return false;
    
    const hashedPassword = await bcryptjs.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    return true;
  }

  async getAllUsers(): Promise<User[]> {
    const users = await UserModel.find().select("-password").lean();
    return users.map((u: any) => ({ ...u, _id: u._id.toString() })) as any as User[];
  }

  // Lead methods
  async getLeads(userId: string, campaignId?: string): Promise<Lead[]> {
    const query: any = { userId };
    if (campaignId) {
      query.campaignId = campaignId;
    }
    const leads = await LeadModel.find(query).populate("appointments").populate("campaignId", "name").lean();
    return leads.map((l: any) => ({
      ...l,
      _id: l._id.toString(),
      userId: l.userId.toString(),
      campaignId: l.campaignId?._id?.toString() || (typeof l.campaignId === 'object' ? null : l.campaignId?.toString()) || null,
      campaignName: l.campaignId?.name || null,
    })) as any as Lead[];
  }

  async getLead(id: string): Promise<Lead | null> {
    const lead = await LeadModel.findById(id).populate("appointments").populate("campaignId", "name").lean();
    if (!lead) return null;
    const leadObj = lead as any;
    return {
      ...leadObj,
      _id: leadObj._id.toString(),
      userId: leadObj.userId.toString(),
      campaignId: leadObj.campaignId?._id?.toString() || (typeof leadObj.campaignId === 'object' ? null : leadObj.campaignId?.toString()) || null,
      campaignName: leadObj.campaignId?.name || null,
    } as any as Lead;
  }

  async createLead(lead: InsertLead): Promise<Lead> {
    const newLead = await LeadModel.create(lead);
    const obj = newLead.toObject();
    return { ...(obj as any), _id: obj._id.toString(), userId: obj.userId.toString() } as any as Lead;
  }

  async updateLead(id: string, updates: Partial<InsertLead>): Promise<Lead | null> {
    const lead = await LeadModel.findByIdAndUpdate(id, { ...updates, lastContact: new Date() }, { new: true }).lean();
    if (!lead) return null;
    return { ...(lead as any), _id: (lead as any)._id.toString(), userId: (lead as any).userId.toString() } as any as Lead;
  }

  async deleteLead(id: string): Promise<boolean> {
    const result = await LeadModel.findByIdAndDelete(id);
    return !!result;
  }

  async addLeadHistory(leadId: string, historyItem: LeadHistoryItem): Promise<Lead | null> {
    const lead = await LeadModel.findByIdAndUpdate(
      leadId,
      { 
        $push: { history: { $each: [historyItem], $position: 0 } },
        lastContact: new Date(),
      },
      { new: true }
    ).lean();
    if (!lead) return null;
    return { ...(lead as any), _id: (lead as any)._id.toString(), userId: (lead as any).userId.toString() } as any as Lead;
  }

  // Campaign methods
  async getCampaigns(userId: string): Promise<Campaign[]> {
    const campaigns = await CampaignModel.find({ userId }).lean();
    return campaigns.map((c: any) => ({ ...c, _id: c._id.toString(), userId: c.userId.toString() })) as any as Campaign[];
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    const campaign = await CampaignModel.findById(id).lean();
    if (!campaign) return null;
    return { ...(campaign as any), _id: (campaign as any)._id.toString(), userId: (campaign as any).userId.toString() } as any as Campaign;
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    const newCampaign = await CampaignModel.create(campaign as any);
    const obj = (newCampaign as any).toObject();
    return { ...(obj as any), _id: obj._id.toString(), userId: obj.userId.toString() } as any as Campaign;
  }

  async updateCampaign(id: string, updates: Partial<InsertCampaign>): Promise<Campaign | null> {
    const campaign = await CampaignModel.findByIdAndUpdate(id, updates, { new: true }).lean();
    if (!campaign) return null;
    return { ...(campaign as any), _id: (campaign as any)._id.toString(), userId: (campaign as any).userId.toString() } as any as Campaign;
  }

  async deleteCampaign(id: string): Promise<boolean> {
    const result = await CampaignModel.findByIdAndDelete(id);
    return !!result;
  }

  // Appointment methods
  async getAppointments(userId: string): Promise<Appointment[]> {
    const appointments = await AppointmentModel.find({ userId }).lean();
    return appointments.map((a: any) => ({ ...a, _id: a._id.toString(), userId: a.userId.toString(), leadId: a.leadId.toString() })) as any as Appointment[];
  }

  async getAppointment(id: string): Promise<Appointment | null> {
    const appointment = await AppointmentModel.findById(id).lean();
    if (!appointment) return null;
    return { ...(appointment as any), _id: (appointment as any)._id.toString(), userId: (appointment as any).userId.toString(), leadId: (appointment as any).leadId.toString() } as any as Appointment;
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const newAppointment = await AppointmentModel.create(appointment);
    
    // Add appointment to lead's appointments array
    await LeadModel.findByIdAndUpdate(appointment.leadId, {
      $push: { appointments: newAppointment._id },
    });
    
    const obj = newAppointment.toObject();
    return { ...(obj as any), _id: obj._id.toString(), userId: obj.userId.toString(), leadId: obj.leadId.toString() } as any as Appointment;
  }

  async updateAppointment(id: string, updates: Partial<InsertAppointment>): Promise<Appointment | null> {
    const appointment = await AppointmentModel.findByIdAndUpdate(id, updates, { new: true }).lean();
    if (!appointment) return null;
    return { ...(appointment as any), _id: (appointment as any)._id.toString(), userId: (appointment as any).userId.toString(), leadId: (appointment as any).leadId.toString() } as any as Appointment;
  }

  async deleteAppointment(id: string): Promise<boolean> {
    const appointment = await AppointmentModel.findById(id);
    if (!appointment) return false;
    
    // Remove from lead's appointments array
    await LeadModel.findByIdAndUpdate(appointment.leadId, {
      $pull: { appointments: id },
    });
    
    await AppointmentModel.findByIdAndDelete(id);
    return true;
  }

  // Settings methods
  async updateSettings(userId: string, settings: UpdateSettings): Promise<User | null> {
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $set: { "settings": settings } },
      { new: true }
    ).select("-password").lean();
    if (!user) return null;
    return { ...(user as any), _id: (user as any)._id.toString() } as any as User;
  }

  async getSettings(userId: string): Promise<User | null> {
    const user = await UserModel.findById(userId).select("-password").lean();
    if (!user) return null;
    return { ...(user as any), _id: (user as any)._id.toString() } as any as User;
  }

  async updateUserSubscription(userId: string, subscription: SubscriptionInfo): Promise<User | null> {
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $set: { subscription } },
      { new: true }
    ).select("-password").lean();
    if (!user) return null;
    return { ...(user as any), _id: (user as any)._id.toString() } as any as User;
  }

  async updateExotelConfig(userId: string, config: any): Promise<User | null> {
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $set: { exotelConfig: config } },
      { new: true }
    ).select("-password").lean();
    if (!user) return null;
    return { ...(user as any), _id: (user as any)._id.toString() } as any as User;
  }

  async updateGupshupConfig(userId: string, config: any): Promise<User | null> {
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $set: { gupshupConfig: config } },
      { new: true }
    ).select("-password").lean();
    if (!user) return null;
    return { ...(user as any), _id: (user as any)._id.toString() } as any as User;
  }

  async getAdminSettings(): Promise<any> {
    const admin = await UserModel.findOne({ role: "admin" }).select("exotelConfig").lean();
    return (admin as any)?.exotelConfig || null;
  }

  async updateAdminSettings(settings: any): Promise<any> {
    const admin = await UserModel.findOneAndUpdate(
      { role: "admin" },
      { $set: { exotelConfig: settings } },
      { new: true }
    ).select("exotelConfig").lean();
    return (admin as any)?.exotelConfig || null;
  }

  // Note methods
  async getNotes(userId: string): Promise<Note[]> {
    const notes = await NoteModel.find({ userId }).sort({ createdAt: -1 }).lean();
    return notes.map((n: any) => ({ ...n, _id: n._id.toString(), userId: n.userId.toString() })) as any as Note[];
  }

  async getNote(id: string): Promise<Note | null> {
    const note = await NoteModel.findById(id).lean();
    if (!note) return null;
    return { ...(note as any), _id: (note as any)._id.toString(), userId: (note as any).userId.toString() } as any as Note;
  }

  async createNote(note: InsertNote): Promise<Note> {
    const newNote = await NoteModel.create(note);
    const obj = newNote.toObject();
    return { ...(obj as any), _id: obj._id.toString(), userId: obj.userId.toString() } as any as Note;
  }

  async updateNote(id: string, updates: UpdateNote): Promise<Note | null> {
    const note = await NoteModel.findByIdAndUpdate(id, { ...updates, updatedAt: new Date() }, { new: true }).lean();
    if (!note) return null;
    return { ...(note as any), _id: (note as any)._id.toString(), userId: (note as any).userId.toString() } as any as Note;
  }

  async deleteNote(id: string): Promise<boolean> {
    const result = await NoteModel.findByIdAndDelete(id);
    return !!result;
  }

  // Plan methods
  async getPlans(): Promise<Plan[]> {
    const plans = await PlanModel.find().lean();
    return plans.map((p: any) => ({ ...p, _id: p._id.toString() })) as any as Plan[];
  }

  async getPlan(id: string): Promise<Plan | null> {
    const plan = await PlanModel.findById(id).lean();
    if (!plan) return null;
    return { ...(plan as any), _id: (plan as any)._id.toString() } as any as Plan;
  }

  async createPlan(plan: InsertPlan): Promise<Plan> {
    const newPlan = await PlanModel.create(plan);
    const obj = newPlan.toObject();
    return { ...(obj as any), _id: obj._id.toString() } as any as Plan;
  }

  async updatePlan(id: string, updates: Partial<InsertPlan>): Promise<Plan | null> {
    const plan = await PlanModel.findByIdAndUpdate(id, updates, { new: true }).lean();
    if (!plan) return null;
    return { ...(plan as any), _id: (plan as any)._id.toString() } as any as Plan;
  }

  async deletePlan(id: string): Promise<boolean> {
    const result = await PlanModel.findByIdAndDelete(id);
    return !!result;
  }

  // Feature methods
  async getFeatures(): Promise<Feature[]> {
    const features = await FeatureModel.find().lean();
    return features.map((f: any) => ({ ...f, _id: f._id.toString() })) as any as Feature[];
  }

  async createFeature(feature: InsertFeature): Promise<Feature> {
    const newFeature = await FeatureModel.create(feature);
    const obj = newFeature.toObject();
    return { ...(obj as any), _id: obj._id.toString() } as any as Feature;
  }

  // Notification methods
  async getNotifications(): Promise<Notification[]> {
    const notifications = await NotificationModel.find().sort({ createdAt: -1 }).lean();
    return notifications.map((n: any) => ({ ...n, _id: n._id.toString() })) as any as Notification[];
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const newNotification = await NotificationModel.create({
      ...notification,
      readBy: [],
    });
    const obj = newNotification.toObject();
    return { ...(obj as any), _id: obj._id.toString() } as any as Notification;
  }

  async markNotificationRead(id: string, userId: string): Promise<boolean> {
    await NotificationModel.findByIdAndUpdate(id, {
      $addToSet: { readBy: userId }
    });
    return true;
  }
}

export const storage = new MongoStorage();
