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
    plan: { type: String, enum: ["Starter", "Pro", "Enterprise"], default: "Pro" },
    status: { type: String, enum: ["Active", "Inactive", "Cancelled"], default: "Active" },
    monthlyCallCredits: { type: Number, default: 2000 },
    creditsUsed: { type: Number, default: 0 },
    renewalDate: Date,
    joinedDate: { type: Date, default: Date.now },
  },
  settings: {
    dailyCallLimit: { type: Number, default: 500 },
    dndEnabled: { type: Boolean, default: false },
    localPresenceDialing: { type: Boolean, default: true },
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

// Campaign Model
const campaignSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  goal: { type: String, enum: ["sales", "support", "survey", "appointment"], required: true },
  script: String,
  status: { type: String, enum: ["Active", "Paused", "Draft"], default: "Draft" },
  voice: { type: String, default: "Rachel (American)" },
  knowledgeBase: [String],
  knowledgeBaseFiles: [{
    id: String,
    name: String,
    type: String,
    size: Number,
    url: String,
    uploadedAt: Date,
  }],
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
const noteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const UserModel = mongoose.model("User", userSchema);
export const LeadModel = mongoose.model("Lead", leadSchema);
export const CampaignModel = mongoose.model("Campaign", campaignSchema);
export const AppointmentModel = mongoose.model("Appointment", appointmentSchema);
export const NoteModel = mongoose.model("Note", noteSchema);
