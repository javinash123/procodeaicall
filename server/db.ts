import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/nijvox";

let isConnected = false;

export async function connectDB() {
  if (isConnected) {
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI);
    isConnected = true;
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error(`MongoDB connection error: ${error}`);
    throw error;
  }
}

// User Model
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  role: { type: String, enum: ["admin", "user"], default: "user" },
  companyName: String,
  phone: String,
  subscription: {
    plan: { type: String, default: "Free" },
    status: { type: String, enum: ["Active", "Inactive", "Cancelled"], default: "Active" },
    monthlyCallCredits: { type: Number, default: 0 },
    creditsUsed: { type: Number, default: 0 },
    renewalDate: Date,
    joinedDate: { type: Date, default: Date.now },
  },
  settings: {
    dailyCallLimit: { type: Number, default: 500 },
    dndEnabled: { type: Boolean, default: false },
    localPresenceDialing: { type: Boolean, default: true },
  },
  exotelConfig: {
    apiKey: String,
    apiToken: String,
    subdomain: String,
    sid: String,
  },
  gupshupConfig: {
    apiKey: String,
    userId: String,
  },
  createdAt: { type: Date, default: Date.now },
});

// Lead Model
const leadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" }, // Associated campaign
  name: { type: String, required: true },
  company: String,
  email: String,
  phone: { type: String, required: true },
  status: {
    type: String,
    enum: ["New", "Interested", "Follow Up", "Closed", "Unqualified", "In Progress"],
    default: "New",
  },
  outcome: { type: String, default: "Pending" },
  notes: String,
  lastContact: { type: Date, default: Date.now },
  history: [{
    type: { type: String, enum: ["call", "email", "note"], required: true },
    date: { type: Date, default: Date.now },
    duration: String,
    outcome: String,
    subject: String,
    note: String,
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" },
    campaignName: String,
  }],
  appointments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Appointment" }],
  createdAt: { type: Date, default: Date.now },
});

// KnowledgeBase file sub-schema (must use explicit { type: ... } for field named "type"
// to avoid Mongoose treating it as a type declaration)
const knowledgeBaseFileSchema = new mongoose.Schema({
  id: { type: String },
  name: { type: String },
  type: { type: String },
  size: { type: Number },
  url: { type: String },
  uploadedAt: { type: Date },
  extractedText: { type: String },
}, { _id: false });

// Campaign Model
const campaignSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  goal: { type: String, enum: ["sales", "support", "survey", "appointment"], required: true },
  script: { type: String },
  ai_generated_script: { type: String },
  status: { type: String, enum: ["Active", "Paused", "Draft"], default: "Draft" },
  voice: { type: String, default: "Rachel (American)" },
  knowledgeBase: [{ type: String }],
  knowledgeBaseFiles: [knowledgeBaseFileSchema],
  knowledgeBaseTexts: [{ type: String }],
  additionalContext: String,
  callingHours: {
    start: String,
    end: String,
  },
  startDate: String,
  endDate: String,
  progress: { type: Number, default: 0 },
  callsMade: { type: Number, default: 0 },
  goalsMet: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// Appointment Model
const appointmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true },
  leadName: { type: String, required: true },
  title: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  type: { type: String, default: "Zoom" },
  notes: String,
  createdAt: { type: Date, default: Date.now },
});

// Note Model
export const noteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Notification Model
export const notificationSchema = new mongoose.Schema({
  message: { type: String, required: true },
  type: { type: String, enum: ["notification", "announcement"], required: true },
  date: String,
  readBy: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});

// Plan Model
export const planSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  duration: { type: String, enum: ["monthly", "yearly", "quarterly", "lifetime"], required: true },
  credits: { type: Number, required: true },
  callingRate: { type: Number, default: 0 },
  smsRate: { type: Number, default: 0 },
  whatsappRate: { type: Number, default: 0 },
  features: [String],
  limitations: [String],
  description: String,
  isActive: { type: Boolean, default: true },
  selfBranding: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Feature Model
const featureSchema = new mongoose.Schema({
  name: { type: String, required: true },
});

// CallLog Model — stores Exotel webhook call status updates
export const callLogSchema = new mongoose.Schema({
  callSid:      { type: String, required: true, unique: true },
  status:       { type: String, required: true }, // answered, missed, failed, completed, busy, no-answer
  from:         { type: String },                 // caller number
  to:           { type: String },                 // destination number (lead's phone)
  duration:     { type: Number, default: 0 },     // seconds
  recordingUrl: { type: String },
  startTime:    { type: Date },
  endTime:      { type: Date },
  leadId:       { type: mongoose.Schema.Types.ObjectId, ref: "Lead" },
  campaignId:   { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" },
  rawPayload:   { type: mongoose.Schema.Types.Mixed }, // full webhook payload for debugging
  createdAt:    { type: Date, default: Date.now },
});

export const UserModel = mongoose.models.User || mongoose.model("User", userSchema);
export const LeadModel = mongoose.models.Lead || mongoose.model("Lead", leadSchema);
export const CampaignModel = mongoose.models.Campaign || mongoose.model("Campaign", campaignSchema);
export const AppointmentModel = mongoose.models.Appointment || mongoose.model("Appointment", appointmentSchema);
export const NoteModel = mongoose.models.Note || mongoose.model("Note", noteSchema);
export const NotificationModel = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
export const PlanModel = mongoose.models.Plan || mongoose.model("Plan", planSchema);
export const FeatureModel = mongoose.models.Feature || mongoose.model("Feature", featureSchema);
export const CallLogModel = mongoose.models.CallLog || mongoose.model("CallLog", callLogSchema);
