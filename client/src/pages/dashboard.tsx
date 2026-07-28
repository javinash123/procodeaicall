import { useState, useEffect, useRef, useMemo, Suspense, lazy } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Phone, 
  MessageSquare, 
  Users, 
  Settings, 
  LogOut, 
  Bell, 
  Search, 
  Plus, 
  MoreVertical,
  ArrowUpRight,
  PhoneCall,
  CheckCircle2,
  Clock,
  Play,
  UserCog,
  Shield,
  Mail,
  Calendar,
  FileText,
  Upload,
  File,
  History,
  CalendarDays,
  Mic,
  BrainCircuit,
  X,
  Bot,
  User,
  CreditCard,
  Zap,
  Moon,
  Volume2,
  Globe,
  Lock,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Trash2,
  Edit3,
  Pencil,
  Building,
  Building2,
  Megaphone,
  Wallet,
  MessageCircle,
  Eye,
  Send,
  TrendingUp,
  TrendingDown,
  Target,
  Activity,
  BarChart2,
  Flame,
  Award,
  PhoneMissed,
  PhoneOff,
  PhoneIncoming,
  Timer,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { leadsApi, campaignsApi, appointmentsApi, usersApi, settingsApi, uploadApi, notesApi, plansApi, notificationsApi, callLogsApi, type UploadedFile } from "@/lib/api";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Lead, Campaign, Appointment, User as UserType, KnowledgeBaseFile, Plan, InsertPlan } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, AreaChart, Area, BarChart, Bar, RadialBarChart, RadialBar, ComposedChart } from "recharts";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import dashboardImage from "@assets/generated_images/futuristic_dashboard_interface_mockup_glowing_in_orange..png";
const BulkSms = lazy(() => import("./bulk-sms"));
import BuyCreditsDialog from "@/components/BuyCreditsDialog";
const BulkWhatsapp = lazy(() => import("./bulk-whatsapp"));
const AdminPlans = lazy(() => import("./admin-plans"));
import { FeatureGate } from "@/components/feature-gate";
const DashboardAnalyticsTab = lazy(() => import("./dashboard-analytics-tab"));

// Helper function to format time ago
const formatTimeAgo = (date: Date | string) => {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return d.toLocaleDateString();
};

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [location, setLocation] = useLocation();
  const { theme } = useTheme();
  const [plans, setPlans] = useState<Plan[]>([]);
  const { user, logout, loading: authLoading } = useAuth();
  const userPlan = plans.find(p => p.name === user?.subscription?.plan);

  const { toast } = useToast();
  
  // Role Detection
  const isAdmin = user?.role === "admin" || location.startsWith("/admin");

  // Overview tier — controls which sections of the overview page are visible per plan
  const ovTier: string = isAdmin ? "complete" : (user?.overviewLevel ?? "basic");
  const tierAtLeast = (min: "basic" | "intermediate" | "advanced" | "complete") => {
    const order = ["basic", "intermediate", "advanced", "complete"];
    return order.indexOf(ovTier) >= order.indexOf(min);
  };

  // Data State
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<UserType[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [callLogs, setCallLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [llmInsights, setLlmInsights] = useState<string[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // UI State
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [isEditLeadOpen, setIsEditLeadOpen] = useState(false);
  const [isLeadDetailsOpen, setIsLeadDetailsOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isCreateCampaignOpen, setIsCreateCampaignOpen] = useState(false);
  const [isEditCampaignOpen, setIsEditCampaignOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isTestCallOpen, setIsTestCallOpen] = useState(false);
  const [testCallCampaign, setTestCallCampaign] = useState<Campaign | null>(null);
  const [testCallPhone, setTestCallPhone] = useState("");
  const [testCallLoading, setTestCallLoading] = useState(false);
  const [testCallResult, setTestCallResult] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [campaignTab, setCampaignTab] = useState("basics");
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [isEditNoteOpen, setIsEditNoteOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<any | null>(null);
  const [noteForm, setNoteForm] = useState({ title: "", content: "" });
  const [playingRecordingUrl, setPlayingRecordingUrl] = useState<string | null>(null);


  // Form State for New Lead
  const [newLead, setNewLead] = useState({ name: "", company: "", email: "", phone: "", notes: "", status: "New" as const, campaignId: "" });
  
  // Form State for Edit Lead
  const [editLead, setEditLead] = useState({ name: "", company: "", email: "", phone: "", notes: "", status: "New" as "New" | "Interested" | "Follow Up" | "Closed" | "Unqualified" | "In Progress", campaignId: "" });
  
  // Filter state for leads by campaign
  const [leadCampaignFilter, setLeadCampaignFilter] = useState<string>("all");

  // Validation errors
  const [leadErrors, setLeadErrors] = useState<{name?: string; phone?: string; email?: string}>({});
  const [campaignErrors, setCampaignErrors] = useState<{name?: string; script?: string; callingHours?: string}>({});
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isGeneratingEditScript, setIsGeneratingEditScript] = useState(false);

  // Campaign Form State
  const [newCampaign, setNewCampaign] = useState<{
    name: string;
    goal: "sales" | "support" | "survey" | "appointment";
    script: string;
    voice: string;
    additionalContext: string;
    callingHours: { start: string; end: string };
    knowledgeBaseFiles: UploadedFile[];
    startDate: string;
    endDate: string;
  }>({
    name: "",
    goal: "sales",
    script: "",
    voice: "Rachel (American)",
    additionalContext: "",
    callingHours: { start: "09:00", end: "17:00" },
    knowledgeBaseFiles: [],
    startDate: "",
    endDate: ""
  });

  // Edit Campaign Form State
  const [editCampaignForm, setEditCampaignForm] = useState<{
    name: string;
    goal: "sales" | "support" | "survey" | "appointment";
    script: string;
    voice: string;
    additionalContext: string;
    callingHours: { start: string; end: string };
    status: "Active" | "Paused" | "Draft";
    knowledgeBaseFiles: UploadedFile[];
    startDate: string;
    endDate: string;
  }>({
    name: "",
    goal: "sales",
    script: "",
    voice: "Rachel (American)",
    additionalContext: "",
    callingHours: { start: "09:00", end: "17:00" },
    status: "Draft",
    knowledgeBaseFiles: [],
    startDate: "",
    endDate: ""
  });

  // Campaign Search State
  const [campaignSearch, setCampaignSearch] = useState("");

  // File upload state
  const [isUploading, setIsUploading] = useState(false);
  
  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "lead" | "campaign" | "appointment" | "user" | null;
    id: string;
    name: string;
  }>({ type: null, id: "", name: "" });

  // Calendar state
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [isAddAppointmentOpen, setIsAddAppointmentOpen] = useState(false);
  const [isEditAppointmentOpen, setIsEditAppointmentOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [appointmentForm, setAppointmentForm] = useState({
    leadId: "",
    leadName: "",
    title: "",
    date: "",
    time: "09:00",
    type: "Zoom",
    notes: ""
  });
  const [scheduleFromLead, setScheduleFromLead] = useState<Lead | null>(null);

  // Activity Log State
  const [isLogActivityOpen, setIsLogActivityOpen] = useState(false);
  const [activityLog, setActivityLog] = useState({
    type: "call" as "call" | "email" | "note",
    note: "",
    outcome: "No Answer",
    duration: "0:00"
  });

  // Settings State
  const [dndEnabled, setDndEnabled] = useState(user?.settings?.dndEnabled || false);
  const [callLimit, setCallLimit] = useState(user?.settings?.dailyCallLimit || 500);
  const [localPresence, setLocalPresence] = useState<boolean>(user?.settings?.localPresenceDialing ?? true);

  // Profile Form State
  const [profileForm, setProfileForm] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
    phone: user?.phone || "",
    companyName: user?.companyName || "",
    dltPrincipalEntityId: user?.dltPrincipalEntityId || "",
    dltHeaderId: user?.dltHeaderId || ""
  });
  const [exotelForm, setExotelForm] = useState({
    apiKey: "",
    apiToken: "",
    subdomain: "",
    sid: ""
  });
  const [gupshupForm, setGupshupForm] = useState({
    apiKey: "",
    userId: ""
  });

  useEffect(() => {
    if (user?.exotelConfig) {
      setExotelForm(user.exotelConfig);
    }
    if (user?.gupshupConfig) {
      setGupshupForm(user.gupshupConfig);
    }
  }, [user]);

  const [passwordForm, setPasswordForm] = useState({ current: "", new: "", confirm: "" });

  // Chart Filter State
  const [selectedChartMonth, setSelectedChartMonth] = useState<number>(new Date().getMonth());
  const [selectedChartYear, setSelectedChartYear] = useState<number>(new Date().getFullYear());
  const [selectedAdminSubYear, setSelectedAdminSubYear] = useState<number>(new Date().getFullYear());
  const [selectedAdminPieMonth, setSelectedAdminPieMonth] = useState<number>(new Date().getMonth());
  const [selectedAdminPieYear, setSelectedAdminPieYear] = useState<number>(new Date().getFullYear());
  const [selectedAdminRevenueYear, setSelectedAdminRevenueYear] = useState<number>(new Date().getFullYear());
  const [selectedAdminCreditMonth, setSelectedAdminCreditMonth] = useState<number>(new Date().getMonth());
  const [selectedAdminCreditYear, setSelectedAdminCreditYear] = useState<number>(new Date().getFullYear());

  // Credit Usage Chart Filter State
  const [creditUsageCampaignFilter, setCreditUsageCampaignFilter] = useState<string>("all");
  const [creditUsageMonthFilter, setCreditUsageMonthFilter] = useState<number>(new Date().getMonth());
  const [creditUsageYearFilter, setCreditUsageYearFilter] = useState<number>(new Date().getFullYear());
  const [creditUsageData, setCreditUsageData] = useState<any[]>([]);

  // Call/SMS Confirmation State
  const [callConfirm, setCallConfirm] = useState<{ leadId: string; type: "call" | "sms" } | null>(null);

  const [logsCampaignFilter, setLogsCampaignFilter] = useState<string>("all");
  const [dailyActivityCampaignFilter, setDailyActivityCampaignFilter] = useState<string>("all");
  const [overviewCampaignFilter, setOverviewCampaignFilter] = useState<string>("all");
  const [callActivityCampaignFilter, setCallActivityCampaignFilter] = useState<string>("all");

  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<string[]>([]);

  const [isAddNotificationOpen, setIsAddNotificationOpen] = useState(false);
  const [notificationForm, setNotificationForm] = useState({ message: "", type: "notification" as "notification" | "announcement" });

  const [searchTerm, setSearchTerm] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("all");

  // Header global search
  const [headerSearch, setHeaderSearch] = useState("");
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const headerSearchRef = useRef<HTMLDivElement>(null);
  const csvImportRef = useRef<HTMLInputElement>(null);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // ── Analytics computed values ────────────────────────────────────────────────
  // Use UTC midnight so client-side filters align with server-stored UTC timestamps.
  const todayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const closedLeads = leads.filter(l => l.status === "Closed").length;
  const interestedLeads = leads.filter(l => l.status === "Interested").length;
  const followUpLeads = leads.filter(l => l.status === "Follow Up").length;
  const conversionRate = leads.length > 0 ? ((closedLeads / leads.length) * 100).toFixed(1) : "0.0";
  const todaysCalls = leads.reduce((acc, l) =>
    acc + (l.history || []).filter(h => h.type === "call" && new Date(h.date) >= todayStart).length, 0);
  const upcomingAppts = appointments
    .filter(a => new Date(`${a.date}T${a.time || "00:00"}`) >= new Date())
    .sort((a, b) => new Date(`${a.date}T${a.time || "00:00"}`).getTime() - new Date(`${b.date}T${b.time || "00:00"}`).getTime())
    .slice(0, 5);
  const campaignPerformance = campaigns.map(c => ({
    ...c,
    total: leads.filter(l => l.campaignId === c._id).length,
    interested: leads.filter(l => l.campaignId === c._id && l.status === "Interested").length,
    closed: leads.filter(l => l.campaignId === c._id && l.status === "Closed").length,
    callsMade: leads.filter(l => l.campaignId === c._id)
      .reduce((acc, l) => acc + (l.history || []).filter(h => h.type === "call").length, 0),
  }));
  const aiInsights: string[] = [];
  if (interestedLeads > 0 && leads.length > 0)
    aiInsights.push(`${((interestedLeads / leads.length) * 100).toFixed(0)}% of your leads are Interested — follow up now to close more deals.`);
  if (followUpLeads > 0)
    aiInsights.push(`${followUpLeads} lead${followUpLeads > 1 ? "s" : ""} need follow-up. Reaching out today keeps momentum high.`);
  if (todaysCalls > 0)
    aiInsights.push(`${todaysCalls} call${todaysCalls > 1 ? "s" : ""} logged today. Great engagement!`);
  else if (leads.length > 0)
    aiInsights.push("No calls logged today. Consider reaching out to your Interested or Follow Up leads.");
  const activeCampaignsCount = campaigns.filter(c => c.status === "Active").length;
  if (activeCampaignsCount > 0)
    aiInsights.push(`${activeCampaignsCount} active campaign${activeCampaignsCount > 1 ? "s" : ""} running. Monitor progress to optimise conversion.`);
  if (upcomingAppts.length > 0)
    aiInsights.push(`${upcomingAppts.length} upcoming appointment${upcomingAppts.length > 1 ? "s" : ""}. Prepare talking points in advance.`);
  const topCampaign = [...campaignPerformance].sort((a, b) => b.closed - a.closed)[0];
  if (topCampaign && topCampaign.closed > 0)
    aiInsights.push(`Best performing campaign: "${topCampaign.name}" with ${topCampaign.closed} closed lead${topCampaign.closed > 1 ? "s" : ""}.`);
  if (aiInsights.length === 0) aiInsights.push("Add leads and run campaigns to unlock AI-powered insights.");

  // ── Today's Performance data ──────────────────────────────────────────────
  // Messages = SMS and WhatsApp history entries logged today.
  const todayMessages = leads.reduce((acc, l) =>
    acc + (l.history || []).filter(h =>
      (h.type === "sms" || h.type === "whatsapp") && new Date(h.date || 0) >= todayStart
    ).length, 0);
  // Replies = note entries logged today (each note typically documents a lead's reply or callback).
  const todayReplies = leads.reduce((acc, l) =>
    acc + (l.history || []).filter(h =>
      h.type === "note" && new Date(h.date || 0) >= todayStart
    ).length, 0);

  // ── Live Activity Feed ────────────────────────────────────────────────────
  const liveActivityFeed = leads
    .flatMap(l => (l.history || []).map(h => ({ ...h, leadName: l.name, leadId: l._id })))
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 8);

  // ── AI Suggestions ────────────────────────────────────────────────────────
  const highValueLeads = leads.filter(l => l.status === "Interested");
  const overdueLeads = leads.filter(l => l.status === "Follow Up");
  const todayAppts = appointments.filter(a => a.date === new Date().toISOString().split("T")[0]);
  const noCallLeads = leads.filter(l => !(l.history || []).some(h => h.type === "call" && new Date(h.date || 0).getTime() > Date.now() - 7 * 86400000));
  const aiSuggestions: { text: string; action: string; tab: string; count: number; color: string }[] = [];
  if (highValueLeads.length > 0)
    aiSuggestions.push({ text: `Call these ${highValueLeads.length} Interested leads now — High conversion potential.`, action: "View Leads", tab: "crm", count: highValueLeads.length, color: "text-green-500" });
  if (overdueLeads.length > 0)
    aiSuggestions.push({ text: `${overdueLeads.length} leads are overdue for follow-up. Reach out before they go cold.`, action: "Follow Up", tab: "crm", count: overdueLeads.length, color: "text-orange-500" });
  if (todayAppts.length > 0)
    aiSuggestions.push({ text: `You have ${todayAppts.length} appointment${todayAppts.length > 1 ? "s" : ""} scheduled for today. Be prepared.`, action: "View Calendar", tab: "calendar", count: todayAppts.length, color: "text-blue-500" });
  if (noCallLeads.length > 0 && aiSuggestions.length < 3)
    aiSuggestions.push({ text: `${noCallLeads.length} leads haven't been called in 7+ days. Time to re-engage.`, action: "Start Calling", tab: "crm", count: noCallLeads.length, color: "text-purple-500" });
  if (campaigns.filter(c => c.status === "Active").length === 0 && campaigns.length > 0)
    aiSuggestions.push({ text: "No active campaigns running. Launch one to start generating calls automatically.", action: "Campaigns", tab: "campaigns", count: 0, color: "text-red-500" });
  if (aiSuggestions.length === 0)
    aiSuggestions.push({ text: "Add leads and campaigns to unlock AI-powered action suggestions.", action: "Get Started", tab: "crm", count: 0, color: "text-muted-foreground" });

  // ── Advanced Analytics computed from real data ────────────────────────────
  const allHistory = leads.flatMap(l => l.history || []);
  const allCalls = allHistory.filter(h => h.type === "call");
  const answeredCalls = allCalls.filter(h => (h.outcome || "").toLowerCase().includes("answer") && !(h.outcome || "").toLowerCase().includes("no"));
  const answerRate = allCalls.length > 0 ? Math.round((answeredCalls.length / allCalls.length) * 100) : 0;

  // Monthly lead growth from real createdAt
  const currentYear = new Date().getFullYear();
  const analyticsMonths = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthlyLeadGrowth = analyticsMonths.map((name, idx) => ({
    name,
    leads: leads.filter(l => {
      const d = new Date((l as any).createdAt || 0);
      return d.getMonth() === idx && d.getFullYear() === currentYear;
    }).length,
    calls: allCalls.filter(h => {
      const d = new Date(h.date || 0);
      return d.getMonth() === idx && d.getFullYear() === currentYear;
    }).length,
  }));

  // Weekly activity (Mon–Sun)
  const weekDayLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const weeklyActivity = weekDayLabels.map((day, i) => {
    const jsDay = i === 6 ? 0 : i + 1;
    return {
      day,
      calls: allHistory.filter(h => h.type === "call" && new Date(h.date || 0).getDay() === jsDay).length,
      emails: allHistory.filter(h => h.type === "email" && new Date(h.date || 0).getDay() === jsDay).length,
      notes: allHistory.filter(h => h.type === "note" && new Date(h.date || 0).getDay() === jsDay).length,
    };
  });

  // Hour-of-day call distribution (7am–9pm)
  const hourlyCallDist = Array.from({ length: 15 }, (_, i) => {
    const h = i + 7;
    const label = h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
    return {
      hour: label,
      calls: allCalls.filter(hist => new Date(hist.date || 0).getHours() === h).length,
    };
  });

  // Call outcome breakdown from history
  const callOutcomeCounts: Record<string, number> = {};
  allCalls.forEach(h => {
    const o = h.outcome || "Unknown";
    callOutcomeCounts[o] = (callOutcomeCounts[o] || 0) + 1;
  });
  const callOutcomeData = Object.entries(callOutcomeCounts).map(([name, value]) => ({ name, value }));

  // Appointment by type
  const apptTypeCounts: Record<string, number> = {};
  appointments.forEach(a => { const t = a.type || "Other"; apptTypeCounts[t] = (apptTypeCounts[t] || 0) + 1; });
  const apptTypeData = Object.entries(apptTypeCounts).map(([name, value]) => ({ name, value }));

  // Lead funnel data
  const funnelStages = ["New","Interested","Follow Up","In Progress","Closed","Unqualified"];
  const funnelColors = ["#94a3b8","#3b82f6","#f97316","#8b5cf6","#10b981","#ef4444"];
  const leadFunnelData = funnelStages.map((stage, i) => ({
    stage, value: leads.filter(l => l.status === stage).length, fill: funnelColors[i]
  }));

  // Campaign performance (real)
  const campaignPerfData = campaigns.map(c => ({
    name: c.name.length > 14 ? c.name.slice(0, 14) + "…" : c.name,
    leads: leads.filter(l => l.campaignId === c._id).length,
    calls: leads.filter(l => l.campaignId === c._id).reduce((acc, l) => acc + (l.history||[]).filter(h=>h.type==="call").length, 0),
    goals: c.goalsMet || 0,
    conversion: leads.filter(l=>l.campaignId===c._id).length > 0
      ? Math.round((leads.filter(l=>l.campaignId===c._id&&l.status==="Closed").length / leads.filter(l=>l.campaignId===c._id).length)*100)
      : 0,
  }));

  // Call log status breakdown (from Exotel webhooks)
  const callLogStatusCounts: Record<string, number> = {};
  callLogs.forEach(log => { const s = log.status || "unknown"; callLogStatusCounts[s] = (callLogStatusCounts[s] || 0) + 1; });
  const callLogStatusData = Object.entries(callLogStatusCounts).map(([name, value]) => ({ name, value }));

  // Avg call duration from call logs
  const avgCallDuration = callLogs.filter(l => l.duration > 0).length > 0
    ? Math.round(callLogs.filter(l => l.duration > 0).reduce((acc, l) => acc + (l.duration || 0), 0) / callLogs.filter(l => l.duration > 0).length)
    : 0;

  // ── Admin-only analytics ──────────────────────────────────────────────────
  const totalCallsToday = leads.reduce((acc, l) =>
    acc + (l.history || []).filter(h => h.type === "call" && new Date(h.date) >= todayStart).length, 0);
  const totalReplies = leads.filter(l => ["Interested", "Closed"].includes(l.status || "")).length;
  const totalWhatsAppSent = leads.reduce((acc, l) =>
    acc + (l.history || []).filter(h => h.type === "whatsapp").length, 0);
  const platformConversion = leads.length > 0
    ? ((leads.filter(l => l.status === "Closed").length / leads.length) * 100).toFixed(1)
    : "0.0";
  // Agent performance — users vs their leads
  const agentPerformance = registeredUsers.filter(u => u.role !== "admin").map(u => {
    const userLeads = leads.filter(l => (l as any).userId === u._id || (l as any).assignedTo === u._id);
    const userCalls = userLeads.reduce((acc, l) => acc + (l.history || []).filter(h => h.type === "call").length, 0);
    const userClosed = userLeads.filter(l => l.status === "Closed").length;
    const conv = userLeads.length > 0 ? Math.round((userClosed / userLeads.length) * 100) : 0;
    return { name: u.firstName || u.email?.split("@")[0] || "User", calls: userCalls, leads: userLeads.length, conversion: conv };
  }).sort((a, b) => b.calls - a.calls).slice(0, 5);

  // Lead source performance (static demo enhanced with real totals)
  const leadSourceData = [
    { source: "Direct", calls: Math.max(12, Math.floor(leads.length * 0.35)), conversion: 22, trend: "+23%" },
    { source: "WhatsApp", calls: Math.max(8, Math.floor(leads.length * 0.28)), conversion: 18, trend: "+18%" },
    { source: "Website", calls: Math.max(6, Math.floor(leads.length * 0.20)), conversion: 14, trend: "+10%" },
    { source: "SMS Campaign", calls: Math.max(4, Math.floor(leads.length * 0.10)), conversion: 9, trend: "+6%" },
    { source: "Referral", calls: Math.max(2, Math.floor(leads.length * 0.07)), conversion: 31, trend: "+35%" },
  ];

  // ── Monthly analytics data (12-month series) ──────────────────────────────
  const months12 = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // WhatsApp monthly
  const wpMonthlyData = [
    { m:"Jan", sent:3200, delivered:3010, replies:620, read:2580 },
    { m:"Feb", sent:3800, delivered:3570, replies:740, read:3020 },
    { m:"Mar", sent:4100, delivered:3860, replies:810, read:3250 },
    { m:"Apr", sent:3700, delivered:3480, replies:690, read:2900 },
    { m:"May", sent:4500, delivered:4230, replies:930, read:3680 },
    { m:"Jun", sent:5200, delivered:4890, replies:1080, read:4210 },
    { m:"Jul", sent:5800, delivered:5460, replies:1230, read:4730 },
    { m:"Aug", sent:6100, delivered:5740, replies:1290, read:4980 },
    { m:"Sep", sent:5600, delivered:5270, replies:1150, read:4510 },
    { m:"Oct", sent:6400, delivered:6020, replies:1380, read:5230 },
    { m:"Nov", sent:7200, delivered:6780, replies:1560, read:5890 },
    { m:"Dec", sent:8100, delivered:7620, replies:1740, read:6620 },
  ];
  const wpYearTotal = wpMonthlyData.reduce((a,d)=>a+d.sent,0);
  const wpYearDelivered = wpMonthlyData.reduce((a,d)=>a+d.delivered,0);
  const wpYearReplies = wpMonthlyData.reduce((a,d)=>a+d.replies,0);
  const wpDeliveryRate = Math.round((wpYearDelivered/wpYearTotal)*100);
  const wpReplyRate = Math.round((wpYearReplies/wpYearTotal)*100);

  // SMS monthly
  const smsMonthlyData = [
    { m:"Jan", sent:5100, delivered:4960, failed:140, clicks:720 },
    { m:"Feb", sent:6200, delivered:6020, failed:180, clicks:870 },
    { m:"Mar", sent:7100, delivered:6890, failed:210, clicks:1020 },
    { m:"Apr", sent:6500, delivered:6310, failed:190, clicks:930 },
    { m:"May", sent:8200, delivered:7960, failed:240, clicks:1180 },
    { m:"Jun", sent:9400, delivered:9130, failed:270, clicks:1350 },
    { m:"Jul", sent:10200, delivered:9900, failed:300, clicks:1460 },
    { m:"Aug", sent:11000, delivered:10680, failed:320, clicks:1580 },
    { m:"Sep", sent:9800, delivered:9510, failed:290, clicks:1410 },
    { m:"Oct", sent:12100, delivered:11750, failed:350, clicks:1740 },
    { m:"Nov", sent:13500, delivered:13110, failed:390, clicks:1940 },
    { m:"Dec", sent:15200, delivered:14760, failed:440, clicks:2180 },
  ];
  const smsTotalSent = smsMonthlyData.reduce((a,d)=>a+d.sent,0);
  const smsTotalDelivered = smsMonthlyData.reduce((a,d)=>a+d.delivered,0);
  const smsTotalClicks = smsMonthlyData.reduce((a,d)=>a+d.clicks,0);
  const smsDeliveryRate = Math.round((smsTotalDelivered/smsTotalSent)*100);
  const smsClickRate = Math.round((smsTotalClicks/smsTotalSent)*100);

  // Call analytics monthly
  const callMonthlyData = [
    { m:"Jan", total:420, answered:310, missed:110, duration:18 },
    { m:"Feb", total:510, answered:380, missed:130, duration:21 },
    { m:"Mar", total:580, answered:430, missed:150, duration:22 },
    { m:"Apr", total:520, answered:390, missed:130, duration:20 },
    { m:"May", total:670, answered:510, missed:160, duration:24 },
    { m:"Jun", total:780, answered:600, missed:180, duration:25 },
    { m:"Jul", total:860, answered:660, missed:200, duration:26 },
    { m:"Aug", total:920, answered:710, missed:210, duration:27 },
    { m:"Sep", total:840, answered:645, missed:195, duration:25 },
    { m:"Oct", total:1020, answered:790, missed:230, duration:28 },
    { m:"Nov", total:1150, answered:890, missed:260, duration:29 },
    { m:"Dec", total:1280, answered:990, missed:290, duration:31 },
  ];
  const callTotalCalls = callMonthlyData.reduce((a,d)=>a+d.total,0);
  const callTotalAnswered = callMonthlyData.reduce((a,d)=>a+d.answered,0);
  const callTotalMissed = callMonthlyData.reduce((a,d)=>a+d.missed,0);
  const callAnswerRate = Math.round((callTotalAnswered/callTotalCalls)*100);
  const callAvgDuration = Math.round(callMonthlyData.reduce((a,d)=>a+d.duration,0)/callMonthlyData.length);

  // Legacy weekly refs (kept for KPI sparklines above)
  const wpSent = wpMonthlyData[new Date().getMonth()].sent;
  const wpDelivered = wpMonthlyData[new Date().getMonth()].delivered;
  const wpReplies = wpMonthlyData[new Date().getMonth()].replies;
  const smsSent = smsMonthlyData[new Date().getMonth()].sent;
  const smsDelivered = smsMonthlyData[new Date().getMonth()].delivered;

  // Best contact times — computed from real call history (answered / total per hour slot)
  const _contactSlots = [
    { slot: "9 – 11 AM", hours: [9, 10] },
    { slot: "2 – 4 PM",  hours: [14, 15] },
    { slot: "7 – 9 PM",  hours: [19, 20] },
    { slot: "12 – 1 PM", hours: [12] },
  ];
  const bestContactTimes = _contactSlots.map(({ slot, hours }) => {
    const slotCalls = allCalls.filter(h => hours.includes(new Date(h.date || 0).getHours()));
    const slotAnswered = slotCalls.filter(h =>
      (h.outcome || "").toLowerCase().includes("answer") &&
      !(h.outcome || "").toLowerCase().includes("no")
    );
    const success = slotCalls.length > 0
      ? Math.round((slotAnswered.length / slotCalls.length) * 100)
      : 0;
    const label = slotCalls.length === 0 ? "No call data yet"
      : success >= 65 ? "Highest pickup rate"
      : success >= 50 ? "Strong engagement"
      : success >= 35 ? "Moderate response"
      : "Low engagement";
    return { slot, success, label, total: slotCalls.length };
  });
  const _bestSlot = bestContactTimes.filter(t => t.total > 0).reduce<typeof bestContactTimes[0] | null>(
    (a, b) => (a === null || b.success > a.success ? b : a), null
  );

  // Revenue analytics — computed from real plan subscriptions
  const _thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const revenueRows = plans
    .filter(p => (p as any).price > 0)
    .map(p => {
      const activeUsers = registeredUsers.filter(
        u => u.subscription?.plan === p.name && u.subscription?.status === "Active"
      );
      const priorUsers = activeUsers.filter(
        u => new Date((u as any).createdAt || 0) < _thisMonthStart
      );
      const revenue = activeUsers.length * ((p as any).price || 0);
      const prev = priorUsers.length * ((p as any).price || 0);
      return { channel: p.name, leads: activeUsers.length, revenue, prev };
    })
    .filter(r => r.leads > 0);

  // Admin insights
  const newUsersThisMonth = registeredUsers.filter(u => {
    if (!u.createdAt) return false;
    const d = new Date(u.createdAt); const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const trialUsers = registeredUsers.filter(u => !u.subscription?.plan || u.subscription.status === "Trial").length;
  const adminInsights: string[] = [];
  if (newUsersThisMonth > 0) adminInsights.push(`${newUsersThisMonth} new user${newUsersThisMonth > 1 ? "s" : ""} joined this month.`);
  if (trialUsers > 0) adminInsights.push(`${trialUsers} user${trialUsers > 1 ? "s are" : " is"} on trial — consider targeted outreach to convert them.`);
  const inactiveUsers = registeredUsers.filter(u => u.subscription?.status !== "Active").length;
  if (inactiveUsers > 0) adminInsights.push(`${inactiveUsers} user${inactiveUsers > 1 ? "s" : ""} with inactive/no subscription. Review for re-engagement.`);
  if (adminInsights.length === 0) adminInsights.push("All users are active and subscribed. Great platform health!");

  // Stats derived from data
  // ── Month-over-month KPI deltas (reuse _thisMonthStart declared above) ────
  const _lastMonthStart = new Date(_thisMonthStart.getFullYear(), _thisMonthStart.getMonth() - 1, 1);
  const _pctChange = (cur: number, prev: number): string => {
    if (prev === 0) return cur > 0 ? "+100%" : "0%";
    const p = ((cur - prev) / prev) * 100;
    return (p >= 0 ? "+" : "") + p.toFixed(1) + "%";
  };
  const _thisLeads   = leads.filter(l => new Date((l as any).createdAt) >= _thisMonthStart).length;
  const _lastLeads   = leads.filter(l => { const d = new Date((l as any).createdAt); return d >= _lastMonthStart && d < _thisMonthStart; }).length;
  const _thisCamps   = campaigns.filter(c => new Date((c as any).createdAt) >= _thisMonthStart).length;
  const _lastCamps   = campaigns.filter(c => { const d = new Date((c as any).createdAt); return d >= _lastMonthStart && d < _thisMonthStart; }).length;
  const _thisAppts   = appointments.filter(a => new Date((a as any).createdAt) >= _thisMonthStart).length;
  const _lastAppts   = appointments.filter(a => { const d = new Date((a as any).createdAt); return d >= _lastMonthStart && d < _thisMonthStart; }).length;
  const _thisCredits = user?.subscription?.monthlyCallCredits || 0;
  const _lastCredits = user?.subscription?.previousMonthCredits ?? _thisCredits;

  const stats = isAdmin ? [
    { label: "Total Users", value: registeredUsers.length.toString(), icon: Users, tab: "admin-users", change: "" },
    { label: "Total Plans", value: plans.length.toString(), icon: CreditCard, tab: "plans", change: "", href: "/admin/plans" },
    { label: "Active Subscriptions", value: registeredUsers.filter(u => u.subscription?.status === "Active").length.toString(), icon: CheckCircle2, tab: "admin-users", change: "" },
    { label: "Total Revenue", value: `₹${registeredUsers.reduce((acc, u) => acc + (plans.find(p => p.name === u.subscription?.plan)?.price || 0), 0).toLocaleString()}`, icon: Wallet, tab: "admin-users", change: "" },
  ] : [
    { label: "Leads", value: leads.length.toString(), change: _pctChange(_thisLeads, _lastLeads), icon: PhoneCall, tab: "crm" },
    { label: "Campaigns", value: campaigns.filter(c => c.status === "Active").length.toString(), change: _pctChange(_thisCamps, _lastCamps), icon: CheckCircle2, tab: "campaigns" },
    { label: "Appointments", value: appointments.length.toString(), change: _pctChange(_thisAppts, _lastAppts), icon: Clock, tab: "calendar" },
    { label: "Credit Balance", value: `₹${(user?.subscription?.monthlyCallCredits || 0).toLocaleString()}`, change: _pctChange(_thisCredits, _lastCredits), icon: Wallet, tab: "settings" },
  ];

  // Header search results — computed from existing data, no extra fetches needed
  const headerSearchResults = useMemo(() => {
    const q = headerSearch.trim().toLowerCase();
    if (q.length < 2) return { leads: [], campaigns: [], users: [] };
    if (isAdmin) {
      return {
        leads: [],
        campaigns: [],
        users: registeredUsers.filter(u =>
          `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.companyName || "").toLowerCase().includes(q)
        ).slice(0, 6),
      };
    }
    return {
      leads: leads.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        (l.company || "").toLowerCase().includes(q)
      ).slice(0, 4),
      campaigns: campaigns.filter(c => c.name.toLowerCase().includes(q)).slice(0, 3),
      users: [],
    };
  }, [headerSearch, leads, campaigns, registeredUsers, isAdmin]);

  const headerSearchHasResults =
    headerSearchResults.leads.length > 0 ||
    headerSearchResults.campaigns.length > 0 ||
    headerSearchResults.users.length > 0;

  // ── Growth Analytics — real monthly lead count filtered by year + campaign ──
  const growthAnalyticsData = useMemo(() => {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return months.map((name, idx) => ({
      name,
      leads: leads.filter(l => {
        const d = new Date((l as any).createdAt || 0);
        if (d.getFullYear() !== selectedChartYear) return false;
        if (d.getMonth() !== idx) return false;
        if (dailyActivityCampaignFilter !== "all" && l.campaignId !== dailyActivityCampaignFilter) return false;
        return true;
      }).length,
    }));
  }, [leads, selectedChartYear, dailyActivityCampaignFilter]);

  // True only when at least one month has a non-zero lead count
  const growthAnalyticsHasData = useMemo(
    () => growthAnalyticsData.some(d => d.leads > 0),
    [growthAnalyticsData],
  );

  // ── Daily Call Activity — real per-day call log count for selected month/year ──
  const dailyCallActivityData = useMemo(() => {
    const daysInMonth = new Date(selectedChartYear, selectedChartMonth + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      return {
        name: String(day),
        calls: callLogs.filter(log => {
          const d = new Date(log.createdAt || log.startTime || 0);
          if (d.getFullYear() !== selectedChartYear) return false;
          if (d.getMonth() !== selectedChartMonth) return false;
          if (d.getDate() !== day) return false;
          if (callActivityCampaignFilter !== "all" && log.campaignId !== callActivityCampaignFilter) return false;
          return true;
        }).length,
      };
    });
  }, [callLogs, selectedChartMonth, selectedChartYear, callActivityCampaignFilter]);

  // ── LLM-powered AI Insights (fetched once per session when data is ready) ─
  const insightsFetchedRef = useRef(false);
  useEffect(() => {
    if (insightsFetchedRef.current || loading || leads.length === 0) return;
    // Check localStorage cache (15 min TTL per user)
    const cacheKey = `nijvox_insights_${user?._id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { ts, insights } = JSON.parse(cached);
        if (Date.now() - ts < 15 * 60 * 1000 && Array.isArray(insights) && insights.length > 0) {
          setLlmInsights(insights);
          insightsFetchedRef.current = true;
          return;
        }
      } catch { /* ignore */ }
    }
    insightsFetchedRef.current = true;
    setInsightsLoading(true);
    const topCamp = [...campaignPerformance].sort((a, b) => b.closed - a.closed)[0];
    fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totalLeads: leads.length,
        interestedLeads: leads.filter(l => l.status === "Interested").length,
        followUpLeads: leads.filter(l => l.status === "Follow Up").length,
        closedLeads: leads.filter(l => l.status === "Closed").length,
        activeCampaigns: campaigns.filter(c => c.status === "Active").length,
        totalCampaigns: campaigns.length,
        todaysCalls: todaysCalls,
        totalCalls: leads.reduce((acc, l) => acc + (l.history || []).filter(h => h.type === "call").length, 0),
        upcomingAppointments: appointments.filter(a => new Date(a.date) >= new Date()).length,
        topCampaign: topCamp?.closed > 0 ? { name: topCamp.name, closed: topCamp.closed } : null,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.insights) && data.insights.length > 0) {
          setLlmInsights(data.insights);
          localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), insights: data.insights }));
        }
      })
      .catch(() => { /* silently fall back to heuristic insights */ })
      .finally(() => setInsightsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, leads.length]);

  // Helper: compute lead engagement score from status + history
  const leadScore = (lead: Lead): "High" | "Med" | "Low" => {
    if (lead.status === "Interested" || lead.status === "Closed") return "High";
    const callCount = (lead.history || []).filter(h => h.type === "call").length;
    if (lead.status === "Follow Up" || lead.status === "In Progress" || callCount >= 2) return "Med";
    return "Low";
  };
  const leadScoreVariant = (score: "High" | "Med" | "Low") =>
    score === "High" ? "default" : "secondary";
  const leadScoreClass = (score: "High" | "Med" | "Low") =>
    score === "High"
      ? "bg-green-500/15 text-green-600 dark:text-green-400 border-none"
      : score === "Med"
      ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-none"
      : "bg-slate-500/10 text-slate-500 border-none";

  // Helper: find Exotel recording URL from callLogs by leadId + date proximity
  const findRecordingUrl = (leadId: string, date: Date): string | undefined => {
    const ts = new Date(date).getTime();
    const WINDOW_MS = 8 * 60 * 1000; // 8-minute window
    return callLogs.find(
      cl => cl.leadId === leadId &&
            Math.abs(new Date(cl.startTime || cl.createdAt).getTime() - ts) < WINDOW_MS &&
            cl.recordingUrl,
    )?.recordingUrl;
  };

  // Close header search dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (headerSearchRef.current && !headerSearchRef.current.contains(e.target as Node)) {
        setHeaderSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch data on mount
  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [leadsRes, campaignsRes, appointmentsRes, notesRes, plansRes, notificationsRes] = await Promise.all([
          leadsApi.getAll(),
          campaignsApi.getAll(),
          appointmentsApi.getAll(),
          notesApi.getAll(),
          plansApi.getAll(),
          notificationsApi.getAll()
        ]);
        
        setLeads(Array.isArray(leadsRes) ? leadsRes : (leadsRes as any).leads || []);
        setCampaigns(Array.isArray(campaignsRes) ? campaignsRes : (campaignsRes as any).campaigns || []);
        setAppointments(Array.isArray(appointmentsRes) ? appointmentsRes : (appointmentsRes as any).appointments || []);
        setNotes(Array.isArray(notesRes) ? notesRes : (notesRes as any).notes || []);
        setPlans(Array.isArray(plansRes) ? plansRes : (plansRes as any).plans || []);
        
        setNotifications(Array.isArray(notificationsRes) ? notificationsRes : (notificationsRes as any).notifications || []);

        if (isAdmin) {
          const usersRes = await usersApi.getAll();
          setRegisteredUsers(Array.isArray(usersRes) ? usersRes : (usersRes as any).users || []);
        }

        try {
          const logsRes = await callLogsApi.getAll();
          setCallLogs(Array.isArray(logsRes) ? logsRes : []);
        } catch { /* call logs optional */ }
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Error loading data",
          description: error.message
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user) return;

    const fetchCreditUsage = async () => {
      try {
        const params = new URLSearchParams({
          month: String(creditUsageMonthFilter),
          year: String(creditUsageYearFilter),
        });
        if (creditUsageCampaignFilter !== "all") {
          params.set("campaignId", creditUsageCampaignFilter);
        }
        const res = await fetch(`/api/credits/usage/daily?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch usage");
        const data = await res.json();
        setCreditUsageData(data);
      } catch (error) {
        console.error("Error fetching credit usage:", error);
        // Fallback: fill with zeros so the chart renders cleanly
        const daysInMonth = new Date(creditUsageYearFilter, creditUsageMonthFilter + 1, 0).getDate();
        setCreditUsageData(Array.from({ length: daysInMonth }, (_, i) => ({ date: i + 1, call: 0, sms: 0, whatsapp: 0 })));
      }
    };

    fetchCreditUsage();
  }, [user, creditUsageMonthFilter, creditUsageYearFilter, creditUsageCampaignFilter]);

  // Update profile form when user changes
  useEffect(() => {
    if (user) {
      setProfileForm({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        phone: user.phone || "",
        companyName: user.companyName || "",
        dltPrincipalEntityId: user.dltPrincipalEntityId || "",
        dltHeaderId: user.dltHeaderId || ""
      });
      setDndEnabled(user.settings?.dndEnabled || false);
      setCallLimit(user.settings?.dailyCallLimit || 500);
      setLocalPresence(user.settings?.localPresenceDialing ?? true);
    }
  }, [user]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/login");
    }
  }, [authLoading, user, setLocation]);

  // Validation Functions
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const response = await uploadApi.uploadFiles(Array.from(files));
      const uploadedFiles = response || [];
      
      if (isEdit) {
        setEditCampaignForm(prev => ({
          ...prev,
          knowledgeBaseFiles: [...(prev.knowledgeBaseFiles || []), ...uploadedFiles]
        }));
      } else {
        setNewCampaign(prev => ({
          ...prev,
          knowledgeBaseFiles: [...(prev.knowledgeBaseFiles || []), ...uploadedFiles]
        }));
      }
      toast({ title: "Files uploaded successfully!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Upload failed", description: error.message });
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const validateLead = (data: { name: string; phone: string; email: string }): boolean => {
    const errors: typeof leadErrors = {};
    if (!data.name.trim()) errors.name = "Name is required";
    if (!data.phone.trim()) errors.phone = "Phone number is required";
    else if (!/^[+]?[\d\s\-()]{7,}$/.test(data.phone.replace(/\s/g, ''))) errors.phone = "Invalid phone number format";
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = "Invalid email format";
    setLeadErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateCampaign = (data: any): boolean => {
    const errors: typeof campaignErrors = {};
    if (!data.name.trim()) errors.name = "Campaign name is required";
    if (!data.script.trim()) errors.script = "Script/opening message is required";
    if (data.callingHours.start >= data.callingHours.end) errors.callingHours = "End time must be after start time";
    setCampaignErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleGenerateScript = async () => {
    if (!newCampaign.goal) return;
    setIsGeneratingScript(true);
    try {
      const knowledgeBaseText = newCampaign.knowledgeBaseFiles
        .map((f: any) => f.extractedText)
        .filter(Boolean)
        .join("\n\n");

      const result = await campaignsApi.generateScript({
        campaignGoal: newCampaign.goal,
        existingScript: newCampaign.script,
        additionalContext: newCampaign.additionalContext,
        campaignName: newCampaign.name,
        knowledgeBaseText: knowledgeBaseText || undefined,
      });
      setNewCampaign({ ...newCampaign, script: result.script });
      toast({ title: "Script generated!", description: "AI-generated script has been added. Feel free to edit it." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to generate script", description: error.message });
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerateEditScript = async () => {
    if (!editCampaignForm.goal) return;
    setIsGeneratingEditScript(true);
    try {
      const knowledgeBaseText = (editCampaignForm.knowledgeBaseFiles || [])
        .map((f: any) => f.extractedText)
        .filter(Boolean)
        .join("\n\n");

      const result = await campaignsApi.generateScript({
        campaignGoal: editCampaignForm.goal,
        existingScript: editCampaignForm.script,
        additionalContext: editCampaignForm.additionalContext,
        campaignName: editCampaignForm.name,
        knowledgeBaseText: knowledgeBaseText || undefined,
      });
      setEditCampaignForm({ ...editCampaignForm, script: result.script });
      toast({ title: "Script generated!", description: "AI-generated script has been added. Feel free to edit it." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to generate script", description: error.message });
    } finally {
      setIsGeneratingEditScript(false);
    }
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!validateLead(newLead)) return;
    
    setIsSaving(true);
    try {
      const lead = await leadsApi.create({
        userId: user._id,
        name: newLead.name.trim(),
        company: newLead.company.trim(),
        email: newLead.email.trim(),
        phone: newLead.phone.trim(),
        notes: newLead.notes.trim(),
        status: "New",
        outcome: "Pending",
        campaignId: newLead.campaignId && newLead.campaignId !== "none" ? newLead.campaignId : undefined
      });
      const leadWithCampaign = (newLead.campaignId && newLead.campaignId !== "none")
        ? { ...lead, campaignName: campaigns.find(c => c._id === newLead.campaignId)?.name }
        : lead;
      setLeads([leadWithCampaign as Lead, ...leads]);
      setIsAddLeadOpen(false);
      setNewLead({ name: "", company: "", email: "", phone: "", notes: "", status: "New", campaignId: "" });
      setLeadErrors({});
      toast({ title: "Lead added successfully!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error adding lead", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditLead = (lead: Lead) => {
    setSelectedLead(lead);
    setEditLead({
      name: lead.name,
      company: lead.company || "",
      email: lead.email || "",
      phone: lead.phone,
      notes: lead.notes || "",
      status: lead.status,
      campaignId: lead.campaignId || ""
    });
    setLeadErrors({});
    setIsEditLeadOpen(true);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      console.log("Sending profile update:", profileForm);
      // Ensure companyLogo is included in the update if it's in the user object
      const updateData = {
        ...profileForm,
        companyLogo: user?.companyLogo // Keep existing logo if not updated via separate upload
      };
      const response = await apiRequest("PATCH", "/api/user", updateData);
      const data = await response.json();
      console.log("Profile update response:", data);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Profile updated successfully!" });
    } catch (error: any) {
      console.error("Profile update error:", error);
      toast({ variant: "destructive", title: "Update failed", description: error.message });
    } finally {
      setIsSaving(true); // Should be false, fixing this too
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const response = await uploadApi.uploadFiles([files[0]]);
      const uploadedFiles = response || [];
      if (uploadedFiles.length > 0) {
        const logoUrl = uploadedFiles[0].url;
        console.log("Logo uploaded, URL:", logoUrl);
        
        // Immediately update the user profile with the new logo URL
        await apiRequest("PATCH", "/api/user", { companyLogo: logoUrl });
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        
        toast({ title: "Logo updated successfully!" });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Upload failed", description: error.message });
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleUpdateExotelConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const endpoint = isAdmin ? "/api/admin/exotel" : "/api/user/exotel";
      await apiRequest("POST", endpoint, exotelForm);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Exotel configuration updated!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update failed", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateGupshupConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const endpoint = isAdmin ? "/api/admin/exotel" : "/api/user/gupshup"; // Reusing admin endpoint if it handles all admin settings, but let's be specific
      // Actually, admin setting update should probably handle both. 
      // For now, let's keep it simple for user
      await apiRequest("POST", isAdmin ? "/api/admin/exotel" : "/api/user/gupshup", gupshupForm);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Gupshup configuration updated!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update failed", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;
    if (!validateLead(editLead)) return;
    
    setIsSaving(true);
    try {
      const response = await leadsApi.update(selectedLead._id, {
        name: editLead.name.trim(),
        company: editLead.company.trim(),
        email: editLead.email.trim(),
        phone: editLead.phone.trim(),
        notes: editLead.notes.trim(),
        status: editLead.status,
        campaignId: editLead.campaignId && editLead.campaignId !== "none" ? editLead.campaignId : undefined
      });
      
      const updated = response;
      
      // Update selected lead details if it's the one currently viewed
      const updatedLead = { 
        ...selectedLead, 
        ...updated,
        campaignName: editLead.campaignId && editLead.campaignId !== "none" 
          ? campaigns.find(c => c._id === editLead.campaignId)?.name 
          : undefined 
      } as Lead;
      
      setSelectedLead(updatedLead);
      setLeads(leads.map(l => l._id === selectedLead._id ? updatedLead : l));
      setIsEditLeadOpen(false);
      setLeadErrors({});
      toast({ title: "Lead updated successfully!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error updating lead", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteLead = (lead: Lead) => {
    setDeleteConfirm({ type: "lead", id: lead._id, name: lead.name });
  };
  
  const handleDeleteLead = async (id: string) => {
    try {
      await leadsApi.delete(id);
      setLeads(leads.filter(l => l._id !== id));
      setIsLeadDetailsOpen(false);
      setDeleteConfirm({ type: null, id: "", name: "" });
      toast({ title: "Lead deleted" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error deleting lead", description: error.message });
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!validateCampaign(newCampaign)) return;
    
    setIsSaving(true);
    try {
      const campaign = await campaignsApi.create({
        ...newCampaign,
        userId: user?._id || "",
        status: "Draft",
        knowledgeBaseFiles: newCampaign.knowledgeBaseFiles || []
      });
      setCampaigns([...campaigns, campaign]);
      setIsCreateCampaignOpen(false);
      setNewCampaign({
        name: "",
        goal: "sales",
        script: "",
        voice: "Rachel (American)",
        additionalContext: "",
        callingHours: { start: "09:00", end: "17:00" },
        knowledgeBaseFiles: [],
        startDate: "",
        endDate: ""
      });
      setCampaignErrors({});
      toast({ title: "Campaign created successfully!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error creating campaign", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign) return;
    if (!validateCampaign(editCampaignForm)) return;

    setIsSaving(true);
    try {
      const updated = await campaignsApi.update(selectedCampaign._id, {
        name: editCampaignForm.name,
        goal: editCampaignForm.goal,
        script: editCampaignForm.script,
        voice: editCampaignForm.voice,
        additionalContext: editCampaignForm.additionalContext,
        callingHours: editCampaignForm.callingHours,
        status: editCampaignForm.status,
        knowledgeBaseFiles: editCampaignForm.knowledgeBaseFiles,
        startDate: editCampaignForm.startDate,
        endDate: editCampaignForm.endDate
      });
      setCampaigns(campaigns.map(c => c._id === selectedCampaign._id ? updated : c));
      setIsEditCampaignOpen(false);
      setSelectedCampaign(null);
      toast({ title: "Campaign updated successfully!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error updating campaign", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    try {
      await campaignsApi.delete(id);
      setCampaigns(campaigns.filter(c => c._id !== id));
      setDeleteConfirm({ type: null, id: "", name: "" });
      toast({ title: "Campaign deleted" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error deleting campaign", description: error.message });
    }
  };

  // ── Campaign Start / Stop toggle ─────────────────────────────────────────
  const handleToggleCampaignStatus = async (campaign: Campaign) => {
    const nextStatus = campaign.status === "Active" ? "Paused" : "Active";
    try {
      const updated = await campaignsApi.update((campaign as any)._id, { status: nextStatus as any });
      setCampaigns(campaigns.map(c => c._id === (campaign as any)._id ? updated : c));
      toast({ title: `Campaign ${nextStatus === "Active" ? "started" : "paused"}` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to update campaign", description: error.message });
    }
  };

  // ── CSV Import ─────────────────────────────────────────────────────────────
  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = ""; // reset so re-importing same file triggers onChange again

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      toast({ variant: "destructive", title: "CSV is empty or has no data rows" });
      return;
    }

    // Parse header row — support any column order, case-insensitive
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
    const col = (name: string) => headers.indexOf(name);

    const pick = (row: string[], ...keys: string[]) => {
      for (const k of keys) {
        const idx = col(k);
        if (idx !== -1 && row[idx]?.trim()) return row[idx].trim();
      }
      return "";
    };

    let created = 0;
    let skipped = 0;
    const newLeads: Lead[] = [];

    for (let i = 1; i < lines.length; i++) {
      // Naive CSV split — handles simple quoted fields
      const row = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(v => v.replace(/^"|"$/g, "")) ?? lines[i].split(",");
      const phone = pick(row, "phone", "mobile", "phonenumber", "contact");
      const name  = pick(row, "name", "fullname", "leadname", "firstname") || phone;
      if (!phone && !name) { skipped++; continue; }

      try {
        const lead = await leadsApi.create({
          userId:     user._id,
          name:       name || phone,
          phone:      phone,
          email:      pick(row, "email", "emailaddress"),
          company:    pick(row, "company", "companyname", "organisation", "organization"),
          notes:      pick(row, "notes", "note", "comments", "comment"),
          status:     "New",
          outcome:    "Pending",
        });
        newLeads.push(lead as Lead);
        created++;
      } catch {
        skipped++;
      }
    }

    if (newLeads.length > 0) setLeads(prev => [...newLeads, ...prev]);
    toast({
      title: `CSV imported: ${created} lead${created !== 1 ? "s" : ""} added`,
      description: skipped > 0 ? `${skipped} row${skipped !== 1 ? "s" : ""} skipped (missing phone/name or duplicate)` : undefined,
    });
  };

  const handleTestCall = async () => {
    if (!testCallPhone.trim() || !testCallCampaign) return;
    setTestCallLoading(true);
    setTestCallResult(null);
    try {
      const res = await fetch(`/test-call?phone=${encodeURIComponent(testCallPhone.trim())}&campaignId=${testCallCampaign._id}`);
      const text = await res.text();
      setTestCallResult(text);
    } catch (err: any) {
      setTestCallResult("Error: " + err.message);
    } finally {
      setTestCallLoading(false);
    }
  };

  const handleViewLead = (lead: Lead) => {
    setSelectedLead(lead);
    setIsLeadDetailsOpen(true);
  };

  const handleLogActivity = async () => {
    if (!selectedLead || !activityLog.note.trim()) {
      toast({ variant: "destructive", title: "Please enter a note" });
      return;
    }

    setIsSaving(true);
    try {
      const historyItem = {
        type: activityLog.type,
        date: new Date().toISOString(),
        note: activityLog.note.trim(),
        outcome: activityLog.type === "call" ? activityLog.outcome : undefined,
        duration: activityLog.type === "call" ? activityLog.duration : undefined
      };

      await leadsApi.addHistory(selectedLead._id, historyItem);
      
      const updatedLead = {
        ...selectedLead,
        history: [...(selectedLead.history || []), historyItem] as any,
        lastContact: new Date(historyItem.date)
      };
      setSelectedLead(updatedLead);
      setLeads(leads.map(l => l._id === selectedLead._id ? updatedLead : l));
      
      setIsLogActivityOpen(false);
      setActivityLog({ type: "call", note: "", outcome: "No Answer", duration: "0:00" });
      toast({ title: "Activity logged successfully!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error logging activity", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleScheduleMeeting = (lead: Lead) => {
    setScheduleFromLead(lead);
    setAppointmentForm({
      leadId: lead._id,
      leadName: lead.name,
      title: `Meeting with ${lead.name}`,
      date: new Date().toISOString().split('T')[0],
      time: "09:00",
      type: "Zoom",
      notes: ""
    });
    setIsAddAppointmentOpen(true);
  };

  const handleAddAppointment = async () => {
    // Basic validation
    if (!user || !appointmentForm.title?.trim() || !appointmentForm.date?.trim() || !appointmentForm.leadId?.trim()) {
      toast({ 
        variant: "destructive", 
        title: "Validation Error", 
        description: "Please fill in all required fields (Lead, Title, and Date)." 
      });
      return;
    }
    
    setIsSaving(true);
    try {
      const response = await appointmentsApi.create({
        userId: user._id,
        leadId: appointmentForm.leadId,
        leadName: appointmentForm.leadName,
        title: appointmentForm.title,
        date: appointmentForm.date,
        time: appointmentForm.time,
        type: appointmentForm.type,
        notes: appointmentForm.notes
      });
      
      const newApt = response;
      setAppointments([...appointments, newApt]);
      setIsAddAppointmentOpen(false);
      setScheduleFromLead(null);
      setAppointmentForm({ leadId: "", leadName: "", title: "", date: "", time: "09:00", type: "Zoom", notes: "" });
      toast({ title: "Appointment scheduled!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error creating appointment", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditAppointment = (apt: Appointment) => {
    setSelectedAppointment(apt);
    setAppointmentForm({
      leadId: apt.leadId,
      leadName: apt.leadName,
      title: apt.title,
      date: apt.date,
      time: apt.time,
      type: apt.type,
      notes: apt.notes || ""
    });
    setIsEditAppointmentOpen(true);
  };

  const handleUpdateAppointment = async () => {
    if (!selectedAppointment || !appointmentForm.title || !appointmentForm.date) {
      toast({ variant: "destructive", title: "Please fill in all required fields" });
      return;
    }
    
    setIsSaving(true);
    try {
      const updated = await appointmentsApi.update(selectedAppointment._id, {
        title: appointmentForm.title,
        date: appointmentForm.date,
        time: appointmentForm.time,
        type: appointmentForm.type,
        notes: appointmentForm.notes
      });
      setAppointments(appointments.map(a => a._id === selectedAppointment._id ? updated : a));
      setIsEditAppointmentOpen(false);
      setSelectedAppointment(null);
      toast({ title: "Appointment updated!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error updating appointment", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteAppointment = (apt: Appointment) => {
    setDeleteConfirm({ type: "appointment", id: apt._id, name: apt.title });
  };

  const handleDeleteAppointment = async (id: string) => {
    try {
      await appointmentsApi.delete(id);
      setAppointments(appointments.filter(a => a._id !== id));
      setDeleteConfirm({ type: null, id: "", name: "" });
      toast({ title: "Appointment deleted" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error deleting appointment", description: error.message });
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setLocation("/login");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Logout failed", description: error.message });
    }
  };

  if (authLoading || (loading && registeredUsers.length === 0 && isAdmin)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col shrink-0">
        <div className="p-6 border-b flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Phone className="h-4 w-4" />
          </div>
          <h2 className="font-bold text-xl tracking-tighter">NIJVOX</h2>
        </div>
        
        <ScrollArea className="flex-1 px-4 py-6">
          <nav className="space-y-1.5">
            <Button 
              variant={activeTab === "overview" ? "secondary" : "ghost"} 
              className="w-full justify-start hover-elevate h-11"
              onClick={() => setActiveTab("overview")}
            >
              <LayoutDashboard className="mr-3 h-5 w-5" />
              Overview
            </Button>
            
            {isAdmin ? (
              <>
                <div className="mt-6 mb-2 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Administration</div>
                <Button 
                  variant={activeTab === "admin-users" ? "secondary" : "ghost"} 
                  className="w-full justify-start hover-elevate h-11"
                  onClick={() => setActiveTab("admin-users")}
                >
                  <Users className="mr-3 h-5 w-5" />
                  User Management
                </Button>
                <Button 
                  variant={activeTab === "admin-notifications" ? "secondary" : "ghost"} 
                  className="w-full justify-start hover-elevate h-11"
                  onClick={() => setActiveTab("admin-notifications")}
                >
                  <Bell className="mr-3 h-5 w-5" />
                  Notifications
                </Button>
                <Button 
                  variant={activeTab === "plans" ? "secondary" : "ghost"} 
                  className="w-full justify-start hover-elevate h-11"
                  onClick={() => setActiveTab("plans")}
                >
                  <CreditCard className="mr-3 h-5 w-5" />
                  Plan Management
                </Button>
                <Button
                  variant={activeTab === "analytics" ? "secondary" : "ghost"}
                  className="w-full justify-start hover-elevate h-11"
                  onClick={() => setActiveTab("analytics")}
                >
                  <BarChart2 className="mr-3 h-5 w-5" />
                  Analytics
                </Button>
              </>
            ) : (
              <>
                <div className="mt-6 mb-2 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Core Tools</div>
                {(["crm", "campaigns", "calendar", "whatsapp", "bulk_sms", "call_history", "analytics"] as const).map((key) => {
                  const tabMap: Record<string, string> = { crm: "crm", campaigns: "campaigns", calendar: "calendar", whatsapp: "whatsapp", bulk_sms: "sms", call_history: "callhistory", analytics: "analytics" };
                  const labelMap: Record<string, string> = { crm: "Lead CRM", campaigns: "Campaigns", calendar: "Calendar", whatsapp: "Bulk WhatsApp", bulk_sms: "Bulk SMS", call_history: "Call History", analytics: "Analytics" };
                  const iconMap: Record<string, React.ReactNode> = {
                    crm: <Users className="mr-3 h-5 w-5" />,
                    campaigns: <Megaphone className="mr-3 h-5 w-5" />,
                    calendar: <Calendar className="mr-3 h-5 w-5" />,
                    whatsapp: <MessageCircle className="mr-3 h-5 w-5" />,
                    bulk_sms: <MessageSquare className="mr-3 h-5 w-5" />,
                    call_history: <History className="mr-3 h-5 w-5" />,
                    analytics: <BarChart2 className="mr-3 h-5 w-5" />,
                  };
                  const tab = tabMap[key];
                  const label = labelMap[key];
                  const icon = iconMap[key];
                  const planFeatures: string[] = user?.planFeatures || [];
                  const hasFeature = planFeatures.includes("*") || planFeatures.includes(key);
                  const locked = !hasFeature;
                  return (
                    <Button
                      key={key}
                      variant={activeTab === tab ? "secondary" : "ghost"}
                      className={`w-full justify-start hover-elevate h-11 ${locked ? "opacity-60" : ""}`}
                      onClick={() => {
                        if (locked) {
                          setActiveTab(tab);
                        } else {
                          setActiveTab(tab);
                        }
                      }}
                      data-testid={`nav-${key}`}
                    >
                      {icon}
                      {label}
                      {locked && <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
                    </Button>
                  );
                })}
              </>
            )}
          </nav>
        </ScrollArea>

        <div className="p-4 border-t bg-muted/10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group">
                <Avatar className="h-9 w-9 border-2 border-background shadow-sm ring-1 ring-border group-hover:ring-primary/50 transition-all">
                  <AvatarImage src={user?.companyLogo || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate leading-none mb-1">{user?.firstName} {user?.lastName}</p>
                  <p className="text-[10px] text-muted-foreground truncate uppercase tracking-widest font-bold">{user?.role || 'User'}</p>
                </div>
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setActiveTab("profile")}>
                <User className="mr-2 h-4 w-4" /> Profile
              </DropdownMenuItem>
              {!isAdmin && (
                <DropdownMenuItem onClick={() => setActiveTab("billing")}>
                  <Wallet className="mr-2 h-4 w-4" /> Billing
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b flex items-center justify-between px-6 bg-background/50 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-4 w-full max-w-md">
            <div className="relative w-full" ref={headerSearchRef}>
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={isAdmin ? "Search users..." : "Search leads, campaigns..."}
                className="pl-9 bg-muted/20 border-none focus-visible:ring-1"
                value={headerSearch}
                onChange={(e) => { setHeaderSearch(e.target.value); setHeaderSearchOpen(true); }}
                onFocus={() => setHeaderSearchOpen(true)}
                onKeyDown={(e) => { if (e.key === "Escape") { setHeaderSearchOpen(false); setHeaderSearch(""); } }}
              />
              {headerSearchOpen && headerSearch.length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-border bg-popover shadow-xl overflow-hidden">
                  {!headerSearchHasResults ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">No results found.</div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto py-1">
                      {headerSearchResults.leads.length > 0 && (
                        <>
                          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Leads</div>
                          {headerSearchResults.leads.map((lead: any) => (
                            <button
                              key={lead._id}
                              className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-center gap-2 text-sm"
                              onMouseDown={() => { setActiveTab("crm"); setSearchTerm(lead.name); setHeaderSearch(""); setHeaderSearchOpen(false); }}
                            >
                              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium">{lead.name}</span>
                              <span className="text-muted-foreground text-xs ml-auto">{lead.phone}</span>
                            </button>
                          ))}
                        </>
                      )}
                      {headerSearchResults.campaigns.length > 0 && (
                        <>
                          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-t border-border/50">Campaigns</div>
                          {headerSearchResults.campaigns.map((c: any) => (
                            <button
                              key={c._id}
                              className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-center gap-2 text-sm"
                              onMouseDown={() => { setActiveTab("campaigns"); setHeaderSearch(""); setHeaderSearchOpen(false); }}
                            >
                              <Megaphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium">{c.name}</span>
                              <Badge variant="outline" className="ml-auto text-[10px] h-4">{c.status}</Badge>
                            </button>
                          ))}
                        </>
                      )}
                      {headerSearchResults.users.length > 0 && (
                        <>
                          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Users</div>
                          {headerSearchResults.users.map((u: any) => (
                            <button
                              key={u._id}
                              className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-center gap-2 text-sm"
                              onMouseDown={() => { setActiveTab("users"); setSearchTerm(`${u.firstName} ${u.lastName}`); setHeaderSearch(""); setHeaderSearchOpen(false); }}
                            >
                              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium">{u.firstName} {u.lastName}</span>
                              <span className="text-muted-foreground text-xs ml-auto">{u.email}</span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="relative" onClick={() => setLocation("/notifications")}>
              <Bell className="h-5 w-5" />
              {notifications.filter(n => n.readBy && Array.isArray(n.readBy) && user?._id && !n.readBy.includes(user._id)).length > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
              )}
            </Button>
          </div>
        </header>

        <div className="flex-1 p-6 overflow-auto">
          {/* Subscription expiry banner */}
          {!isAdmin && (() => {
            const sub = user?.subscription;
            if (!sub?.renewalDate) return null;
            const renewalDate = new Date(sub.renewalDate);
            const now = new Date();
            const daysLeft = Math.ceil((renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const expired = renewalDate < now;
            const expiringSoon = !expired && daysLeft <= 7;
            // Prefer plan with features; fall back to any name match
            const currentPlan =
              plans.find((p: Plan) => p.name === sub.plan && (p.features?.length ?? 0) > 0) ??
              plans.find((p: Plan) => p.name === sub.plan);
            if (!expired && !expiringSoon) return null;
            return (
              <div className={`mb-6 flex items-center justify-between gap-4 rounded-lg border px-5 py-4 ${expired ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400" : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"}`}>
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">
                      {expired ? "Your subscription has expired" : `Your subscription expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
                    </p>
                    <p className="text-xs opacity-80 mt-0.5">
                      {expired
                        ? "Renew now to restore access to all features and your call credits."
                        : `Renewal due on ${renewalDate.toLocaleDateString()}. Renew early to avoid any interruption.`}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={expired ? "default" : "outline"}
                  className={expired ? "bg-red-600 hover:bg-red-700 text-white border-none shrink-0" : "shrink-0"}
                  onClick={() => currentPlan ? setLocation(`/payment?plan=${currentPlan._id}&renew=true`) : setLocation("/pricing")}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Renew Now
                </Button>
              </div>
            );
          })()}
          {activeTab === "whatsapp" && <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}><FeatureGate featureKey="whatsapp"><BulkWhatsapp /></FeatureGate></Suspense>}
          {activeTab === "sms" && <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}><FeatureGate featureKey="bulk_sms"><BulkSms /></FeatureGate></Suspense>}
          {activeTab === "plans" && <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}><AdminPlans /></Suspense>}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {notifications
                .filter(n => n.type === "announcement" && n.readBy && Array.isArray(n.readBy) && user?._id && !n.readBy.includes(user._id) && !dismissedAnnouncements.includes(n._id))
                .map((announcement) => (
                  <Card key={announcement._id} className="bg-primary/10 border-primary/20 relative group overflow-hidden">
                    <div className="flex items-center gap-4 p-4">
                      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <Megaphone className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-relaxed">{announcement.message}</p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 hover:bg-primary/20" 
                        onClick={async () => {
                          try {
                            await apiRequest("POST", `/api/notifications/${announcement._id}/read`);
                            setDismissedAnnouncements(prev => [...prev, announcement._id]);
                          } catch (err) {
                            console.error("Failed to dismiss announcement:", err);
                          }
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}

              <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
              </div>

              {/* ── Today's Performance Banner ──────────────────────────────── */}
              <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent overflow-hidden">
                <CardContent className="py-4 px-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Today's Performance</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    {[
                      { label: "Calls", value: todaysCalls, icon: PhoneCall, color: "text-blue-500" },
                      { label: "Messages", value: todayMessages, icon: MessageSquare, color: "text-green-500" },
                      { label: "Replies", value: todayReplies, icon: MessageCircle, color: "text-orange-500" },
                      { label: "Conversion Rate", value: `${conversionRate}%`, icon: Target, color: "text-primary" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className={`h-9 w-9 rounded-lg bg-background/60 border border-border/40 flex items-center justify-center shrink-0`}>
                          <item.icon className={`h-4 w-4 ${item.color}`} />
                        </div>
                        <div>
                          <p className="text-xl font-bold leading-none">{item.value}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* ── Channel Performance Sparklines ──────────────────────────── */}
              {tierAtLeast("intermediate") && (<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  {
                    label: "AI Calls",
                    sub: "Active Campaigns",
                    value: campaigns.filter(c => c.status === "Active").length,
                    icon: PhoneCall,
                    color: "#3b82f6",
                    data: [2,4,3,6,5,8,7,10,9,12].map((v,i)=>({v})),
                  },
                  {
                    label: "WhatsApp",
                    sub: "Sent This Month",
                    value: wpMonthlyData[new Date().getMonth()].sent.toLocaleString(),
                    icon: MessageCircle,
                    color: "#10b981",
                    data: [3200,3800,4100,3700,4500,5200,5800,6100,5600,6400].map((v,i)=>({v})),
                  },
                  {
                    label: "SMS Campaigns",
                    sub: "Sent This Month",
                    value: smsMonthlyData[new Date().getMonth()].sent.toLocaleString(),
                    icon: MessageSquare,
                    color: "#8b5cf6",
                    data: [5100,6200,7100,6500,8200,9400,10200,11000,9800,12100].map((v,i)=>({v})),
                  },
                ].map((ch, i) => (
                  <Card key={i} className="hover-elevate overflow-hidden">
                    <CardContent className="pt-5 pb-0 px-5">
                      <div className="flex items-center gap-2 mb-1">
                        <ch.icon className="h-4 w-4" style={{ color: ch.color }} />
                        <span className="font-semibold text-sm">{ch.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{ch.sub}: <span className="font-bold text-foreground">{ch.value}</span></p>
                    </CardContent>
                    <div className="h-16">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={ch.data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id={`chGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={ch.color} stopOpacity={0.4} />
                              <stop offset="95%" stopColor={ch.color} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="v" stroke={ch.color} strokeWidth={2} fill={`url(#chGrad${i})`} dot={false} isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                ))}
              </div>)}

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                  <Card key={i} className="hover-elevate cursor-pointer border-l-4 border-l-primary" onClick={() => setActiveTab(stat.tab)}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                      <stat.icon className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{stat.value}</div>
                      {(stat as any).change && (
                        <p className={`text-xs ${(stat as any).change?.startsWith('+') ? 'text-green-500' : (stat as any).change === 'Balance' ? 'text-primary' : 'text-red-500'}`}>
                          {(stat as any).change} {(stat as any).change !== 'Balance' && 'from last week'}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* ── AI Suggestions + Live Activity Feed ─────────────────────── */}
              {tierAtLeast("intermediate") && (<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* AI Suggestions */}
                <Card className="hover-elevate border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BrainCircuit className="h-5 w-5 text-primary" />
                      AI Suggestions
                    </CardTitle>
                    <CardDescription>Smart actions based on your data</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {aiSuggestions.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-background/70 border border-border/40 group">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Zap className={`h-4 w-4 ${s.color}`} />
                        </div>
                        <p className="text-sm flex-1 leading-relaxed">{s.text}</p>
                        <Button
                          size="sm"
                          className="shrink-0 h-8 text-xs bg-primary hover:bg-primary/90"
                          onClick={() => setActiveTab(s.tab)}
                        >
                          {s.action}
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Live Activity Feed */}
                <Card className="hover-elevate">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      Live Activity Feed
                    </CardTitle>
                    <CardDescription>Most recent interactions across all leads</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {liveActivityFeed.length > 0 ? (
                      <div className="space-y-2.5">
                        {liveActivityFeed.map((item, i) => (
                          <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                              item.type === "call" ? "bg-blue-500/10" : item.type === "email" ? "bg-green-500/10" : "bg-purple-500/10"
                            }`}>
                              {item.type === "call"
                                ? <PhoneCall className="h-3.5 w-3.5 text-blue-500" />
                                : item.type === "email"
                                ? <Mail className="h-3.5 w-3.5 text-green-500" />
                                : <FileText className="h-3.5 w-3.5 text-purple-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm leading-tight">
                                <span className="font-medium">{item.leadName}</span>
                                <span className="text-muted-foreground"> — {item.type === "call" ? `Call logged` : item.type === "email" ? "Email sent" : "Note added"}
                                {item.outcome ? ` · ${item.outcome}` : ""}</span>
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">{formatTimeAgo(item.date)}</p>
                            </div>
                            <Badge variant="outline" className={`text-xs shrink-0 ${
                              item.type === "call" ? "border-blue-500/30 text-blue-500" : item.type === "email" ? "border-green-500/30 text-green-500" : "border-purple-500/30 text-purple-500"
                            }`}>{item.type}</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                        <History className="h-8 w-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No activity logged yet</p>
                        <p className="text-xs text-muted-foreground">Log calls, emails, or notes on your leads to see them here</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>)}

              {/* Admin Dashboard Charts */}
              {isAdmin && (<>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <Card className="hover-elevate">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Subscription Growth</CardTitle>
                        <CardDescription>Monthly new subscriptions</CardDescription>
                      </div>
                      <Select value={selectedAdminSubYear.toString()} onValueChange={(val) => setSelectedAdminSubYear(parseInt(val))}>
                        <SelectTrigger className="w-[100px]"><SelectValue placeholder="Year" /></SelectTrigger>
                        <SelectContent>{[2024, 2025, 2026].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                      </Select>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={[{ month: "Jan", subs: 45 }, { month: "Feb", subs: 52 }, { month: "Mar", subs: 61 }, { month: "Apr", subs: 58 }, { month: "May", subs: 72 }, { month: "Jun", subs: 85 }, { month: "Jul", subs: 94 }, { month: "Aug", subs: 103 }, { month: "Sep", subs: 110 }, { month: "Oct", subs: 125 }, { month: "Nov", subs: 140 }, { month: "Dec", subs: 155 }]}>
                          <defs><linearGradient id="colorSubs" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/></linearGradient></defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground) / 0.1)" />
                          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} />
                          <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                          <Area type="monotone" dataKey="subs" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorSubs)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="hover-elevate">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div><CardTitle className="text-lg">Plan Distribution</CardTitle><CardDescription>Month-wise subscription split</CardDescription></div>
                      <div className="flex gap-2">
                        <Select value={selectedAdminPieMonth.toString()} onValueChange={(val) => setSelectedAdminPieMonth(parseInt(val))}>
                          <SelectTrigger className="w-[110px]"><SelectValue placeholder="Month" /></SelectTrigger>
                          <SelectContent>{["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => <SelectItem key={m} value={i.toString()}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={selectedAdminPieYear.toString()} onValueChange={(val) => setSelectedAdminPieYear(parseInt(val))}>
                          <SelectTrigger className="w-[100px]"><SelectValue placeholder="Year" /></SelectTrigger>
                          <SelectContent>{[2024, 2025, 2026].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={[{ name: 'Basic', value: 400 }, { name: 'Advanced', value: 300 }, { name: 'Enterprise', value: 200 }]} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                            {['#f97316', '#3b82f6', '#10b981'].map((color, index) => <Cell key={`cell-${index}`} fill={color} />)}
                          </Pie>
                          <RechartsTooltip /><Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="hover-elevate">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div><CardTitle className="text-lg">Revenue Growth</CardTitle><CardDescription>Month-on-month sales (₹)</CardDescription></div>
                      <Select value={selectedAdminRevenueYear.toString()} onValueChange={(val) => setSelectedAdminRevenueYear(parseInt(val))}>
                        <SelectTrigger className="w-[100px]"><SelectValue placeholder="Year" /></SelectTrigger>
                        <SelectContent>{[2024, 2025, 2026].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                      </Select>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={[{ month: "Jan", rev: 120000 }, { month: "Feb", rev: 145000 }, { month: "Mar", rev: 168000 }, { month: "Apr", rev: 155000 }, { month: "May", rev: 192000 }, { month: "Jun", rev: 225000 }, { month: "Jul", rev: 254000 }, { month: "Aug", rev: 283000 }, { month: "Sep", rev: 310000 }, { month: "Oct", rev: 345000 }, { month: "Nov", rev: 380000 }, { month: "Dec", rev: 425000 }]}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground) / 0.1)" />
                          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} />
                          <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                          <Line type="monotone" dataKey="rev" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4, fill: 'hsl(var(--primary))' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="hover-elevate">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div><CardTitle className="text-lg">Credit Usage</CardTitle><CardDescription>Daily platform consumption</CardDescription></div>
                      <div className="flex gap-2">
                        <Select value={selectedAdminCreditMonth.toString()} onValueChange={(val) => setSelectedAdminCreditMonth(parseInt(val))}>
                          <SelectTrigger className="w-[110px]"><SelectValue placeholder="Month" /></SelectTrigger>
                          <SelectContent>{["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => <SelectItem key={m} value={i.toString()}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={selectedAdminCreditYear.toString()} onValueChange={(val) => setSelectedAdminCreditYear(parseInt(val))}>
                          <SelectTrigger className="w-[100px]"><SelectValue placeholder="Year" /></SelectTrigger>
                          <SelectContent>{[2024, 2025, 2026].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={[{ day: "1", usage: 4500 }, { day: "5", usage: 5200 }, { day: "10", usage: 6100 }, { day: "15", usage: 5800 }, { day: "20", usage: 7200 }, { day: "25", usage: 8500 }, { day: "30", usage: 9400 }]}>
                          <defs><linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/></linearGradient></defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground) / 0.1)" />
                          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} />
                          <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                          <Area type="monotone" dataKey="usage" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorUsage)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* ── Admin: Conversion KPI sparkline row ─────────────────────────── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Calls Today", value: totalCallsToday, icon: PhoneCall, color: "blue", data: [12,18,14,22,28,20,totalCallsToday||26], suffix: "" },
                    { label: "WhatsApp Sent", value: wpSent, icon: MessageCircle, color: "green", data: [520,680,590,820,740,430,wpSent], suffix: "" },
                    { label: "Replies", value: totalReplies, icon: MessageSquare, color: "purple", data: [95,130,115,175,158,88,totalReplies||62], suffix: "" },
                    { label: "Conversion", value: platformConversion, icon: ArrowUpRight, color: "orange", data: [10,14,12,18,16,15,parseFloat(platformConversion)], suffix: "%" },
                  ].map((kpi, i) => (
                    <Card key={i} className="hover-elevate overflow-hidden">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
                          <div className={`h-7 w-7 rounded-md flex items-center justify-center bg-${kpi.color}-500/10`}>
                            <kpi.icon className={`h-4 w-4 text-${kpi.color}-500`} />
                          </div>
                        </div>
                        <div className="text-2xl font-bold mt-1">{kpi.value}{kpi.suffix}</div>
                      </CardHeader>
                      <CardContent className="px-0 pb-0 pt-0 h-14">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={kpi.data.map((v, idx) => ({ v, idx }))} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id={`kpiGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={["#3b82f6","#22c55e","#a855f7","#f97316"][i]} stopOpacity={0.25}/>
                                <stop offset="95%" stopColor={["#3b82f6","#22c55e","#a855f7","#f97316"][i]} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="v" stroke={["#3b82f6","#22c55e","#a855f7","#f97316"][i]} strokeWidth={2} fill={`url(#kpiGrad${i})`} dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* ── Admin: Agent Perf + Lead Source ─────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="hover-elevate">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Agent Performance</CardTitle>
                      <CardDescription>Calls and conversion by agent</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Agent</TableHead>
                            <TableHead className="text-center">Leads</TableHead>
                            <TableHead className="text-center">Calls</TableHead>
                            <TableHead className="text-right">Conversion</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {agentPerformance.length === 0 ? (
                            <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">No agent data yet</TableCell></TableRow>
                          ) : agentPerformance.map((a, i) => (
                            <TableRow key={i} data-testid={`row-agent-${i}`}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-7 w-7"><AvatarFallback className="text-xs bg-primary/10 text-primary">{a.name[0].toUpperCase()}</AvatarFallback></Avatar>
                                  <span className="font-medium text-sm capitalize">{a.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center text-sm">{a.leads}</TableCell>
                              <TableCell className="text-center text-sm">{a.calls}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Progress value={a.conversion} className="w-14 h-1.5" />
                                  <span className={`text-xs font-semibold ${a.conversion > 20 ? "text-green-500" : a.conversion > 10 ? "text-yellow-500" : "text-muted-foreground"}`}>{a.conversion}%</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card className="hover-elevate">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" />Lead Source Performance</CardTitle>
                      <CardDescription>Leads acquired and conversion by channel</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Source</TableHead>
                            <TableHead className="text-center">Calls</TableHead>
                            <TableHead className="text-center">Conv.%</TableHead>
                            <TableHead className="text-right">Trend</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {leadSourceData.map((s, i) => (
                            <TableRow key={i} data-testid={`row-source-${i}`}>
                              <TableCell className="font-medium text-sm">{s.source}</TableCell>
                              <TableCell className="text-center text-sm">{s.calls}</TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Progress value={s.conversion} className="w-12 h-1.5" />
                                  <span className="text-xs">{s.conversion}%</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="outline" className="text-xs text-green-600 dark:text-green-400 border-green-500/50">{s.trend}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>

                {/* ══ Admin: WhatsApp Monthly Analytics ══════════════════════════════ */}
                <Card className="hover-elevate border-green-500/20">
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-green-500">
                        <MessageCircle className="h-5 w-5" />WhatsApp Analytics
                        <Badge className="ml-1 bg-green-500/15 text-green-600 dark:text-green-400 border-none text-xs">Monthly</Badge>
                      </CardTitle>
                      <CardDescription>Monthly message volume, delivery and engagement — {new Date().getFullYear()}</CardDescription>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
                      {[
                        { lbl: "Total Sent",    val: wpYearTotal.toLocaleString(),     cls: "text-foreground" },
                        { lbl: "Delivered",     val: wpYearDelivered.toLocaleString(), cls: "text-green-500" },
                        { lbl: "Replies",       val: wpYearReplies.toLocaleString(),   cls: "text-purple-500" },
                        { lbl: "Delivery Rate", val: `${wpDeliveryRate}%`,             cls: "text-emerald-500" },
                      ].map(s => (
                        <div key={s.lbl} className="rounded-lg bg-muted/40 px-3 py-2 text-center min-w-[80px]">
                          <p className="text-[10px] text-muted-foreground mb-0.5">{s.lbl}</p>
                          <p className={`text-base font-bold ${s.cls}`}>{s.val}</p>
                        </div>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={wpMonthlyData} margin={{top:4,right:8,left:0,bottom:0}}>
                          <defs>
                            <linearGradient id="wpMSentGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="wpMDelivGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="wpMReplGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#a855f7" stopOpacity={0.2}/><stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground) / 0.08)" />
                          <XAxis dataKey="m" axisLine={false} tickLine={false} tick={{fill:'hsl(var(--muted-foreground))',fontSize:11}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill:'hsl(var(--muted-foreground))',fontSize:11}} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                          <RechartsTooltip contentStyle={{backgroundColor:'hsl(var(--card))',borderColor:'hsl(var(--border))',borderRadius:'8px',fontSize:'12px'}} formatter={(v:any) => v.toLocaleString()} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:'12px',paddingTop:'8px'}} />
                          <Area type="monotone" dataKey="sent" name="Sent" stroke="#22c55e" strokeWidth={2} fill="url(#wpMSentGrad)" dot={false} />
                          <Area type="monotone" dataKey="delivered" name="Delivered" stroke="#10b981" strokeWidth={2} fill="url(#wpMDelivGrad)" dot={false} />
                          <Area type="monotone" dataKey="replies" name="Replies" stroke="#a855f7" strokeWidth={2} fill="url(#wpMReplGrad)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border/40">
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-muted-foreground">Reply Rate</p>
                        <div className="flex items-center gap-2"><Progress value={wpReplyRate} className="flex-1 h-1.5" /><span className="text-xs font-bold text-purple-500">{wpReplyRate}%</span></div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-muted-foreground">Delivery Rate</p>
                        <div className="flex items-center gap-2"><Progress value={wpDeliveryRate} className="flex-1 h-1.5" /><span className="text-xs font-bold text-green-500">{wpDeliveryRate}%</span></div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-muted-foreground">Peak Month</p>
                        <p className="text-sm font-semibold">{wpMonthlyData.reduce((a,b) => a.sent > b.sent ? a : b).m} — {wpMonthlyData.reduce((a,b) => a.sent > b.sent ? a : b).sent.toLocaleString()} msgs</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* ══ Admin: SMS Monthly Analytics ═══════════════════════════════════ */}
                <Card className="hover-elevate border-blue-500/20">
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-blue-500">
                        <Send className="h-5 w-5" />SMS Analytics
                        <Badge className="ml-1 bg-blue-500/15 text-blue-600 dark:text-blue-400 border-none text-xs">Monthly</Badge>
                      </CardTitle>
                      <CardDescription>Monthly SMS send volume, delivery and click-through — {new Date().getFullYear()}</CardDescription>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
                      {[
                        { lbl: "Total Sent",   val: smsTotalSent.toLocaleString(),      cls: "text-foreground" },
                        { lbl: "Delivered",    val: smsTotalDelivered.toLocaleString(),  cls: "text-blue-500" },
                        { lbl: "Clicks",       val: smsTotalClicks.toLocaleString(),     cls: "text-orange-500" },
                        { lbl: "Click Rate",   val: `${smsClickRate}%`,                 cls: "text-amber-500" },
                      ].map(s => (
                        <div key={s.lbl} className="rounded-lg bg-muted/40 px-3 py-2 text-center min-w-[80px]">
                          <p className="text-[10px] text-muted-foreground mb-0.5">{s.lbl}</p>
                          <p className={`text-base font-bold ${s.cls}`}>{s.val}</p>
                        </div>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={smsMonthlyData} barGap={2} margin={{top:4,right:8,left:0,bottom:0}}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground) / 0.08)" />
                          <XAxis dataKey="m" axisLine={false} tickLine={false} tick={{fill:'hsl(var(--muted-foreground))',fontSize:11}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill:'hsl(var(--muted-foreground))',fontSize:11}} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                          <RechartsTooltip contentStyle={{backgroundColor:'hsl(var(--card))',borderColor:'hsl(var(--border))',borderRadius:'8px',fontSize:'12px'}} formatter={(v:any) => v.toLocaleString()} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:'12px',paddingTop:'8px'}} />
                          <Bar dataKey="sent" name="Sent" fill="#3b82f6" opacity={0.45} radius={[3,3,0,0]} />
                          <Bar dataKey="delivered" name="Delivered" fill="#3b82f6" radius={[3,3,0,0]} />
                          <Bar dataKey="clicks" name="Clicks" fill="#f97316" radius={[3,3,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border/40">
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-muted-foreground">Delivery Rate</p>
                        <div className="flex items-center gap-2"><Progress value={smsDeliveryRate} className="flex-1 h-1.5" /><span className="text-xs font-bold text-blue-500">{smsDeliveryRate}%</span></div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-muted-foreground">Click-Through Rate</p>
                        <div className="flex items-center gap-2"><Progress value={smsClickRate} className="flex-1 h-1.5" /><span className="text-xs font-bold text-orange-500">{smsClickRate}%</span></div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-muted-foreground">Peak Month</p>
                        <p className="text-sm font-semibold">{smsMonthlyData.reduce((a,b) => a.sent > b.sent ? a : b).m} — {smsMonthlyData.reduce((a,b) => a.sent > b.sent ? a : b).sent.toLocaleString()} SMS</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* ══ Admin: Call Monthly Analytics ══════════════════════════════════ */}
                <Card className="hover-elevate border-orange-500/20">
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-orange-500">
                        <PhoneCall className="h-5 w-5" />Call Analytics
                        <Badge className="ml-1 bg-orange-500/15 text-orange-600 dark:text-orange-400 border-none text-xs">Monthly</Badge>
                      </CardTitle>
                      <CardDescription>Monthly call volume, answer rate and duration — {new Date().getFullYear()}</CardDescription>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
                      {[
                        { lbl: "Total Calls",  val: callTotalCalls.toLocaleString(),    cls: "text-foreground" },
                        { lbl: "Answered",     val: callTotalAnswered.toLocaleString(),  cls: "text-orange-500" },
                        { lbl: "Missed",       val: callTotalMissed.toLocaleString(),    cls: "text-red-500" },
                        { lbl: "Answer Rate",  val: `${callAnswerRate}%`,               cls: "text-green-500" },
                      ].map(s => (
                        <div key={s.lbl} className="rounded-lg bg-muted/40 px-3 py-2 text-center min-w-[80px]">
                          <p className="text-[10px] text-muted-foreground mb-0.5">{s.lbl}</p>
                          <p className={`text-base font-bold ${s.cls}`}>{s.val}</p>
                        </div>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={callMonthlyData} margin={{top:4,right:8,left:0,bottom:0}}>
                          <defs>
                            <linearGradient id="callTotalGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f97316" stopOpacity={0.2}/><stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground) / 0.08)" />
                          <XAxis dataKey="m" axisLine={false} tickLine={false} tick={{fill:'hsl(var(--muted-foreground))',fontSize:11}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill:'hsl(var(--muted-foreground))',fontSize:11}} />
                          <RechartsTooltip contentStyle={{backgroundColor:'hsl(var(--card))',borderColor:'hsl(var(--border))',borderRadius:'8px',fontSize:'12px'}} formatter={(v:any) => v.toLocaleString()} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:'12px',paddingTop:'8px'}} />
                          <Line type="monotone" dataKey="total" name="Total Calls" stroke="#f97316" strokeWidth={2.5} dot={{ r:3, fill:'#f97316' }} activeDot={{ r:5 }} />
                          <Line type="monotone" dataKey="answered" name="Answered" stroke="#22c55e" strokeWidth={2} dot={{ r:3, fill:'#22c55e' }} activeDot={{ r:5 }} />
                          <Line type="monotone" dataKey="missed" name="Missed" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 3" dot={{ r:3, fill:'#ef4444' }} activeDot={{ r:5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border/40">
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-muted-foreground">Answer Rate</p>
                        <div className="flex items-center gap-2"><Progress value={callAnswerRate} className="flex-1 h-1.5" /><span className="text-xs font-bold text-green-500">{callAnswerRate}%</span></div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-muted-foreground">Avg. Call Duration</p>
                        <p className="text-sm font-semibold">{callAvgDuration} min / call</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-muted-foreground">Peak Month</p>
                        <p className="text-sm font-semibold">{callMonthlyData.reduce((a,b) => a.total > b.total ? a : b).m} — {callMonthlyData.reduce((a,b) => a.total > b.total ? a : b).total.toLocaleString()} calls</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* ── Admin: Best Contact Times + Revenue Analytics ────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="hover-elevate">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" />Best Contact Times</CardTitle>
                      <CardDescription>When customers are most responsive to calls</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {bestContactTimes.map((t, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-24 text-sm font-medium shrink-0">{t.slot}</div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Progress value={t.success} className="flex-1 h-2" />
                              <span className={`text-xs font-bold w-10 text-right ${t.success >= 65 ? "text-green-500" : t.success >= 50 ? "text-yellow-500" : "text-muted-foreground"}`}>{t.success}%</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">{t.label}</p>
                          </div>
                        </div>
                      ))}
                      <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
                        <p className="text-xs text-muted-foreground flex items-start gap-2">
                          <Zap className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                          {_bestSlot ? (
                            <>AI Tip: The <strong className="text-foreground">{_bestSlot.slot}</strong> window has your highest answer rate at <strong className="text-green-500">{_bestSlot.success}%</strong>. Schedule campaigns here for best results.</>
                          ) : (
                            <>AI Tip: Log call activity on your leads to unlock data-driven contact time recommendations.</>
                          )}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="hover-elevate">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" />Revenue Analytics</CardTitle>
                      <CardDescription>Monthly revenue from active plan subscriptions</CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Plan</TableHead>
                            <TableHead className="text-center">Subscribers</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                            <TableHead className="text-right">vs Last Mo.</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {revenueRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">
                                No active plan subscriptions yet
                              </TableCell>
                            </TableRow>
                          ) : revenueRows.map((r, i) => {
                            const growth = r.prev > 0 ? (((r.revenue - r.prev) / r.prev) * 100).toFixed(0) : r.revenue > 0 ? "100" : "0";
                            return (
                              <TableRow key={i} data-testid={`row-revenue-${i}`}>
                                <TableCell className="font-medium text-sm">{r.channel}</TableCell>
                                <TableCell className="text-center text-sm">{r.leads}</TableCell>
                                <TableCell className="text-right text-sm font-semibold">₹{r.revenue.toLocaleString()}</TableCell>
                                <TableCell className="text-right">
                                  <span className={`text-xs font-semibold ${parseFloat(growth) >= 0 ? "text-green-500" : "text-red-500"}`}>
                                    {parseFloat(growth) >= 0 ? "+" : ""}{growth}%
                                  </span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      <div className="mt-3 pt-3 border-t flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Total Revenue</span>
                        <span className="font-bold text-primary">₹{revenueRows.reduce((a, r) => a + r.revenue, 0).toLocaleString()}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* ── Admin: User Activity Table ──────────────────────────────────── */}
                <Card className="hover-elevate">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />User Activity</CardTitle>
                      <CardDescription>All registered users and their subscription details</CardDescription>
                    </div>
                    <Badge variant="outline" className="text-xs">{registeredUsers.length} users</Badge>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Credit Balance</TableHead>
                          <TableHead className="text-right">Joined</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {registeredUsers.length === 0 && (
                          <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No users yet.</TableCell></TableRow>
                        )}
                        {registeredUsers.map(u => (
                          <TableRow key={u._id} data-testid={`row-user-${u._id}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-8 w-8"><AvatarFallback className="text-xs bg-primary/10 text-primary">{(u.firstName?.[0] || u.email?.[0] || "?").toUpperCase()}</AvatarFallback></Avatar>
                                <div>
                                  <p className="font-medium text-sm">{u.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : u.email}</p>
                                  <p className="text-xs text-muted-foreground">{u.email}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell><Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs capitalize">{u.role || "user"}</Badge></TableCell>
                            <TableCell><span className="text-sm">{u.subscription?.plan || <span className="text-muted-foreground">—</span>}</span></TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs ${u.subscription?.status === "Active" ? "border-green-500 text-green-600 dark:text-green-400" : "border-muted-foreground text-muted-foreground"}`}>
                                {u.subscription?.status || "No Plan"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">₹{(u.subscription?.monthlyCallCredits || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* ── Admin: Platform Insights ─────────────────────────────────────── */}
                <Card className="hover-elevate border-primary/20 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary" />Platform Insights</CardTitle>
                    <CardDescription>AI-driven observations about your platform</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {adminInsights.map((insight, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-background/60 border border-border/40">
                          <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                            <Zap className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <p className="text-sm leading-relaxed">{insight}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>)}

              {!isAdmin && (
                <>
                  {tierAtLeast("intermediate") && (<>
                  {/* ── User: Secondary KPI Row ─────────────────────────────────────── */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Card className="hover-elevate border-l-4 border-l-green-500">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Conversion Rate</CardTitle>
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{conversionRate}%</div>
                        <p className="text-xs text-muted-foreground">{closedLeads} closed of {leads.length} total</p>
                      </CardContent>
                    </Card>
                    <Card className="hover-elevate border-l-4 border-l-blue-500">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Calls Today</CardTitle>
                        <PhoneCall className="h-4 w-4 text-blue-500" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{todaysCalls}</div>
                        <p className="text-xs text-muted-foreground">AI calls logged today</p>
                      </CardContent>
                    </Card>
                    <Card className="hover-elevate border-l-4 border-l-purple-500">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Interested</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-purple-500" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{interestedLeads}</div>
                        <p className="text-xs text-muted-foreground">Leads showing interest</p>
                      </CardContent>
                    </Card>
                    <Card className="hover-elevate border-l-4 border-l-orange-500">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Follow Up Due</CardTitle>
                        <Clock className="h-4 w-4 text-orange-500" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{followUpLeads}</div>
                        <p className="text-xs text-muted-foreground">Leads awaiting follow-up</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="hover-elevate">
                    <CardHeader className="flex flex-row items-center justify-between gap-4">
                      <div><CardTitle>Recent Logs</CardTitle><CardDescription>Last 50 lead records</CardDescription></div>
                      <div className="flex items-center gap-2">
                        <Select value={logsCampaignFilter} onValueChange={setLogsCampaignFilter}>
                          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Filter by Campaign" /></SelectTrigger>
                          <SelectContent><SelectItem value="all">All Campaigns</SelectItem>{campaigns.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" onClick={() => setActiveTab("callhistory")}>View More<ChevronRight className="ml-2 h-4 w-4" /></Button>
                      </div>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Lead Name</TableHead><TableHead>Campaign</TableHead><TableHead>Channel</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Last Interaction</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {leads.filter(l => logsCampaignFilter === "all" || l.campaignId === logsCampaignFilter).slice(0, 50).map((lead) => (
                            <TableRow key={lead._id}>
                              <TableCell className="font-medium">{lead.name}</TableCell>
                              <TableCell>{lead.campaignName || "General"}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <TooltipProvider><Tooltip><TooltipTrigger asChild><Phone className="h-4 w-4 text-primary cursor-pointer" /></TooltipTrigger><TooltipContent>AI Call Enabled</TooltipContent></Tooltip></TooltipProvider>
                                  <TooltipProvider><Tooltip><TooltipTrigger asChild><MessageSquare className="h-4 w-4 text-blue-500 cursor-pointer" /></TooltipTrigger><TooltipContent>SMS Enabled</TooltipContent></Tooltip></TooltipProvider>
                                  <TooltipProvider><Tooltip><TooltipTrigger asChild><MessageCircle className="h-4 w-4 text-green-500 cursor-pointer" /></TooltipTrigger><TooltipContent>WhatsApp Enabled</TooltipContent></Tooltip></TooltipProvider>
                                </div>
                              </TableCell>
                              <TableCell>
                                <TooltipProvider><Tooltip><TooltipTrigger asChild><Badge variant={lead.status === 'Interested' ? 'default' : 'secondary'} className={`cursor-help ${lead.status === 'Interested' ? 'bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/25 border-none' : ''}`}>{lead.status}</Badge></TooltipTrigger><TooltipContent className="max-w-xs"><p className="text-xs font-semibold mb-1">{lead.status} Meaning:</p><p className="text-xs opacity-90">{lead.status === "New" && "Initial lead entry, no contact yet."}{lead.status === "In Progress" && "Active communication initiated."}{lead.status === "Interested" && "Lead showed positive response."}{lead.status === "Follow Up" && "Requires further interaction."}{lead.status === "Closed" && "Deal successfully completed."}{lead.status === "Unqualified" && "Not a fit for this campaign."}</p></TooltipContent></Tooltip></TooltipProvider>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">{formatTimeAgo(lead.lastContact)}</TableCell>
                              <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => handleViewLead(lead)}><Eye className="h-4 w-4" /></Button></TableCell>
                            </TableRow>
                          ))}
                          {leads.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No leads yet.</TableCell></TableRow>}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  </>)}
                  {tierAtLeast("advanced") && (<>
                  {/* ── Campaign Performance Table ──────────────────────────────────── */}
                  <Card className="hover-elevate">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" />Campaign Performance</CardTitle>
                      <CardDescription>Leads, calls, and conversion per campaign</CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Campaign</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-center">Total Leads</TableHead>
                            <TableHead className="text-center">Calls Made</TableHead>
                            <TableHead className="text-center">Interested</TableHead>
                            <TableHead className="text-center">Closed</TableHead>
                            <TableHead className="text-right">Conversion</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {campaignPerformance.length === 0 && (
                            <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No campaigns yet.</TableCell></TableRow>
                          )}
                          {campaignPerformance.map(c => {
                            const conv = c.total > 0 ? ((c.closed / c.total) * 100).toFixed(1) : "0.0";
                            return (
                              <TableRow key={c._id} data-testid={`row-campaign-perf-${c._id}`}>
                                <TableCell className="font-medium">{c.name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={`text-xs ${c.status === "Active" ? "border-green-500 text-green-600 dark:text-green-400" : c.status === "Paused" ? "border-yellow-500 text-yellow-600 dark:text-yellow-400" : "border-muted-foreground text-muted-foreground"}`}>
                                    {c.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-center">{c.total}</TableCell>
                                <TableCell className="text-center">{c.callsMade}</TableCell>
                                <TableCell className="text-center">
                                  <span className={c.interested > 0 ? "text-purple-600 dark:text-purple-400 font-medium" : ""}>{c.interested}</span>
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className={c.closed > 0 ? "text-green-600 dark:text-green-400 font-medium" : ""}>{c.closed}</span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <Progress value={parseFloat(conv)} className="w-16 h-1.5" />
                                    <span className={`text-xs font-semibold ${parseFloat(conv) > 20 ? "text-green-600 dark:text-green-400" : parseFloat(conv) > 5 ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"}`}>{conv}%</span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* ── Upcoming Appointments + AI Insights ─────────────────────────── */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="hover-elevate">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" />Upcoming Appointments</CardTitle>
                        <CardDescription>Your next scheduled meetings</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {upcomingAppts.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                            <Calendar className="h-8 w-8 opacity-30" />
                            <p className="text-sm">No upcoming appointments</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {upcomingAppts.map(appt => (
                              <div key={appt._id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors" data-testid={`card-appt-upcoming-${appt._id}`}>
                                <div className="h-9 w-9 rounded-lg bg-primary/10 flex flex-col items-center justify-center shrink-0">
                                  <span className="text-[10px] font-bold text-primary leading-none">{new Date(appt.date).toLocaleDateString("en", { month: "short" }).toUpperCase()}</span>
                                  <span className="text-sm font-bold text-primary leading-none">{new Date(appt.date).getDate()}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{appt.title}</p>
                                  <p className="text-xs text-muted-foreground">{appt.leadName} · {appt.time} · {appt.type}</p>
                                </div>
                                <Badge variant="outline" className="text-[10px] shrink-0">{appt.type}</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="hover-elevate border-primary/20 bg-primary/5">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary" />AI Insights</CardTitle>
                        <CardDescription>Smart observations from your data</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {insightsLoading && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              Generating AI insights…
                            </div>
                          )}
                          {(llmInsights.length > 0 ? llmInsights : aiInsights).map((insight, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-background/60 border border-border/40">
                              <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                                <Zap className="h-3.5 w-3.5 text-primary" />
                              </div>
                              <p className="text-sm leading-relaxed">{insight}</p>
                            </div>
                          ))}
                          {llmInsights.length > 0 && (
                            <p className="text-xs text-muted-foreground text-right pt-1">Powered by OpenAI · refreshes every 15 min</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  </>)}
                  {tierAtLeast("complete") && (<>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="hover-elevate shadow-lg border-primary/10 overflow-hidden group">
                      <CardHeader className="flex flex-row items-center justify-between gap-4">
                        <div><CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" />Lead Distribution</CardTitle><CardDescription>Visual breakdown by status</CardDescription></div>
                        <Select value={overviewCampaignFilter} onValueChange={setOverviewCampaignFilter}>
                          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="All Campaigns" /></SelectTrigger>
                          <SelectContent><SelectItem value="all">All Campaigns</SelectItem>{campaigns.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </CardHeader>
                      <CardContent className="h-80 relative">
                        {leads.length > 0 ? (
                          <><ResponsiveContainer width="100%" height="100%"><PieChart><defs><filter id="advancedShadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="3" /><feOffset dx="2" dy="4" result="offsetblur" /><feComponentTransfer><feFuncA type="linear" slope="0.5" /></feComponentTransfer><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs><Pie data={[{ name: "New", value: leads.filter(l => l.status === "New" && (overviewCampaignFilter === "all" || l.campaignId === overviewCampaignFilter)).length }, { name: "Interested", value: leads.filter(l => l.status === "Interested" && (overviewCampaignFilter === "all" || l.campaignId === overviewCampaignFilter)).length }, { name: "Follow Up", value: leads.filter(l => l.status === "Follow Up" && (overviewCampaignFilter === "all" || l.campaignId === overviewCampaignFilter)).length }, { name: "In Progress", value: leads.filter(l => l.status === "In Progress" && (overviewCampaignFilter === "all" || l.campaignId === overviewCampaignFilter)).length }, { name: "Closed", value: leads.filter(l => l.status === "Closed" && (overviewCampaignFilter === "all" || l.campaignId === overviewCampaignFilter)).length }, { name: "Unqualified", value: leads.filter(l => l.status === "Unqualified" && (overviewCampaignFilter === "all" || l.campaignId === overviewCampaignFilter)).length }].filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={70} outerRadius={95} paddingAngle={5} dataKey="value" stroke="none">{["#f97316", "#10b981", "#3b82f6", "#8b5cf6", "#6366f1", "#94a3b8"].map((color, index) => <Cell key={`cell-${index}`} fill={color} filter="url(#advancedShadow)" className="hover:opacity-80 transition-all duration-300 cursor-pointer" />)}</Pie><RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} /><Legend verticalAlign="bottom" height={36} iconType="circle" /></PieChart></ResponsiveContainer><div className="absolute inset-0 flex items-center justify-center pointer-events-none mb-9"><div className="text-center animate-in fade-in zoom-in duration-500"><p className="text-3xl font-extrabold tracking-tighter">{leads.filter(l => overviewCampaignFilter === "all" || l.campaignId === overviewCampaignFilter).length}</p><p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Total Leads</p></div></div></>
                        ) : <div className="flex h-full items-center justify-center text-muted-foreground">No data yet</div>}
                      </CardContent>
                    </Card>

                    <Card className="hover-elevate shadow-lg border-primary/10 overflow-hidden">
                      <CardHeader className="flex flex-row items-center justify-between gap-4">
                        <div><CardTitle className="flex items-center gap-2"><BarChart className="h-5 w-5 text-primary" />Growth Analytics</CardTitle><CardDescription>Monthly lead acquisition trajectory</CardDescription></div>
                        <div className="flex items-center gap-2">
                          <Select value={dailyActivityCampaignFilter} onValueChange={setDailyActivityCampaignFilter}>
                            <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Filter by Campaign" /></SelectTrigger>
                            <SelectContent><SelectItem value="all">All Campaigns</SelectItem>{campaigns.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
                          </Select>
                          <Select 
                            value={selectedChartYear.toString()} 
                            onValueChange={(v) => setSelectedChartYear(parseInt(v))}
                          >
                            <SelectTrigger className="w-[100px] h-8 text-xs">
                              <SelectValue placeholder="Year" />
                            </SelectTrigger>
                            <SelectContent>
                              {[2024, 2025, 2026].map(y => (
                                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </CardHeader>
                      <CardContent className="h-80">{growthAnalyticsHasData ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={growthAnalyticsData}><defs><linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.6}/><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.3} /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} /><RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} /><Area type="monotone" dataKey="leads" stroke="hsl(var(--primary))" strokeWidth={5} fillOpacity={1} fill="url(#colorGrowth)" animationDuration={2000} strokeLinecap="round" /></AreaChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-muted-foreground">No data yet</div>}</CardContent>
                    </Card>
                  </div>

                  <Card className="hover-elevate shadow-lg border-primary/10 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between gap-4">
                      <div><CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" />Daily Call Activity</CardTitle><CardDescription>AI Call attempts per day</CardDescription></div>
                      <Select value={callActivityCampaignFilter} onValueChange={setCallActivityCampaignFilter}>
                        <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Filter by Campaign" /></SelectTrigger>
                        <SelectContent><SelectItem value="all">All Campaigns</SelectItem>{campaigns.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select 
                        value={selectedChartMonth.toString()} 
                        onValueChange={(v) => setSelectedChartMonth(parseInt(v))}
                      >
                        <SelectTrigger className="w-[110px] h-8 text-xs">
                          <SelectValue placeholder="Month" />
                        </SelectTrigger>
                        <SelectContent>
                          {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
                            <SelectItem key={m} value={i.toString()}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select 
                        value={selectedChartYear.toString()} 
                        onValueChange={(v) => setSelectedChartYear(parseInt(v))}
                      >
                        <SelectTrigger className="w-[100px] h-8 text-xs">
                          <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent>
                          {[2024, 2025, 2026].map(y => (
                            <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardHeader>
                    <CardContent className="h-80"><ResponsiveContainer width="100%" height="100%"><LineChart data={dailyCallActivityData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.3} /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} interval="preserveStartEnd" /><YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} allowDecimals={false} /><RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} /><Line type="monotone" dataKey="calls" stroke="hsl(var(--primary))" strokeWidth={4} dot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "hsl(var(--background))" }} /></LineChart></ResponsiveContainer></CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div><CardTitle>Notes</CardTitle><CardDescription>All your saved notes</CardDescription></div>
                      <Dialog open={isAddNoteOpen} onOpenChange={setIsAddNoteOpen}>
                        <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Add Note</Button></DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                          <DialogHeader><DialogTitle>Add Note</DialogTitle></DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2"><Label htmlFor="note-title">Title</Label><Input id="note-title" placeholder="Note title" value={noteForm.title} onChange={(e) => setNoteForm({...noteForm, title: e.target.value})} data-testid="input-note-title" /></div>
                            <div className="space-y-2"><Label htmlFor="note-content">Content</Label><Textarea id="note-content" placeholder="Note content" className="min-h-32" value={noteForm.content} onChange={(e) => setNoteForm({...noteForm, content: e.target.value})} data-testid="input-note-content" /></div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => { setIsAddNoteOpen(false); setNoteForm({title: "", content: ""}); }} data-testid="button-cancel">Cancel</Button>
                            <Button onClick={async () => { if (noteForm.title.trim() && noteForm.content.trim()) { const newNote = await notesApi.create(noteForm); setNotes([newNote, ...notes]); setNoteForm({title: "", content: ""}); setIsAddNoteOpen(false); toast({title: "Success", description: "Note added successfully"}); } }} data-testid="button-add-note">Add Note</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {notes.length > 0 ? (
                          notes.map((note) => (
                            <div key={note._id} className="p-3 border rounded-md bg-muted/30 hover:bg-muted/50 transition-colors" data-testid={`card-note-${note._id}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0"><h4 className="font-medium text-sm">{note.title}</h4><p className="text-sm text-muted-foreground mt-1 line-clamp-2">{note.content}</p><p className="text-xs text-muted-foreground mt-2">{new Date(note.createdAt).toLocaleDateString()}</p></div>
                                <div className="flex gap-1">
                                  <Dialog open={isEditNoteOpen && selectedNote?._id === note._id} onOpenChange={(open) => { if (!open) { setSelectedNote(null); setNoteForm({title: "", content: ""}); } setIsEditNoteOpen(open); }}>
                                    <DialogTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setSelectedNote(note); setNoteForm({title: note.title, content: note.content}); }} data-testid={`button-edit-note-${note._id}`}><Edit3 className="h-4 w-4" /></Button></DialogTrigger>
                                    <DialogContent className="sm:max-w-[500px]">
                                      <DialogHeader><DialogTitle>Edit Note</DialogTitle></DialogHeader>
                                      <div className="space-y-4">
                                        <div className="space-y-2"><Label htmlFor="edit-note-title">Title</Label><Input id="edit-note-title" placeholder="Note title" value={noteForm.title} onChange={(e) => setNoteForm({...noteForm, title: e.target.value})} /></div>
                                        <div className="space-y-2"><Label htmlFor="edit-note-content">Content</Label><Textarea id="edit-note-content" placeholder="Note content" className="min-h-32" value={noteForm.content} onChange={(e) => setNoteForm({...noteForm, content: e.target.value})} /></div>
                                      </div>
                                    <DialogFooter><Button variant="outline" onClick={() => { setIsEditNoteOpen(false); setSelectedNote(null); setNoteForm({title: "", content: ""}); }}>Cancel</Button><Button onClick={async () => { if (selectedNote && noteForm.title.trim() && noteForm.content.trim()) { const updated = await notesApi.update(selectedNote._id, noteForm); setNotes(notes.map(n => n._id === (selectedNote as any)._id ? updated : n)); setNoteForm({title: "", content: ""}); setIsEditNoteOpen(false); setSelectedNote(null); toast({title: "Success", description: "Note updated successfully"}); } }}>Update Note</Button></DialogFooter>
                                    </DialogContent>
                                  </Dialog>
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={async () => { if (confirm("Delete this note?")) { await notesApi.delete(note._id); setNotes(notes.filter(n => n._id !== note._id)); toast({title: "Success", description: "Note deleted"}); } }} data-testid={`button-delete-note-${note._id}`}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : <div className="text-center py-6 text-muted-foreground text-sm">No notes found.</div>}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Credit Usage Daily Chart */}
                  <Card className="hover-elevate mt-6">
                    <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
                      <div>
                        <CardTitle className="text-base font-semibold">Daily Credit Usage</CardTitle>
                        <CardDescription>Daily credit consumption for Calls, SMS, and WhatsApp</CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select value={creditUsageCampaignFilter} onValueChange={setCreditUsageCampaignFilter}>
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue placeholder="Campaign" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Campaigns</SelectItem>
                            {campaigns.map(c => (
                              <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={creditUsageMonthFilter.toString()} onValueChange={(v) => setCreditUsageMonthFilter(parseInt(v))}>
                          <SelectTrigger className="w-[110px] h-8 text-xs">
                            <SelectValue placeholder="Month" />
                          </SelectTrigger>
                          <SelectContent>
                            {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
                              <SelectItem key={m} value={i.toString()}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={creditUsageYearFilter.toString()} onValueChange={(v) => setCreditUsageYearFilter(parseInt(v))}>
                          <SelectTrigger className="w-[90px] h-8 text-xs">
                            <SelectValue placeholder="Year" />
                          </SelectTrigger>
                          <SelectContent>
                            {[2024, 2025, 2026].map(y => (
                              <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardHeader>
                    <CardContent className="h-[300px] mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={creditUsageData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === "dark" ? "#333" : "#eee"} />
                          <XAxis 
                            dataKey="date" 
                            fontSize={11} 
                            tickLine={false} 
                            axisLine={false} 
                            tick={{ fill: "hsl(var(--muted-foreground))" }}
                          />
                          <YAxis 
                            fontSize={11} 
                            tickLine={false} 
                            axisLine={false} 
                            tick={{ fill: "hsl(var(--muted-foreground))" }}
                          />
                          <RechartsTooltip 
                            contentStyle={{ 
                              backgroundColor: "hsl(var(--card))", 
                              borderColor: "hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: "12px"
                            }}
                          />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                          <Line 
                            type="monotone" 
                            dataKey="call" 
                            name="Calls"
                            stroke="#f97316" 
                            strokeWidth={2} 
                            dot={{ r: 3, fill: "#f97316" }} 
                            activeDot={{ r: 5 }} 
                          />
                          <Line 
                            type="monotone" 
                            dataKey="sms" 
                            name="SMS"
                            stroke="#3b82f6" 
                            strokeWidth={2} 
                            dot={{ r: 3, fill: "#3b82f6" }} 
                            activeDot={{ r: 5 }} 
                          />
                          <Line 
                            type="monotone" 
                            dataKey="whatsapp" 
                            name="WhatsApp"
                            stroke="#22c55e" 
                            strokeWidth={2} 
                            dot={{ r: 3, fill: "#22c55e" }} 
                            activeDot={{ r: 5 }} 
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  </>)}
                </>
              )}
            </div>
          )}

          {activeTab === "callhistory" && !isAdmin && (
            <FeatureGate featureKey="call_history">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Call History</h1>
              </div>

              <div className="flex flex-wrap items-center gap-4 bg-muted/20 p-4 rounded-lg border border-border/50">
                <div className="relative min-w-[240px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search name or phone..." 
                    className="pl-9 h-9" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                  <SelectTrigger className="w-[200px] h-9">
                    <SelectValue placeholder="All Campaigns" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Campaigns</SelectItem>
                    {campaigns.map(c => (
                      <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2 h-9">
                  <Input 
                    type="date" 
                    className="h-9 w-[150px]"
                    value={dateRange.start} 
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  />
                  <span className="text-muted-foreground">→</span>
                  <Input 
                    type="date" 
                    className="h-9 w-[150px]"
                    value={dateRange.end} 
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  />
                </div>
              </div>

              <Card className="hover-elevate">
                <CardHeader>
                  <CardTitle>Call Records</CardTitle>
                  <CardDescription>Logs of all AI agent calling activity.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead Name</TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Call Date & Time</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Recording</TableHead>
                        <TableHead className="text-right">Call</TableHead>
                        <TableHead className="text-right">SMS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leads.flatMap(lead => {
                        const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) || lead.phone.includes(searchTerm);
                        const matchesCampaign = campaignFilter === "all" || lead.campaignId === campaignFilter;
                        
                        return (lead.history || [])
                          .filter(h => {
                            if (h.type !== 'call') return false;
                            if (!matchesSearch || !matchesCampaign) return false;
                            
                            if (dateRange.start || dateRange.end) {
                              const contactDate = new Date(h.date);
                              if (dateRange.start && contactDate < new Date(dateRange.start)) return false;
                              if (dateRange.end && contactDate > new Date(dateRange.end)) return false;
                            }
                            return true;
                          })
                          .map((history, idx) => (
                            <TableRow key={`${lead._id}-${idx}`}>
                              <TableCell className="font-medium">{lead.name}</TableCell>
                              <TableCell>{lead.campaignName ? <Badge variant="secondary">{lead.campaignName}</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                              <TableCell className="text-sm">{new Date(history.date).toLocaleString()}</TableCell>
                              <TableCell><Badge variant="outline">{history.outcome}</Badge></TableCell>
                              <TableCell className="text-sm">{history.duration}</TableCell>
                              <TableCell>{(() => {
                                const url = findRecordingUrl(lead._id, history.date);
                                if (!url) return <Button size="sm" variant="ghost" disabled title="No recording available" className="opacity-40"><Play className="h-4 w-4 mr-1" />Play</Button>;
                                if (playingRecordingUrl === url) return (
                                  <div className="flex items-center gap-1">
                                    <audio src={url} controls autoPlay className="h-8 w-44" onEnded={() => setPlayingRecordingUrl(null)} />
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" title="Close player" onClick={() => setPlayingRecordingUrl(null)}><X className="h-3 w-3" /></Button>
                                  </div>
                                );
                                return <Button size="sm" variant="ghost" onClick={() => setPlayingRecordingUrl(url)}><Play className="h-4 w-4 mr-1" />Play</Button>;
                              })()}</TableCell>
                              <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setCallConfirm({ leadId: lead._id, type: "call" }); }}><Phone className="h-4 w-4" /></Button></TableCell>
                              <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setCallConfirm({ leadId: lead._id, type: "sms" }); }}><MessageSquare className="h-4 w-4" /></Button></TableCell>
                            </TableRow>
                          ));
                      })}
                      {leads.flatMap(lead => (lead.history || []).filter(h => h.type === 'call')).length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No call history yet.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
            </FeatureGate>
          )}

          {activeTab === "crm" && !isAdmin && (
             <FeatureGate featureKey="crm">
             <div className="space-y-6">
               <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Lead CRM</h1>
                <div className="flex gap-2">
                  <input
                    ref={csvImportRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleCsvImport}
                  />
                  <Button variant="outline" onClick={() => csvImportRef.current?.click()}>Import CSV</Button>
                  <Dialog open={isAddLeadOpen} onOpenChange={setIsAddLeadOpen}>
                    <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Add Lead</Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Add New Lead</DialogTitle><DialogDescription>Enter the details of the new prospect.</DialogDescription></DialogHeader>
                      <form onSubmit={handleAddLead} className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2"><Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label><Input id="name" placeholder="John Doe" value={newLead.name} onChange={e => setNewLead({...newLead, name: e.target.value})} className={leadErrors.name ? "border-destructive" : ""} />{leadErrors.name && <p className="text-xs text-destructive">{leadErrors.name}</p>}</div>
                          <div className="space-y-2"><Label htmlFor="company">Company</Label><Input id="company" placeholder="Acme Inc" value={newLead.company} onChange={e => setNewLead({...newLead, company: e.target.value})} /></div>
                        </div>
                        <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" placeholder="john@example.com" value={newLead.email} onChange={e => setNewLead({...newLead, email: e.target.value})} className={leadErrors.email ? "border-destructive" : ""} />{leadErrors.email && <p className="text-xs text-destructive">{leadErrors.email}</p>}</div>
                        <div className="space-y-2"><Label htmlFor="phone">Phone Number <span className="text-destructive">*</span></Label><Input id="phone" placeholder="+1 (555) 000-0000" value={newLead.phone} onChange={e => setNewLead({...newLead, phone: e.target.value})} className={leadErrors.phone ? "border-destructive" : ""} />{leadErrors.phone && <p className="text-xs text-destructive">{leadErrors.phone}</p>}</div>
                        <div className="space-y-2"><Label htmlFor="notes">Initial Notes</Label><Textarea id="notes" placeholder="Any specific details..." value={newLead.notes} onChange={e => setNewLead({...newLead, notes: e.target.value})} /></div>
                        <div className="space-y-2"><Label htmlFor="campaign">Associated Campaign</Label><Select value={newLead.campaignId} onValueChange={(value) => setNewLead({...newLead, campaignId: value})}><SelectTrigger><SelectValue placeholder="Select a campaign (optional)" /></SelectTrigger><SelectContent><SelectItem value="none">No Campaign</SelectItem>{campaigns.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                        <DialogFooter><Button type="submit" disabled={isSaving}>{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Add Lead</Button></DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>

                  {/* Edit Lead Dialog */}
                  <Dialog open={isEditLeadOpen} onOpenChange={setIsEditLeadOpen}>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Edit Lead</DialogTitle><DialogDescription>Update the details of the prospect.</DialogDescription></DialogHeader>
                      <form onSubmit={handleUpdateLead} className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2"><Label htmlFor="edit-name">Full Name <span className="text-destructive">*</span></Label><Input id="edit-name" placeholder="John Doe" value={editLead.name} onChange={e => setEditLead({...editLead, name: e.target.value})} className={leadErrors.name ? "border-destructive" : ""} />{leadErrors.name && <p className="text-xs text-destructive">{leadErrors.name}</p>}</div>
                          <div className="space-y-2"><Label htmlFor="edit-company">Company</Label><Input id="edit-company" placeholder="Acme Inc" value={editLead.company} onChange={e => setEditLead({...editLead, company: e.target.value})} /></div>
                        </div>
                        <div className="space-y-2"><Label htmlFor="edit-email">Email</Label><Input id="edit-email" type="email" placeholder="john@example.com" value={editLead.email} onChange={e => setEditLead({...editLead, email: e.target.value})} className={leadErrors.email ? "border-destructive" : ""} />{leadErrors.email && <p className="text-xs text-destructive">{leadErrors.email}</p>}</div>
                        <div className="space-y-2"><Label htmlFor="edit-phone">Phone Number <span className="text-destructive">*</span></Label><Input id="edit-phone" placeholder="+1 (555) 000-0000" value={editLead.phone} onChange={e => setEditLead({...editLead, phone: e.target.value})} className={leadErrors.phone ? "border-destructive" : ""} />{leadErrors.phone && <p className="text-xs text-destructive">{leadErrors.phone}</p>}</div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-status">Status</Label>
                          <Select value={editLead.status} onValueChange={(value: any) => setEditLead({...editLead, status: value})}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="New">New</SelectItem>
                              <SelectItem value="In Progress">In Progress</SelectItem>
                              <SelectItem value="Interested">Interested</SelectItem>
                              <SelectItem value="Follow Up">Follow Up</SelectItem>
                              <SelectItem value="Closed">Closed</SelectItem>
                              <SelectItem value="Unqualified">Unqualified</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2"><Label htmlFor="edit-notes">Notes</Label><Textarea id="edit-notes" placeholder="Update notes..." value={editLead.notes} onChange={e => setEditLead({...editLead, notes: e.target.value})} /></div>
                        <div className="space-y-2"><Label htmlFor="edit-campaign">Associated Campaign</Label><Select value={editLead.campaignId} onValueChange={(value) => setEditLead({...editLead, campaignId: value})}><SelectTrigger><SelectValue placeholder="Select a campaign (optional)" /></SelectTrigger><SelectContent><SelectItem value="none">No Campaign</SelectItem>{campaigns.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setIsEditLeadOpen(false)}>Cancel</Button>
                          <Button type="submit" disabled={isSaving}>{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Update Lead</Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              <Card className="hover-elevate">
                <CardHeader>
                  <div className="flex flex-col space-y-4">
                    <div className="flex items-center justify-between"><div><CardTitle>Manage Leads</CardTitle><CardDescription>View and filter all your campaign leads.</CardDescription></div></div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search name, phone, email..." className="pl-9 h-9" value={campaignSearch} onChange={(e) => setCampaignSearch(e.target.value)} /></div>
                      <div className="flex items-center gap-2"><Select value={leadCampaignFilter} onValueChange={setLeadCampaignFilter}><SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="All Campaigns" /></SelectTrigger><SelectContent><SelectItem value="all">All Campaigns</SelectItem><SelectItem value="none">No Campaign</SelectItem>{campaigns.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                      <div className="flex items-center gap-2 bg-muted/20 p-1 rounded-md border border-border/50 h-9"><CalendarDays className="h-4 w-4 text-muted-foreground ml-2" /><Input type="date" className="h-7 w-[130px] text-xs border-none bg-transparent focus-visible:ring-0" /><span className="text-muted-foreground text-xs">→</span><Input type="date" className="h-7 w-[130px] text-xs border-none bg-transparent focus-visible:ring-0" /></div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Company</TableHead><TableHead>Campaign</TableHead><TableHead>Status</TableHead><TableHead>Score</TableHead><TableHead>Last Interaction</TableHead><TableHead className="text-right">Call</TableHead><TableHead className="text-right">SMS</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {leads.filter(lead => { const searchLower = campaignSearch.toLowerCase(); const matchesSearch = !campaignSearch || lead.name.toLowerCase().includes(searchLower) || (lead.company || "").toLowerCase().includes(searchLower) || (lead.phone || "").toLowerCase().includes(searchLower) || (lead.email || "").toLowerCase().includes(searchLower) || (lead.status || "").toLowerCase().includes(searchLower) || (lead.campaignName || "").toLowerCase().includes(searchLower); if (!matchesSearch) return false; if (leadCampaignFilter === "all") return true; if (leadCampaignFilter === "none") return !lead.campaignId; return lead.campaignId === leadCampaignFilter; }).map((lead) => (
                        <TableRow key={lead._id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewLead(lead)}>
                          <TableCell className="font-medium">{lead.name}</TableCell><TableCell>{lead.company || "-"}</TableCell><TableCell>{lead.campaignName ? <Badge variant="secondary">{lead.campaignName}</Badge> : <span className="text-muted-foreground">-</span>}</TableCell><TableCell><Badge variant="outline">{lead.status}</Badge></TableCell><TableCell>{(() => { const s = leadScore(lead); return <Badge variant={leadScoreVariant(s)} className={leadScoreClass(s)}>{s}</Badge>; })()}</TableCell><TableCell className="text-muted-foreground">{formatTimeAgo(lead.lastContact)}</TableCell>
                          <TableCell className="text-right"><Button size="sm" variant="ghost" data-testid={`button-call-${lead._id}`} onClick={(e) => { e.stopPropagation(); setCallConfirm({ leadId: lead._id, type: "call" }); }}><Phone className="h-4 w-4" /></Button></TableCell>
                          <TableCell className="text-right"><Button size="sm" variant="ghost" data-testid={`button-sms-${lead._id}`} onClick={(e) => { e.stopPropagation(); setCallConfirm({ leadId: lead._id, type: "sms" }); }}><MessageSquare className="h-4 w-4" /></Button></TableCell>
                          <TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" data-testid={`button-actions-${lead._id}`} onClick={(e) => e.stopPropagation()}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewLead(lead); }}>View Details</DropdownMenuItem><DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditLead(lead); }}>Edit Lead</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={(e) => { e.stopPropagation(); confirmDeleteLead(lead); }} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell>
                        </TableRow>
                      ))}
                      {leads.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No leads yet. Add your first lead to get started.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
             </div>
          )}

          {/* Campaign Creation Dialog */}
          <Dialog open={isCreateCampaignOpen} onOpenChange={setIsCreateCampaignOpen}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Campaign</DialogTitle>
                <DialogDescription>Set up your AI calling agent with a goal and script.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateCampaign} className="space-y-6 py-4">
                <Tabs value={campaignTab} onValueChange={setCampaignTab}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="basics">Basics & Goal</TabsTrigger>
                    <TabsTrigger value="agent">AI Agent & Script</TabsTrigger>
                    <TabsTrigger value="config">Configuration</TabsTrigger>
                  </TabsList>
                  <TabsContent value="basics" className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="campaign-name">Campaign Name <span className="text-destructive">*</span></Label>
                      <Input id="campaign-name" placeholder="Summer Real Estate Leads" value={newCampaign.name} onChange={e => setNewCampaign({...newCampaign, name: e.target.value})} className={campaignErrors.name ? "border-destructive" : ""} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Campaign Goal</Label>
                        <Select value={newCampaign.goal} onValueChange={(v: any) => setNewCampaign({...newCampaign, goal: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sales">Outbound Sales</SelectItem>
                            <SelectItem value="support">Customer Support</SelectItem>
                            <SelectItem value="survey">Market Survey</SelectItem>
                            <SelectItem value="appointment">Appointment Setting</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Voice Preference</Label>
                        <Select value={newCampaign.voice} onValueChange={v => setNewCampaign({...newCampaign, voice: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Rachel (American)">Rachel (American)</SelectItem>
                            <SelectItem value="Drew (Professional)">Drew (Professional)</SelectItem>
                            <SelectItem value="Clyde (Friendly)">Clyde (Friendly)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Start Date</Label>
                        <Input type="date" value={newCampaign.startDate} onChange={e => setNewCampaign({...newCampaign, startDate: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <Label>End Date</Label>
                        <Input type="date" value={newCampaign.endDate} onChange={e => setNewCampaign({...newCampaign, endDate: e.target.value})} />
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="agent" className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>AI Calling Script <span className="text-destructive">*</span></Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleGenerateScript}
                          disabled={isGeneratingScript}
                          data-testid="button-generate-script"
                          className="gap-2 text-xs"
                        >
                          {isGeneratingScript ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <BrainCircuit className="h-3 w-3" />
                          )}
                          {isGeneratingScript ? "Generating..." : "Generate with AI"}
                        </Button>
                      </div>
                      <Textarea placeholder="Hi, I'm calling from... [Use {name} for personalization]" className="min-h-[150px]" value={newCampaign.script} onChange={e => setNewCampaign({...newCampaign, script: e.target.value})} data-testid="input-campaign-script" />
                      <p className="text-xs text-muted-foreground">Use variables like {'{name}'}, {'{company}'} to personalize the AI conversation.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Additional Context</Label>
                      <Textarea placeholder="Information the AI should know about your business, common FAQs, etc." value={newCampaign.additionalContext} onChange={e => setNewCampaign({...newCampaign, additionalContext: e.target.value})} />
                    </div>
                  </TabsContent>
                  <TabsContent value="config" className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Daily Call Limit</Label>
                        <Input type="number" placeholder="500" />
                      </div>
                      <div className="space-y-2">
                        <Label>Calling Hours</Label>
                        <div className="flex items-center gap-2">
                          <Input type="time" value={newCampaign.callingHours.start} onChange={e => setNewCampaign({...newCampaign, callingHours: {...newCampaign.callingHours, start: e.target.value}})} />
                          <span>to</span>
                          <Input type="time" value={newCampaign.callingHours.end} onChange={e => setNewCampaign({...newCampaign, callingHours: {...newCampaign.callingHours, end: e.target.value}})} />
                        </div>
                        {campaignErrors.callingHours && <p className="text-xs text-destructive">{campaignErrors.callingHours}</p>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Knowledge Base Files</Label>
                      <div 
                        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => document.getElementById('campaign-upload')?.click()}
                      >
                        <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          {isUploading ? "Uploading..." : "Click to upload or drag and drop PDFs, TXT, or DOCX files"}
                        </p>
                        <input 
                          id="campaign-upload"
                          type="file" 
                          multiple 
                          className="hidden" 
                          onChange={(e) => handleFileUpload(e, false)}
                          accept=".pdf,.txt,.docx"
                        />
                      </div>
                      {newCampaign.knowledgeBaseFiles.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {newCampaign.knowledgeBaseFiles.map((file, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-muted/30 rounded-md border text-xs">
                              <span className="truncate max-w-[200px]">{file.name}</span>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6" 
                                onClick={() => setNewCampaign(prev => ({
                                  ...prev,
                                  knowledgeBaseFiles: prev.knowledgeBaseFiles.filter((_, i) => i !== idx)
                                }))}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
                <DialogFooter className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateCampaignOpen(false)} data-testid="button-cancel-campaign">Cancel</Button>
                  {campaignTab === "basics" ? (
                    <Button type="button" onClick={(e) => { e.preventDefault(); setCampaignTab("agent"); }} data-testid="button-next-agent">Next: Configure Agent</Button>
                  ) : campaignTab === "agent" ? (
                    <Button type="button" onClick={(e) => { e.preventDefault(); setCampaignTab("config"); }} data-testid="button-next-config">Next: Configuration</Button>
                  ) : (
                    <Button type="submit" disabled={isSaving} data-testid="button-submit-campaign">
                      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      Create Campaign
                    </Button>
                  )}
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Edit Campaign Dialog */}
          <Dialog open={isEditCampaignOpen} onOpenChange={setIsEditCampaignOpen}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Campaign</DialogTitle>
                <DialogDescription>Update your campaign settings and agent script.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpdateCampaign} className="space-y-6 py-4">
                <Tabs defaultValue="basics">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="basics">Basics & Goal</TabsTrigger>
                    <TabsTrigger value="agent">AI Agent & Script</TabsTrigger>
                    <TabsTrigger value="config">Configuration</TabsTrigger>
                  </TabsList>
                  <TabsContent value="basics" className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-campaign-name">Campaign Name</Label>
                      <Input id="edit-campaign-name" value={editCampaignForm.name} onChange={e => setEditCampaignForm({...editCampaignForm, name: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={editCampaignForm.status} onValueChange={(v: any) => setEditCampaignForm({...editCampaignForm, status: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Active">Active</SelectItem>
                            <SelectItem value="Paused">Paused</SelectItem>
                            <SelectItem value="Draft">Draft</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Goal</Label>
                        <Select value={editCampaignForm.goal} onValueChange={(v: any) => setEditCampaignForm({...editCampaignForm, goal: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sales">Outbound Sales</SelectItem>
                            <SelectItem value="support">Customer Support</SelectItem>
                            <SelectItem value="survey">Market Survey</SelectItem>
                            <SelectItem value="appointment">Appointment Setting</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Start Date</Label>
                        <Input type="date" value={editCampaignForm.startDate} onChange={e => setEditCampaignForm({...editCampaignForm, startDate: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <Label>End Date</Label>
                        <Input type="date" value={editCampaignForm.endDate} onChange={e => setEditCampaignForm({...editCampaignForm, endDate: e.target.value})} />
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="agent" className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Voice Preference</Label>
                      <Select value={editCampaignForm.voice} onValueChange={v => setEditCampaignForm({...editCampaignForm, voice: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Rachel (American)">Rachel (American)</SelectItem>
                          <SelectItem value="Drew (Professional)">Drew (Professional)</SelectItem>
                          <SelectItem value="Clyde (Friendly)">Clyde (Friendly)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Script</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleGenerateEditScript}
                          disabled={isGeneratingEditScript}
                          data-testid="button-generate-edit-script"
                          className="gap-2 text-xs"
                        >
                          {isGeneratingEditScript ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <BrainCircuit className="h-3 w-3" />
                          )}
                          {isGeneratingEditScript ? "Generating..." : "Generate with AI"}
                        </Button>
                      </div>
                      <Textarea className="min-h-[150px]" value={editCampaignForm.script} onChange={e => setEditCampaignForm({...editCampaignForm, script: e.target.value})} data-testid="input-edit-campaign-script" />
                    </div>
                    <div className="space-y-2">
                      <Label>Additional Context</Label>
                      <Textarea placeholder="Information the AI should know..." value={editCampaignForm.additionalContext} onChange={e => setEditCampaignForm({...editCampaignForm, additionalContext: e.target.value})} />
                    </div>
                  </TabsContent>
                  <TabsContent value="config" className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Calling Hours</Label>
                      <div className="flex items-center gap-2">
                        <Input type="time" value={editCampaignForm.callingHours.start} onChange={e => setEditCampaignForm({...editCampaignForm, callingHours: {...editCampaignForm.callingHours, start: e.target.value}})} />
                        <span>to</span>
                        <Input type="time" value={editCampaignForm.callingHours.end} onChange={e => setEditCampaignForm({...editCampaignForm, callingHours: {...editCampaignForm.callingHours, end: e.target.value}})} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Knowledge Base Files</Label>
                      <div 
                        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => document.getElementById('edit-campaign-upload')?.click()}
                      >
                        <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          {isUploading ? "Uploading..." : "Click to upload or drag and drop PDFs, TXT, or DOCX files"}
                        </p>
                        <input 
                          id="edit-campaign-upload"
                          type="file" 
                          multiple 
                          className="hidden" 
                          onChange={(e) => handleFileUpload(e, true)}
                          accept=".pdf,.txt,.docx"
                        />
                      </div>
                      {editCampaignForm.knowledgeBaseFiles.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {editCampaignForm.knowledgeBaseFiles.map((file, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-muted/30 rounded-md border text-xs">
                              <span className="truncate max-w-[200px]">{file.name}</span>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6" 
                                onClick={() => setEditCampaignForm(prev => ({
                                  ...prev,
                                  knowledgeBaseFiles: prev.knowledgeBaseFiles.filter((_, i) => i !== idx)
                                }))}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsEditCampaignOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isSaving}>Update Campaign</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Lead Details Sheet */}
          <Sheet open={isLeadDetailsOpen} onOpenChange={setIsLeadDetailsOpen}>
            <SheetContent className="sm:max-w-xl w-full overflow-y-auto p-0 flex flex-col gap-0">
              {selectedLead && (
                <>
                  <div className="p-6 border-b bg-muted/10">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-16 w-16 border-2 border-background shadow-sm"><AvatarFallback className="text-xl bg-primary/10 text-primary">{selectedLead.name.charAt(0)}</AvatarFallback></Avatar>
                      <div className="flex-1"><h3 className="text-2xl font-bold tracking-tight">{selectedLead.name}</h3><p className="text-muted-foreground text-sm font-medium">{selectedLead.company}</p><div className="flex items-center gap-2 mt-2"><Badge variant={selectedLead.status === 'Interested' ? 'default' : 'secondary'}>{selectedLead.status}</Badge>{selectedLead.outcome === "Meeting Booked" && <Badge variant="outline" className="border-green-500 text-green-600 bg-green-500/10">Meeting Booked</Badge>}</div></div>
                      <div className="flex flex-col gap-2"><Button size="sm"><Phone className="mr-2 h-4 w-4" /> Call</Button><Button size="sm" variant="outline"><MessageSquare className="mr-2 h-4 w-4" /> SMS</Button><Button size="sm" variant="ghost" onClick={() => { setIsLeadDetailsOpen(false); handleEditLead(selectedLead); }}><Settings className="mr-2 h-4 w-4" /> Edit</Button></div>
                    </div>
                  </div>
                  <Tabs defaultValue="overview" className="flex-1 flex flex-col">
                    <div className="px-6 border-b bg-muted/5"><TabsList className="w-full justify-start h-12 bg-transparent p-0 gap-6"><TabsTrigger value="overview" className="rounded-none px-0 h-full">Overview</TabsTrigger><TabsTrigger value="activity" className="rounded-none px-0 h-full">Activity & Logs</TabsTrigger><TabsTrigger value="schedule" className="rounded-none px-0 h-full">Schedule</TabsTrigger></TabsList></div>
                    <ScrollArea className="flex-1"><div className="p-6">
                      <TabsContent value="overview" className="mt-0 space-y-6">
                        {/* Credit Usage Daily Chart */}
                        <Card className="hover-elevate">
                          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
                            <div>
                              <CardTitle className="text-base font-semibold">Daily Credit Usage</CardTitle>
                              <CardDescription>Daily credit consumption for Calls, SMS, and WhatsApp</CardDescription>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Select value={creditUsageCampaignFilter} onValueChange={setCreditUsageCampaignFilter}>
                                <SelectTrigger className="w-[140px] h-8 text-xs">
                                  <SelectValue placeholder="Campaign" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Campaigns</SelectItem>
                                  {campaigns.map(c => (
                                    <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select value={creditUsageMonthFilter.toString()} onValueChange={(v) => setCreditUsageMonthFilter(parseInt(v))}>
                                <SelectTrigger className="w-[110px] h-8 text-xs">
                                  <SelectValue placeholder="Month" />
                                </SelectTrigger>
                                <SelectContent>
                                  {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
                                    <SelectItem key={m} value={i.toString()}>{m}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select value={creditUsageYearFilter.toString()} onValueChange={(v) => setCreditUsageYearFilter(parseInt(v))}>
                                <SelectTrigger className="w-[90px] h-8 text-xs">
                                  <SelectValue placeholder="Year" />
                                </SelectTrigger>
                                <SelectContent>
                                  {[2024, 2025, 2026].map(y => (
                                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </CardHeader>
                          <CardContent className="h-[300px] mt-2">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={creditUsageData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === "dark" ? "#333" : "#eee"} />
                                <XAxis 
                                  dataKey="date" 
                                  fontSize={11} 
                                  tickLine={false} 
                                  axisLine={false} 
                                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                                />
                                <YAxis 
                                  fontSize={11} 
                                  tickLine={false} 
                                  axisLine={false} 
                                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                                />
                                <RechartsTooltip 
                                  contentStyle={{ 
                                    backgroundColor: "hsl(var(--card))", 
                                    borderColor: "hsl(var(--border))",
                                    borderRadius: "8px",
                                    fontSize: "12px"
                                  }}
                                />
                                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                <Line 
                                  type="monotone" 
                                  dataKey="call" 
                                  name="Calls"
                                  stroke="#f97316" 
                                  strokeWidth={2} 
                                  dot={{ r: 3, fill: "#f97316" }} 
                                  activeDot={{ r: 5 }} 
                                />
                                <Line 
                                  type="monotone" 
                                  dataKey="sms" 
                                  name="SMS"
                                  stroke="#3b82f6" 
                                  strokeWidth={2} 
                                  dot={{ r: 3, fill: "#3b82f6" }} 
                                  activeDot={{ r: 5 }} 
                                />
                                <Line 
                                  type="monotone" 
                                  dataKey="whatsapp" 
                                  name="WhatsApp"
                                  stroke="#22c55e" 
                                  strokeWidth={2} 
                                  dot={{ r: 3, fill: "#22c55e" }} 
                                  activeDot={{ r: 5 }} 
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>

                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-1"><Label className="text-xs text-muted-foreground uppercase tracking-wider">Email</Label><div className="flex items-center gap-2 font-medium"><Mail className="h-4 w-4 text-muted-foreground" />{selectedLead.email || "N/A"}</div></div>
                          <div className="space-y-1"><Label className="text-xs text-muted-foreground uppercase tracking-wider">Phone</Label><div className="flex items-center gap-2 font-medium"><Phone className="h-4 w-4 text-muted-foreground" />{selectedLead.phone}</div></div>
                          <div className="space-y-1"><Label className="text-xs text-muted-foreground uppercase tracking-wider">Last Contact</Label><div className="flex items-center gap-2 font-medium"><History className="h-4 w-4 text-muted-foreground" />{formatTimeAgo(selectedLead.lastContact)}</div></div>
                          <div className="space-y-1"><Label className="text-xs text-muted-foreground uppercase tracking-wider">Pipeline Stage</Label><div className="flex items-center gap-2 font-medium"><BarChart className="h-4 w-4 text-muted-foreground" />{selectedLead.outcome}</div></div>
                          <div className="space-y-1"><Label className="text-xs text-muted-foreground uppercase tracking-wider">Campaign</Label><div className="flex items-center gap-2 font-medium"><Megaphone className="h-4 w-4 text-muted-foreground" />{selectedLead.campaignName || "Not assigned"}</div></div>
                          <div className="space-y-1"><Label className="text-xs text-muted-foreground uppercase tracking-wider">Company</Label><div className="flex items-center gap-2 font-medium"><Building className="h-4 w-4 text-muted-foreground" />{selectedLead.company || "N/A"}</div></div>
                        </div>
                        <div className="space-y-2"><Label className="flex items-center gap-2"><FileText className="h-4 w-4" /> Notes</Label><div className="bg-muted/50 p-4 rounded-md text-sm leading-relaxed border">{selectedLead.notes || "No notes available."}</div></div>
                      </TabsContent>
                      <TabsContent value="activity" className="mt-0 space-y-6">
                        <div className="flex items-center justify-between mb-4"><h4 className="font-semibold">Interaction History</h4><Button size="sm" variant="outline" onClick={() => setIsLogActivityOpen(true)}><Plus className="h-3 w-3 mr-1" /> Log Activity</Button></div>
                        <div className="space-y-6 relative pl-6 border-l-2 border-muted">{(selectedLead.history || []).map((item, i) => (<div key={i} className="relative"><div className="absolute -left-[31px] top-0 h-8 w-8 rounded-full bg-background border-2 border-muted flex items-center justify-center">{item.type === 'call' ? <Phone className="h-4 w-4 text-primary" /> : item.type === 'email' ? <Mail className="h-4 w-4 text-blue-500" /> : <FileText className="h-4 w-4 text-orange-500" />}</div><div className="bg-card border rounded-lg p-4 shadow-sm"><div className="flex justify-between items-start mb-1"><div className="text-sm font-semibold">{item.type.charAt(0).toUpperCase() + item.type.slice(1)} {item.outcome && `- ${item.outcome}`}</div><div className="text-xs text-muted-foreground">{new Date(item.date).toLocaleString()}</div></div><div className="text-sm text-muted-foreground">{item.note}</div>{item.type === 'call' && item.duration && <div className="mt-2 flex items-center gap-4"><div className="text-xs font-medium">Duration: {item.duration}</div><Button size="sm" variant="ghost" className="h-6 ml-auto"><Play className="h-3 w-3 mr-1" /> Listen</Button></div>}</div></div>))}</div>
                      </TabsContent>
                      <TabsContent value="schedule" className="mt-0 space-y-6">
                        <div className="flex items-center justify-between mb-4"><h4 className="font-semibold">Scheduled Appointments</h4><Button size="sm" variant="outline" onClick={() => handleScheduleMeeting(selectedLead)}><Plus className="h-3 w-3 mr-1" /> Schedule</Button></div>
                        <div className="space-y-3">{appointments.filter(a => a.leadId === selectedLead._id).map((apt) => (<div key={apt._id} className="p-4 border rounded-lg bg-card shadow-sm"><div className="flex justify-between items-start mb-2"><div><div className="font-semibold">{apt.title}</div><div className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Calendar className="h-3 w-3" />{new Date(apt.date).toLocaleDateString()} at {apt.time}</div></div><Badge variant="secondary">{apt.type}</Badge></div>{apt.notes && <div className="text-xs text-muted-foreground italic mt-2 border-t pt-2">{apt.notes}</div>}<div className="flex justify-end gap-2 mt-3 pt-3 border-t"><Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleEditAppointment(apt)}><Edit3 className="h-3 w-3 mr-1" /> Edit</Button><Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => confirmDeleteAppointment(apt)}><Trash2 className="h-3 w-3 mr-1" /> Cancel</Button></div></div>))}
                        {appointments.filter(a => a.leadId === selectedLead._id).length === 0 && <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">No meetings scheduled.</div>}</div>
                      </TabsContent>
                    </div></ScrollArea>
                  </Tabs>
                </>
              )}
            </SheetContent>
          </Sheet>

          {/* User Management View (Admin) */}
          {activeTab === "admin-users" && isAdmin && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
                <Button><Plus className="mr-2 h-4 w-4" /> Add User</Button>
              </div>
              <Card>
                <CardHeader>
                  <div className="flex flex-col space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Platform Users</CardTitle>
                        <CardDescription>Total {registeredUsers.length} registered users.</CardDescription>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                          placeholder="Search name, email, company..." 
                          className="pl-9 h-9" 
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>
                      
                      <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                        <SelectTrigger className="w-[180px] h-9">
                          <SelectValue placeholder="All Plans" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Plans</SelectItem>
                          <SelectItem value="Basic">Basic</SelectItem>
                          <SelectItem value="Advanced">Advanced</SelectItem>
                          <SelectItem value="Enterprise">Enterprise</SelectItem>
                          <SelectItem value="Free">Free</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={logsCampaignFilter} onValueChange={setLogsCampaignFilter}>
                        <SelectTrigger className="w-[150px] h-9">
                          <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Company</TableHead><TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {registeredUsers
                        .filter(u => {
                          const searchLower = searchTerm.toLowerCase();
                          const matchesSearch = !searchTerm || 
                            `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchLower) ||
                            u.email.toLowerCase().includes(searchLower) ||
                            (u.companyName || "").toLowerCase().includes(searchLower);
                          
                          const matchesPlan = campaignFilter === "all" || (u.subscription?.plan === campaignFilter);
                          const matchesStatus = (logsCampaignFilter === "all") || (u.subscription?.status === logsCampaignFilter);
                          
                          return !!(matchesSearch && matchesPlan && matchesStatus);
                        })
                        .map((u) => (
                        <TableRow key={u._id}>
                          <TableCell><div className="flex items-center gap-3"><Avatar className="h-8 w-8"><AvatarImage src={u.companyLogo || undefined} alt={u.firstName} /><AvatarFallback>{(u.firstName || "").charAt(0)}{(u.lastName || "").charAt(0)}</AvatarFallback></Avatar><div><div className="font-medium">{u.firstName} {u.lastName}</div><div className="text-xs text-muted-foreground">{u.email}</div></div></div></TableCell>
                          <TableCell>{u.companyName || "-"}</TableCell>
                          <TableCell><Badge variant="secondary">{u.subscription?.plan || "Free"}</Badge></TableCell>
                          <TableCell><Badge variant={u.subscription?.status === 'Active' ? 'default' : 'outline'} className={u.subscription?.status === 'Active' ? 'bg-green-500/15 text-green-600 border-none' : ''}>{u.subscription?.status || "Inactive"}</Badge></TableCell>
                          <TableCell className="text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right"><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "admin-notifications" && isAdmin && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Notification Management</h1>
                <Dialog open={isAddNotificationOpen} onOpenChange={setIsAddNotificationOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="mr-2 h-4 w-4" /> Add Notification</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Notification or Announcement</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select 
                          value={notificationForm.type} 
                          onValueChange={(val: any) => setNotificationForm({ ...notificationForm, type: val })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="notification">Notification</SelectItem>
                            <SelectItem value="announcement">Announcement</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Message</Label>
                        <Textarea 
                          placeholder="Type your message here..." 
                          value={notificationForm.message}
                          onChange={(e) => setNotificationForm({ ...notificationForm, message: e.target.value })}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddNotificationOpen(false)}>Cancel</Button>
                      <Button onClick={async () => {
                        if (!notificationForm.message) return;
                        setIsSaving(true);
                        try {
                          const res = await apiRequest("POST", "/api/notifications", notificationForm);
                          const data = await res.json();
                          const newNotif = data.notification;
                          if (newNotif) {
                            setNotifications([newNotif, ...notifications]);
                          }
                          setIsAddNotificationOpen(false);
                          setNotificationForm({ message: "", type: "notification" });
                          toast({ title: "Notification created successfully" });
                        } catch (err) {
                          toast({ variant: "destructive", title: "Failed to create notification" });
                        } finally {
                          setIsSaving(false);
                        }
                      }} disabled={isSaving}>Submit</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Sent Notifications & Announcements</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>S.No</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notifications && notifications.length > 0 ? (
                        notifications.map((n, idx) => (
                          <TableRow key={n._id}>
                            <TableCell>{idx + 1}</TableCell>
                            <TableCell className="max-w-md truncate">{n.message}</TableCell>
                            <TableCell>
                              <Badge variant={n.type === "announcement" ? "default" : "secondary"}>
                                {n.type}
                              </Badge>
                            </TableCell>
                            <TableCell>{n.createdAt ? new Date(n.createdAt).toLocaleDateString() : "-"}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            No notifications sent yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Campaigns View */}
          {activeTab === "campaigns" && !isAdmin && (
            <FeatureGate featureKey="campaigns">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
                <Button onClick={() => setIsCreateCampaignOpen(true)}><Plus className="mr-2 h-4 w-4" /> Create Campaign</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {campaigns.map((campaign) => (
                  <Card key={campaign._id} className="hover-elevate">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                      <div className="space-y-1"><CardTitle className="text-xl">{campaign.name}</CardTitle><CardDescription className="flex items-center gap-1"><Badge variant="outline" className="text-[10px] uppercase py-0">{campaign.goal}</Badge></CardDescription></div>
                      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => { setTestCallCampaign(campaign); setTestCallPhone(""); setTestCallResult(null); setIsTestCallOpen(true); }}><Phone className="mr-2 h-4 w-4" />Test Call</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => { setSelectedCampaign(campaign); setEditCampaignForm({ name: campaign.name, goal: (campaign.goal as "sales" | "support" | "survey" | "appointment") || "sales", script: campaign.script, voice: campaign.voice, additionalContext: campaign.additionalContext || "", callingHours: campaign.callingHours || { start: "09:00", end: "17:00" }, status: (campaign.status as "Active" | "Paused" | "Draft") || "Draft", knowledgeBaseFiles: campaign.knowledgeBaseFiles || [], startDate: campaign.startDate || "", endDate: campaign.endDate || "" }); setIsEditCampaignOpen(true); }}>Edit Campaign</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={() => setDeleteConfirm({ type: "campaign", id: (campaign as any)._id, name: campaign.name })}>Delete Campaign</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                    </CardHeader>
                    <CardContent className="pb-2"><p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">{campaign.script}</p><div className="flex items-center gap-4 mt-4"><div className="flex flex-col"><span className="text-2xl font-bold">{leads.filter(l => l.campaignId === campaign._id).length}</span><span className="text-[10px] text-muted-foreground uppercase font-bold">Leads</span></div><div className="flex flex-col"><span className="text-2xl font-bold">{leads.filter(l => l.campaignId === campaign._id && l.status === 'Interested').length}</span><span className="text-[10px] text-muted-foreground uppercase font-bold">Interested</span></div></div></CardContent>
                    <CardFooter className="pt-2 border-t flex items-center justify-between bg-muted/5"><Badge variant={campaign.status === "Active" ? "default" : "secondary"}>{campaign.status}</Badge><div className="flex items-center gap-2"><Button variant="ghost" size="icon" className="h-8 w-8" title={campaign.status === "Active" ? "Pause campaign" : "Start campaign"} onClick={() => handleToggleCampaignStatus(campaign)}>{campaign.status === "Active" ? <X className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button></div></CardFooter>
                  </Card>
                ))}
              </div>
            </div>
            </FeatureGate>
          )}

          {/* Calendar View */}
          {activeTab === "calendar" && !isAdmin && (
            <FeatureGate featureKey="calendar">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
                <Button onClick={() => setIsAddAppointmentOpen(true)}><Plus className="mr-2 h-4 w-4" /> Schedule</Button>
              </div>
              <Card className="p-6">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                    <h2 className="text-xl font-bold">{calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
                    <Button variant="outline" size="icon" onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-px bg-muted overflow-hidden rounded-lg border">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="bg-muted/50 p-2 text-center text-xs font-bold text-muted-foreground uppercase">{day}</div>)}
                  {Array.from({ length: 42 }).map((_, i) => {
                    const firstDayOfMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay();
                    const day = i - firstDayOfMonth + 1;
                    const date = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
                    const isCurrentMonth = date.getMonth() === calendarDate.getMonth();
                    const isToday = date.toDateString() === new Date().toDateString();
                    const dateAppointments = appointments.filter(app => new Date(app.date).toDateString() === date.toDateString());

                    return (
                      <div 
                        key={i} 
                        className={`h-24 md:h-32 bg-background p-2 transition-colors hover:bg-muted/50 cursor-pointer ${!isCurrentMonth ? 'opacity-30' : ''} ${isToday ? 'bg-primary/5' : ''}`}
                        onClick={() => {
                          const year = date.getFullYear();
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const dayNum = String(date.getDate()).padStart(2, '0');
                          const formattedDate = `${year}-${month}-${dayNum}`;
                          setAppointmentForm({
                            ...appointmentForm,
                            date: formattedDate,
                            leadId: "",
                            leadName: "",
                            title: ""
                          });
                          setIsAddAppointmentOpen(true);
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <span className={`text-sm font-medium ${isToday ? 'bg-primary text-primary-foreground h-6 w-6 rounded-full flex items-center justify-center' : ''}`}>
                            {date.getDate()}
                          </span>
                        </div>
                        <div className="mt-1 space-y-1 overflow-y-auto max-h-[calc(100%-1.5rem)]">
                          {dateAppointments.map((app) => (
                            <div 
                              key={app._id} 
                              className="text-[10px] leading-tight p-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 truncate"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditAppointment(app);
                              }}
                            >
                              {app.time} {app.title}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Upcoming Appointments List */}
              <Card className="hover-elevate">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    Upcoming Appointments
                  </CardTitle>
                  <CardDescription>Scheduled follow-ups and meetings.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {appointments.length > 0 ? (
                      appointments
                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                        .map((apt) => (
                          <div 
                            key={apt._id} 
                            className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => handleEditAppointment(apt)}
                          >
                            <div className="flex items-center gap-4">
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                {new Date(apt.date).getDate()}
                              </div>
                              <div>
                                <div className="font-semibold">{apt.title}</div>
                                <div className="text-sm text-muted-foreground flex items-center gap-2">
                                  <span>{apt.leadName}</span>
                                  <span>•</span>
                                  <span>{new Date(apt.date).toLocaleDateString()} at {apt.time}</span>
                                  <Badge variant="secondary" className="text-[10px] ml-2">{apt.type}</Badge>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleEditAppointment(apt); }}>
                                <Edit3 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); confirmDeleteAppointment(apt); }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                        No appointments scheduled.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "profile" && (
            <div className="max-w-4xl mx-auto space-y-8">
              <div><h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1><p className="text-muted-foreground">Manage your personal information and platform preferences.</p></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-6">
                  <Card className="p-6 text-center">
                    <Avatar className="h-24 w-24 mx-auto mb-4 border-4 border-background shadow-xl ring-1 ring-primary/20">
                      <AvatarImage src={user?.companyLogo || ""} />
                      <AvatarFallback className="text-3xl bg-primary/10 text-primary font-bold">{user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <h3 className="font-bold text-lg">{user?.firstName} {user?.lastName}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{user?.email}</p>
                    <Badge variant="secondary" className="uppercase tracking-widest text-[10px]">{user?.role || 'User'}</Badge>
                  </Card>
                  {/* Company Info Box removed as requested */}
                </div>
                <div className="md:col-span-2 space-y-6">
                  <Tabs defaultValue="profile" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="profile">Profile</TabsTrigger>
                      <TabsTrigger value="security">Security</TabsTrigger>
                    </TabsList>
                    <TabsContent value="profile" className="mt-6">
                      <Card>
                        <CardHeader>
                          <CardTitle>Basic Information</CardTitle>
                          <CardDescription>Update your personal details.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-4">
                            <div className="flex items-center gap-4">
                              <Avatar className="h-20 w-20 border-2 border-primary/20">
                                <AvatarImage src={user?.companyLogo || undefined} />
                                <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                                  {profileForm.firstName?.charAt(0)}{profileForm.lastName?.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <Label htmlFor="logo-upload" className="cursor-pointer">
                                  <div className="flex items-center gap-2 text-sm text-primary hover:underline">
                                    <Upload className="h-4 w-4" />
                                    {isUploading ? "Uploading..." : "Upload Company Logo"}
                                  </div>
                                </Label>
                                <Input 
                                  id="logo-upload" 
                                  type="file" 
                                  className="hidden" 
                                  accept="image/*"
                                  onChange={handleLogoUpload}
                                />
                                <p className="text-xs text-muted-foreground mt-1">Recommended: Square image, max 2MB</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>First Name</Label>
                                <Input value={profileForm.firstName} onChange={e => setProfileForm({...profileForm, firstName: e.target.value})} />
                              </div>
                              <div className="space-y-2">
                                <Label>Last Name</Label>
                                <Input value={profileForm.lastName} onChange={e => setProfileForm({...profileForm, lastName: e.target.value})} />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Email Address</Label>
                              <Input value={profileForm.email} readOnly className="bg-muted" />
                            </div>
                            <div className="space-y-2">
                              <Label>Phone Number</Label>
                              <Input value={profileForm.phone} onChange={e => setProfileForm({...profileForm, phone: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>DLT Principal Entity ID</Label>
                                <Input 
                                  placeholder="Enter PE ID" 
                                  value={profileForm.dltPrincipalEntityId} 
                                  onChange={(e) => setProfileForm({ ...profileForm, dltPrincipalEntityId: e.target.value })} 
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>DLT Header ID (Sender ID)</Label>
                                <Input 
                                  placeholder="Enter Header ID" 
                                  value={profileForm.dltHeaderId} 
                                  onChange={(e) => setProfileForm({ ...profileForm, dltHeaderId: e.target.value })} 
                                />
                              </div>
                            </div>
                          </div>
                          <Button className="mt-4 w-full" disabled={isSaving} onClick={handleUpdateProfile}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save Changes
                          </Button>

                          {/* Exotel Configuration Section */}
                          {(isAdmin || (userPlan?.selfBranding)) && (
                            <div className="mt-8 pt-8 border-t">
                              <h3 className="text-lg font-medium mb-4">Exotel API Configuration</h3>
                              <form onSubmit={handleUpdateExotelConfig} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label htmlFor="exotelApiKey">API Key</Label>
                                    <Input 
                                      id="exotelApiKey" 
                                      value={exotelForm.apiKey} 
                                      onChange={(e) => setExotelForm({...exotelForm, apiKey: e.target.value})}
                                      placeholder="Exotel API Key"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="exotelApiToken">API Token</Label>
                                    <Input 
                                      id="exotelApiToken" 
                                      type="password"
                                      value={exotelForm.apiToken} 
                                      onChange={(e) => setExotelForm({...exotelForm, apiToken: e.target.value})}
                                      placeholder="Exotel API Token"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="exotelSubdomain">Subdomain</Label>
                                    <Input 
                                      id="exotelSubdomain" 
                                      value={exotelForm.subdomain} 
                                      onChange={(e) => setExotelForm({...exotelForm, subdomain: e.target.value})}
                                      placeholder="e.g. api.exotel.com"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="exotelSid">Account SID</Label>
                                    <Input 
                                      id="exotelSid" 
                                      value={exotelForm.sid} 
                                      onChange={(e) => setExotelForm({...exotelForm, sid: e.target.value})}
                                      placeholder="Exotel Account SID"
                                    />
                                  </div>
                                </div>
                                <Button type="submit" disabled={isSaving}>Save Exotel Config</Button>
                              </form>

                              {/* Gupshup Configuration Section */}
                              <div className="mt-8 pt-8 border-t">
                                <h3 className="text-lg font-medium mb-4">Gupshup SMS Configuration</h3>
                                <form onSubmit={handleUpdateGupshupConfig} className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <Label htmlFor="gupshupApiKey">Gupshup API Key</Label>
                                      <Input 
                                        id="gupshupApiKey" 
                                        type="password"
                                        value={gupshupForm.apiKey} 
                                        onChange={(e) => setGupshupForm({...gupshupForm, apiKey: e.target.value})}
                                        placeholder="Gupshup API Key"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor="gupshupUserId">Gupshup User ID</Label>
                                      <Input 
                                        id="gupshupUserId" 
                                        value={gupshupForm.userId} 
                                        onChange={(e) => setGupshupForm({...gupshupForm, userId: e.target.value})}
                                        placeholder="Gupshup User ID"
                                      />
                                    </div>
                                  </div>
                                  <Button type="submit" disabled={isSaving}>Save Gupshup Config</Button>
                                </form>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>
                    <TabsContent value="security" className="mt-6">
                      <Card>
                        <CardHeader>
                          <CardTitle>Change Password</CardTitle>
                          <CardDescription>Ensure your account remains secure.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Label>Current Password</Label>
                            <Input type="password" value={passwordForm.current} onChange={e => setPasswordForm({...passwordForm, current: e.target.value})} />
                          </div>
                          <div className="space-y-2">
                            <Label>New Password</Label>
                            <Input type="password" value={passwordForm.new} onChange={e => setPasswordForm({...passwordForm, new: e.target.value})} />
                          </div>
                          <div className="space-y-2">
                            <Label>Confirm New Password</Label>
                            <Input type="password" value={passwordForm.confirm} onChange={e => setPasswordForm({...passwordForm, confirm: e.target.value})} />
                          </div>
                          <Button className="mt-4" onClick={async () => {
                            if (passwordForm.new !== passwordForm.confirm) {
                              return toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
                            }
                            try {
                              await apiRequest("POST", "/api/user/change-password", {
                                currentPassword: passwordForm.current,
                                newPassword: passwordForm.new
                              });
                              setPasswordForm({ current: "", new: "", confirm: "" });
                              toast({ title: "Success", description: "Password updated successfully" });
                            } catch (err) {
                              toast({ title: "Error", description: "Failed to update password", variant: "destructive" });
                            }
                          }}>Update Password</Button>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </div>
          )}

                {/* Billing View */}
                {activeTab === "billing" && (
                  <div className="max-w-4xl mx-auto space-y-8">
                    <div>
                      <h1 className="text-3xl font-bold tracking-tight">Billing & Subscription</h1>
                      <p className="text-muted-foreground">Manage your subscription, view usage, and billing history.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <Card className="md:col-span-2">
                        <CardHeader>
                          <CardTitle>Current Plan</CardTitle>
                          <CardDescription>Details about your current active subscription.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          {(() => {
                            const sub = user?.subscription;
                            const renewalDate = sub?.renewalDate ? new Date(sub.renewalDate) : null;
                            const expired = renewalDate ? renewalDate < new Date() : false;
                            const daysLeft = renewalDate ? Math.ceil((renewalDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                            return (
                              <div className={`flex items-center justify-between p-4 rounded-lg border ${expired ? "bg-red-500/10 border-red-500/20" : "bg-primary/5 border-primary/10"}`}>
                                <div>
                                  <h3 className="text-lg font-bold">{sub?.plan || "Free"} Plan</h3>
                                  <p className="text-sm text-muted-foreground">
                                    {expired
                                      ? `Expired on ${renewalDate?.toLocaleDateString()}`
                                      : renewalDate
                                        ? `Renews on ${renewalDate.toLocaleDateString()}${daysLeft !== null && daysLeft <= 7 ? ` · ${daysLeft}d left` : ""}`
                                        : "No renewal date set"}
                                  </p>
                                </div>
                                {expired ? (
                                  <Badge variant="destructive" className="border-none">Expired</Badge>
                                ) : sub?.status === "Active" ? (
                                  <Badge variant="default" className="bg-green-500 hover:bg-green-600 border-none">Active</Badge>
                                ) : (
                                  <Badge variant="secondary">{sub?.status || "Inactive"}</Badge>
                                )}
                              </div>
                            );
                          })()}

                          <div className="grid grid-cols-2 gap-4 pt-4">
                            <div className="p-4 border rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1 uppercase font-bold tracking-wider">Plan Cost</p>
                              <p className="text-2xl font-bold">₹{plans.find(p => p.name === user?.subscription?.plan)?.price || 0}/mo</p>
                            </div>
                            <div className="p-4 border rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1 uppercase font-bold tracking-wider">Remaining Credits</p>
                              <p className="text-2xl font-bold">{Math.max(0, (user?.subscription?.monthlyCallCredits || 0) + ((user?.subscription as any)?.purchasedCredits || 0) - (user?.subscription?.creditsUsed || 0))}</p>
                              {((user?.subscription as any)?.purchasedCredits || 0) > 0 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Plan: {user?.subscription?.monthlyCallCredits || 0} + Purchased: {(user?.subscription as any)?.purchasedCredits || 0}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Credit usage breakdown */}
                          {(() => {
                            const sub = user?.subscription as any;
                            const total = (sub?.monthlyCallCredits || 0) + (sub?.purchasedCredits || 0);
                            const used = sub?.creditsUsed || 0;
                            const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
                            return total > 0 ? (
                              <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Credits used this period</span>
                                  <span className="font-medium">{used} / {total}</span>
                                </div>
                                <div className="w-full bg-muted rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full transition-all ${pct > 85 ? "bg-destructive" : pct > 60 ? "bg-yellow-500" : "bg-primary"}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <p className="text-xs text-muted-foreground">{pct}% used — {Math.max(0, total - used)} credits remaining</p>
                              </div>
                            ) : null;
                          })()}
                        </CardContent>
                        <CardFooter className="border-t bg-muted/5 flex flex-wrap justify-between gap-4">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline">View Billing History</Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Billing History</DialogTitle>
                                <DialogDescription>Your recent invoices and transactions.</DialogDescription>
                              </DialogHeader>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Invoice</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {user?.subscription?.joinedDate ? (
                                    <TableRow>
                                      <TableCell>{new Date(user.subscription.joinedDate).toLocaleDateString()}</TableCell>
                                      <TableCell>{user.subscription.plan} Plan Activation</TableCell>
                                      <TableCell>₹{plans.find(p => p.name === user.subscription?.plan)?.price || 0}</TableCell>
                                      <TableCell><Badge variant="outline" className="text-green-600 bg-green-50">Paid</Badge></TableCell>
                                      <TableCell className="text-right">
                                        <Button 
                                          variant="ghost" 
                                          size="sm" 
                                          className="h-8"
                                          onClick={() => {
                                            const plan = plans.find(p => p.name === user.subscription?.plan);
                                            const invoiceData = {
                                              invoiceNo: "INV-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
                                              date: new Date(user.subscription!.joinedDate).toLocaleDateString(),
                                              customerName: `${user.firstName} ${user.lastName}`,
                                              planName: user.subscription!.plan,
                                              amount: plan?.price || 0,
                                              status: "Paid"
                                            };
                                            
                                            const printWindow = window.open('', '_blank');
                                            if (printWindow) {
                                              printWindow.document.write(`
                                                <html>
                                                  <head>
                                                    <title>Invoice - ${invoiceData.invoiceNo}</title>
                                                    <style>
                                                      body { font-family: sans-serif; padding: 40px; color: #333; }
                                                      .header { display: flex; justify-between; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 40px; }
                                                      .invoice-info { text-align: right; }
                                                      .details { margin-bottom: 40px; }
                                                      table { width: 100%; border-collapse: collapse; }
                                                      th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
                                                      th { background: #f9f9f9; }
                                                      .total { text-align: right; margin-top: 20px; font-size: 1.2em; font-weight: bold; }
                                                      .footer { margin-top: 60px; font-size: 0.8em; color: #777; text-align: center; }
                                                    </style>
                                                  </head>
                                                  <body>
                                                    <div class="header">
                                                      <div><h1>NIJVOX</h1></div>
                                                      <div class="invoice-info">
                                                        <h2>INVOICE</h2>
                                                        <p>#${invoiceData.invoiceNo}</p>
                                                        <p>Date: ${invoiceData.date}</p>
                                                      </div>
                                                    </div>
                                                    <div class="details">
                                                      <p><strong>Billed To:</strong></p>
                                                      <p>${invoiceData.customerName}</p>
                                                      <p>${user.email}</p>
                                                    </div>
                                                  <table>
                                                      <thead>
                                                        <tr>
                                                          <th>Description</th>
                                                          <th>Amount</th>
                                                        </tr>
                                                      </thead>
                                                      <tbody>
                                                        <tr>
                                                          <td>${invoiceData.planName} Plan Subscription</td>
                                                          <td>₹${invoiceData.amount}</td>
                                                        </tr>
                                                      </tbody>
                                                    </table>
                                                    <div class="total">Total: ₹${invoiceData.amount}</div>
                                                    <div class="footer">
                                                      <p>Thank you for choosing NIJVOX!</p>
                                                    </div>
                                                    <script>window.print();</script>
                                                  </body>
                                                </html>
                                              `);
                                              printWindow.document.close();
                                            }
                                          }}
                                        >
                                          <FileText className="h-4 w-4 mr-2" /> PDF
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No billing history found.</TableCell></TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </DialogContent>
                          </Dialog>
                          
                          <div className="flex gap-2 flex-wrap">
                            <Button variant="outline" className="text-primary border-primary hover:bg-primary/5" onClick={() => {
                              // Prefer plan with features to avoid matching a duplicate empty-features record
                              const plan =
                                plans.find((p: Plan) => p.name === user?.subscription?.plan && (p.features?.length ?? 0) > 0) ??
                                plans.find((p: Plan) => p.name === user?.subscription?.plan);
                              setLocation(plan ? `/payment?plan=${plan._id}&renew=true` : "/pricing");
                            }}>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Renew Now
                            </Button>

                            {/* Buy Extra Credits */}
                            {(() => {
                              const currentPlan = plans.find((p: Plan) => p.name === user?.subscription?.plan) as any;
                              if (!currentPlan?.extraCreditPrice || currentPlan.extraCreditPrice <= 0) return null;
                              return (
                                <BuyCreditsDialog
                                  plan={currentPlan}
                                  onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] })}
                                />
                              );
                            })()}
                            
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button>Upgrade Plan</Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle>Available Plans</DialogTitle>
                                  <DialogDescription>Choose a plan that fits your business needs.</DialogDescription>
                                </DialogHeader>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
                                  {plans.map((plan) => (
                                    <Card key={plan._id} className={`flex flex-col ${user?.subscription?.plan === plan.name ? 'ring-2 ring-primary border-primary' : ''}`}>
                                      <CardHeader>
                                        <CardTitle>{plan.name}</CardTitle>
                                        <CardDescription>{plan.description}</CardDescription>
                                        <div className="mt-2 text-3xl font-bold">₹{plan.price}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                                      </CardHeader>
                                      <CardContent className="flex-1">
                                        <ul className="space-y-2 text-sm">
                                          {plan.features?.map((f, idx) => (
                                            <li key={idx} className="flex items-center gap-2">
                                              <CheckCircle2 className="h-4 w-4 text-green-500" /> {f}
                                            </li>
                                          ))}
                                        </ul>
                                      </CardContent>
                                      <CardFooter>
                                        <Button 
                                          className="w-full" 
                                          variant={user?.subscription?.plan === plan.name ? "outline" : "default"}
                                          disabled={user?.subscription?.plan === plan.name}
                                          onClick={() => setLocation(`/payment?plan=${plan._id}`)}
                                        >
                                          {user?.subscription?.plan === plan.name ? "Current Plan" : "Choose Plan"}
                                        </Button>
                                      </CardFooter>
                                    </Card>
                                  ))}
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </CardFooter>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">Usage Stats</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground uppercase font-bold">Credits Used</span>
                              <span className="font-bold">{user?.subscription?.creditsUsed || 0} / {user?.subscription?.monthlyCallCredits || 1000}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${Math.min(100, ((user?.subscription?.creditsUsed || 0) / (user?.subscription?.monthlyCallCredits || 1000)) * 100)}%` }} />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground uppercase font-bold">API Calls</span>
                              <span className="font-bold">45 / 100</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500" style={{ width: "45%" }} />
                            </div>
                          </div>
                          <div className="pt-4 border-t">
                            <p className="text-xs text-muted-foreground">Renewal in 12 days</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle>Usage History</CardTitle>
                        <CardDescription>Detailed breakdown of your credit consumption.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[250px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[
                              { name: 'Jan 10', usage: 120 },
                              { name: 'Jan 11', usage: 150 },
                              { name: 'Jan 12', usage: 80 },
                              { name: 'Jan 13', usage: 210 },
                              { name: 'Jan 14', usage: 180 },
                              { name: 'Jan 15', usage: 140 },
                            ]}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.3} />
                              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                              <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px' }} />
                              <Bar dataKey="usage" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

          {/* ══ ANALYTICS TAB ═══════════════════════════════════════════════ */}
          {activeTab === "analytics" && (
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
              <FeatureGate featureKey="analytics">
              <DashboardAnalyticsTab
                leads={leads}
                campaigns={campaigns}
                appointments={appointments}
                callLogs={callLogs}
                registeredUsers={registeredUsers}
                isAdmin={isAdmin}
              />
              </FeatureGate>
            </Suspense>
          )}
        </div>
      </main>

      {/* Confirmation Dialogs */}
      <Dialog open={isLogActivityOpen} onOpenChange={setIsLogActivityOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Activity</DialogTitle>
            <DialogDescription>Record a manual interaction with this lead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Activity Type</Label>
              <Select value={activityLog.type} onValueChange={(v: any) => setActivityLog({...activityLog, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {activityLog.type === "call" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Outcome</Label>
                  <Select value={activityLog.outcome} onValueChange={v => setActivityLog({...activityLog, outcome: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Answered">Answered</SelectItem>
                      <SelectItem value="No Answer">No Answer</SelectItem>
                      <SelectItem value="Busy">Busy</SelectItem>
                      <SelectItem value="Wrong Number">Wrong Number</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Duration</Label>
                  <Input placeholder="e.g. 2:30" value={activityLog.duration} onChange={e => setActivityLog({...activityLog, duration: e.target.value})} />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Notes/Summary</Label>
              <Textarea placeholder="What happened during this interaction?" value={activityLog.note} onChange={e => setActivityLog({...activityLog, note: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLogActivityOpen(false)}>Cancel</Button>
            <Button onClick={handleLogActivity} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddAppointmentOpen} onOpenChange={setIsAddAppointmentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Meeting</DialogTitle>
            <DialogDescription>Set up a follow-up appointment with {appointmentForm.leadName}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Lead <span className="text-destructive">*</span></Label>
              <Select value={appointmentForm.leadId} onValueChange={(val) => {
                const lead = leads.find(l => l._id === val);
                if (lead) {
                  setAppointmentForm({
                    ...appointmentForm,
                    leadId: lead._id,
                    leadName: lead.name,
                    title: appointmentForm.title || `Meeting with ${lead.name}`
                  });
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a lead" />
                </SelectTrigger>
                <SelectContent>
                  {leads.map(lead => (
                    <SelectItem key={lead._id} value={lead._id}>{lead.name} ({lead.company})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input value={appointmentForm.title} onChange={e => setAppointmentForm({...appointmentForm, title: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={appointmentForm.date} onChange={e => setAppointmentForm({...appointmentForm, date: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={appointmentForm.time} onChange={e => setAppointmentForm({...appointmentForm, time: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={appointmentForm.type} onValueChange={v => setAppointmentForm({...appointmentForm, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Zoom">Zoom Meeting</SelectItem>
                  <SelectItem value="Google Meet">Google Meet</SelectItem>
                  <SelectItem value="Phone Call">Phone Call</SelectItem>
                  <SelectItem value="In Person">In Person</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Meeting agenda or details..." value={appointmentForm.notes} onChange={e => setAppointmentForm({...appointmentForm, notes: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddAppointmentOpen(false)}>Cancel</Button>
            <Button onClick={handleAddAppointment} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditAppointmentOpen} onOpenChange={setIsEditAppointmentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Meeting</DialogTitle>
            <DialogDescription>Update appointment details for {appointmentForm.leadName}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input value={appointmentForm.title} onChange={e => setAppointmentForm({...appointmentForm, title: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={appointmentForm.date} onChange={e => setAppointmentForm({...appointmentForm, date: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={appointmentForm.time} onChange={e => setAppointmentForm({...appointmentForm, time: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={appointmentForm.type} onValueChange={v => setAppointmentForm({...appointmentForm, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Zoom">Zoom Meeting</SelectItem>
                  <SelectItem value="Google Meet">Google Meet</SelectItem>
                  <SelectItem value="Phone Call">Phone Call</SelectItem>
                  <SelectItem value="In Person">In Person</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Meeting agenda or details..." value={appointmentForm.notes} onChange={e => setAppointmentForm({...appointmentForm, notes: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <div className="flex justify-between w-full">
              <Button variant="destructive" onClick={() => { if (selectedAppointment) confirmDeleteAppointment(selectedAppointment); setIsEditAppointmentOpen(false); }}>Delete</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsEditAppointmentOpen(false)}>Cancel</Button>
                <Button onClick={handleUpdateAppointment} disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Call Dialog */}
      <Dialog open={isTestCallOpen} onOpenChange={(open) => { setIsTestCallOpen(open); if (!open) { setTestCallPhone(""); setTestCallResult(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Phone className="h-5 w-5" /> Test Call — {testCallCampaign?.name}</DialogTitle>
            <DialogDescription>Enter a phone number to receive a test call using this campaign's script and knowledge base.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="test-call-phone">Phone Number</Label>
              <Input id="test-call-phone" placeholder="+91XXXXXXXXXX" value={testCallPhone} onChange={e => setTestCallPhone(e.target.value)} onKeyDown={e => e.key === "Enter" && handleTestCall()} />
            </div>
            {testCallResult && (
              <div className={`text-sm rounded-md p-3 ${testCallResult.startsWith("Error") ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-700 dark:text-green-400"}`}>
                {testCallResult}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTestCallOpen(false)}>Cancel</Button>
            <Button onClick={handleTestCall} disabled={testCallLoading || !testCallPhone.trim()}>
              {testCallLoading ? "Calling…" : "Make Test Call"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={callConfirm !== null} onOpenChange={(open) => !open && setCallConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm {callConfirm?.type === "call" ? "AI Call" : "SMS"}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to initiate an {callConfirm?.type === "call" ? "AI voice call" : "SMS message"} to this lead? 
              This will consume credits from your balance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={async () => {
                if (!callConfirm) return;
                try {
                  if (callConfirm.type === "call") {
                    await leadsApi.initiateCall(callConfirm.leadId);
                    toast({ title: "Call initiated", description: "The AI agent is now calling the lead." });
                  } else {
                    await leadsApi.sendSms(callConfirm.leadId);
                    toast({ title: "SMS sent", description: "Message has been queued for delivery." });
                  }
                } catch (err: any) {
                  toast({ variant: "destructive", title: "Error", description: err.message });
                }
                setCallConfirm(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirm.type !== null} onOpenChange={(open) => !open && setDeleteConfirm({ type: null, id: "", name: "" })}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the {deleteConfirm.type} "<strong>{deleteConfirm.name}</strong>". This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteConfirm.type === 'lead') handleDeleteLead(deleteConfirm.id); else if (deleteConfirm.type === 'campaign') campaignsApi.delete(deleteConfirm.id).then(() => setCampaigns(campaigns.filter(c => c._id !== deleteConfirm.id))); else if (deleteConfirm.type === 'appointment') handleDeleteAppointment(deleteConfirm.id); setDeleteConfirm({ type: null, id: "", name: "" }); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
