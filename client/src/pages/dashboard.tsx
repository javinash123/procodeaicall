import { useState, useEffect } from "react";
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
  BarChart,
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
  Megaphone,
  Wallet,
  MessageCircle,
  Eye,
  Send
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { leadsApi, campaignsApi, appointmentsApi, usersApi, settingsApi, uploadApi, notesApi, plansApi, type UploadedFile } from "@/lib/api";
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
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import dashboardImage from "@assets/generated_images/futuristic_dashboard_interface_mockup_glowing_in_orange..png";
import BulkWhatsapp from "./bulk-whatsapp";
import AdminPlans from "./admin-plans";

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

  // Data State
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<UserType[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // UI State
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [isEditLeadOpen, setIsEditLeadOpen] = useState(false);
  const [isLeadDetailsOpen, setIsLeadDetailsOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isCreateCampaignOpen, setIsCreateCampaignOpen] = useState(false);
  const [isEditCampaignOpen, setIsEditCampaignOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [campaignTab, setCampaignTab] = useState("basics");
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [isEditNoteOpen, setIsEditNoteOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<any | null>(null);
  const [noteForm, setNoteForm] = useState({ title: "", content: "" });

  // Form State for New Lead
  const [newLead, setNewLead] = useState({ name: "", company: "", email: "", phone: "", notes: "", status: "New" as const, campaignId: "" });
  
  // Form State for Edit Lead
  const [editLead, setEditLead] = useState({ name: "", company: "", email: "", phone: "", notes: "", status: "New" as "New" | "Interested" | "Follow Up" | "Closed" | "Unqualified" | "In Progress", campaignId: "" });
  
  // Filter state for leads by campaign
  const [leadCampaignFilter, setLeadCampaignFilter] = useState<string>("all");

  // Validation errors
  const [leadErrors, setLeadErrors] = useState<{name?: string; phone?: string; email?: string}>({});
  const [campaignErrors, setCampaignErrors] = useState<{name?: string; script?: string; callingHours?: string}>({});

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
    companyName: user?.companyName || ""
  });
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

  // Call/SMS Confirmation State
  const [callConfirm, setCallConfirm] = useState<{ leadId: string; type: "call" | "sms" } | null>(null);

  const [logsCampaignFilter, setLogsCampaignFilter] = useState<string>("all");
  const [dailyActivityCampaignFilter, setDailyActivityCampaignFilter] = useState<string>("all");
  const [overviewCampaignFilter, setOverviewCampaignFilter] = useState<string>("all");
  const [callActivityCampaignFilter, setCallActivityCampaignFilter] = useState<string>("all");

  const [searchTerm, setSearchTerm] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Stats derived from data
  const stats = isAdmin ? [
    { label: "Total Users", value: registeredUsers.length.toString(), icon: Users, tab: "admin-users", change: "" },
    { label: "Total Plans", value: plans.length.toString(), icon: CreditCard, tab: "plans", change: "", href: "/admin/plans" },
    { label: "Active Subscriptions", value: registeredUsers.filter(u => u.subscription?.status === "Active").length.toString(), icon: CheckCircle2, tab: "admin-users", change: "" },
    { label: "Total Revenue", value: `₹${registeredUsers.reduce((acc, u) => acc + (plans.find(p => p.name === u.subscription?.plan)?.price || 0), 0).toLocaleString()}`, icon: Wallet, tab: "admin-users", change: "" },
  ] : [
    { label: "Leads", value: leads.length.toString(), change: "+12.5%", icon: PhoneCall, tab: "crm" },
    { label: "Campaigns", value: campaigns.filter(c => c.status === "Active").length.toString(), change: "+4.2%", icon: CheckCircle2, tab: "campaigns" },
    { label: "Appointments", value: appointments.length.toString(), change: "-1.1%", icon: Clock, tab: "calendar" },
    { label: "Credit Balance", value: `₹${(user?.subscription?.monthlyCallCredits || 0).toLocaleString()}`, change: "0%", icon: Wallet, tab: "settings" },
  ];

  // Fetch data on mount
  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [leadsRes, campaignsRes, appointmentsRes, notesRes, plansRes] = await Promise.all([
          leadsApi.getAll(),
          campaignsApi.getAll(),
          appointmentsApi.getAll(),
          notesApi.getAll(),
          plansApi.getAll()
        ]);
        
        setLeads(Array.isArray(leadsRes) ? leadsRes : (leadsRes as any).leads || []);
        setCampaigns(Array.isArray(campaignsRes) ? campaignsRes : (campaignsRes as any).campaigns || []);
        setAppointments(Array.isArray(appointmentsRes) ? appointmentsRes : (appointmentsRes as any).appointments || []);
        setNotes(Array.isArray(notesRes) ? notesRes : (notesRes as any).notes || []);
        setPlans(Array.isArray(plansRes) ? plansRes : (plansRes as any).plans || []);

        if (isAdmin) {
          const usersRes = await usersApi.getAll();
          setRegisteredUsers(Array.isArray(usersRes) ? usersRes : (usersRes as any).users || []);
        }
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

  // Update profile form when user changes
  useEffect(() => {
    if (user) {
      setProfileForm({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        phone: user.phone || "",
        companyName: user.companyName || ""
      });
      setDndEnabled(user.settings?.dndEnabled || false);
      setCallLimit(user.settings?.dailyCallLimit || 500);
      setLocalPresence(user.settings?.localPresenceDialing ?? true);
    }
  }, [user]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/auth");
    }
  }, [authLoading, user, setLocation]);

  // Validation Functions
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
      const leadWithCampaign = newLead.campaignId && newLead.campaignId !== "none"
        ? { ...lead, campaignName: campaigns.find(c => c._id === newLead.campaignId)?.name }
        : lead;
      setLeads([leadWithCampaign, ...leads]);
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

  const handleUpdateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;
    if (!validateLead(editLead)) return;
    
    setIsSaving(true);
    try {
      const updated = await leadsApi.update(selectedLead._id, {
        name: editLead.name.trim(),
        company: editLead.company.trim(),
        email: editLead.email.trim(),
        phone: editLead.phone.trim(),
        notes: editLead.notes.trim(),
        status: editLead.status,
        campaignId: editLead.campaignId && editLead.campaignId !== "none" ? editLead.campaignId : undefined
      });
      const updatedWithCampaign = editLead.campaignId && editLead.campaignId !== "none"
        ? { ...updated, campaignName: campaigns.find(c => c._id === editLead.campaignId)?.name }
        : { ...updated, campaignName: undefined };
      setLeads(leads.map(l => l._id === selectedLead._id ? updatedWithCampaign : l));
      setIsEditLeadOpen(false);
      setIsLeadDetailsOpen(false);
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
    if (!user || !appointmentForm.title || !appointmentForm.date || !appointmentForm.leadId) {
      toast({ variant: "destructive", title: "Please fill in all required fields" });
      return;
    }
    
    setIsSaving(true);
    try {
      const appointment = await appointmentsApi.create({
        userId: user._id,
        leadId: appointmentForm.leadId,
        leadName: appointmentForm.leadName,
        title: appointmentForm.title,
        date: appointmentForm.date,
        time: appointmentForm.time,
        type: appointmentForm.type,
        notes: appointmentForm.notes
      });
      setAppointments([...appointments, appointment]);
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
      setLocation("/auth");
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
        <div className="p-6 border-b flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <BrainCircuit className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-xl tracking-tight">NIJVOX</h2>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">AI Platform</p>
          </div>
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
                  variant={activeTab === "plans" ? "secondary" : "ghost"} 
                  className="w-full justify-start hover-elevate h-11"
                  onClick={() => setActiveTab("plans")}
                >
                  <CreditCard className="mr-3 h-5 w-5" />
                  Plan Management
                </Button>
              </>
            ) : (
              <>
                <div className="mt-6 mb-2 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Core Tools</div>
                <Button 
                  variant={activeTab === "crm" ? "secondary" : "ghost"} 
                  className="w-full justify-start hover-elevate h-11"
                  onClick={() => setActiveTab("crm")}
                >
                  <Users className="mr-3 h-5 w-5" />
                  Lead CRM
                </Button>
                <Button 
                  variant={activeTab === "campaigns" ? "secondary" : "ghost"} 
                  className="w-full justify-start hover-elevate h-11"
                  onClick={() => setActiveTab("campaigns")}
                >
                  <Megaphone className="mr-3 h-5 w-5" />
                  Campaigns
                </Button>
                <Button 
                  variant={activeTab === "calendar" ? "secondary" : "ghost"} 
                  className="w-full justify-start hover-elevate h-11"
                  onClick={() => setActiveTab("calendar")}
                >
                  <Calendar className="mr-3 h-5 w-5" />
                  Calendar
                </Button>
                <Button 
                  variant={activeTab === "whatsapp" ? "secondary" : "ghost"} 
                  className="w-full justify-start hover-elevate h-11"
                  onClick={() => setActiveTab("whatsapp")}
                >
                  <MessageCircle className="mr-3 h-5 w-5" />
                  Bulk WhatsApp
                </Button>
                <Button 
                  variant={activeTab === "callhistory" ? "secondary" : "ghost"} 
                  className="w-full justify-start hover-elevate h-11"
                  onClick={() => setActiveTab("callhistory")}
                >
                  <History className="mr-3 h-5 w-5" />
                  Call History
                </Button>
              </>
            )}
          </nav>
        </ScrollArea>

        <div className="p-4 border-t bg-muted/10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group">
                <Avatar className="h-9 w-9 border-2 border-background shadow-sm ring-1 ring-border group-hover:ring-primary/50 transition-all">
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
              <DropdownMenuItem onClick={() => setActiveTab("settings")}>
                <CreditCard className="mr-2 h-4 w-4" /> Billing
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab("settings")}>
                <Settings className="mr-2 h-4 w-4" /> Settings
              </DropdownMenuItem>
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
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder={isAdmin ? "Search users..." : "Search leads, campaigns..."} className="pl-9 bg-muted/20 border-none focus-visible:ring-1" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="relative" onClick={() => setLocation("/notifications")}>
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
            </Button>
          </div>
        </header>

        <div className="flex-1 p-6 overflow-auto">
          {activeTab === "whatsapp" && <BulkWhatsapp />}
          {activeTab === "plans" && <AdminPlans />}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
              </div>

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

              {/* Admin Dashboard Charts */}
              {isAdmin && (
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
              )}

              {!isAdmin && (
                <>
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
                        <Select value={dailyActivityCampaignFilter} onValueChange={setDailyActivityCampaignFilter}>
                          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Filter by Campaign" /></SelectTrigger>
                          <SelectContent><SelectItem value="all">All Campaigns</SelectItem>{campaigns.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </CardHeader>
                      <CardContent className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={[{ name: "Jan", leads: 400 }, { name: "Feb", leads: 300 }, { name: "Mar", leads: 600 }, { name: "Apr", leads: 800 }, { name: "May", leads: 500 }, { name: "Jun", leads: 900 }]}><defs><linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.6}/><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.3} /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} /><RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} /><Area type="monotone" dataKey="leads" stroke="hsl(var(--primary))" strokeWidth={5} fillOpacity={1} fill="url(#colorGrowth)" animationDuration={2000} strokeLinecap="round" /></AreaChart></ResponsiveContainer></CardContent>
                    </Card>
                  </div>

                  <Card className="hover-elevate shadow-lg border-primary/10 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between gap-4">
                      <div><CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" />Daily Call Activity</CardTitle><CardDescription>AI Call attempts per day</CardDescription></div>
                      <Select value={callActivityCampaignFilter} onValueChange={setCallActivityCampaignFilter}>
                        <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Filter by Campaign" /></SelectTrigger>
                        <SelectContent><SelectItem value="all">All Campaigns</SelectItem>{campaigns.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </CardHeader>
                    <CardContent className="h-80"><ResponsiveContainer width="100%" height="100%"><LineChart data={[{ name: "Mon", calls: 120 }, { name: "Tue", calls: 150 }, { name: "Wed", calls: 180 }, { name: "Thu", calls: 140 }, { name: "Fri", calls: 160 }, { name: "Sat", calls: 90 }, { name: "Sun", calls: 70 }]}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.3} /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} /><RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} /><Line type="monotone" dataKey="calls" stroke="hsl(var(--primary))" strokeWidth={4} dot={{ r: 6, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "hsl(var(--background))" }} /></LineChart></ResponsiveContainer></CardContent>
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
                                      <DialogFooter><Button variant="outline" onClick={() => { setIsEditNoteOpen(false); setSelectedNote(null); setNoteForm({title: "", content: ""}); }}>Cancel</Button><Button onClick={async () => { if (selectedNote && noteForm.title.trim() && noteForm.content.trim()) { const updated = await notesApi.update(selectedNote._id, noteForm); setNotes(notes.map(n => n._id === selectedNote._id ? updated : n)); setNoteForm({title: "", content: ""}); setIsEditNoteOpen(false); setSelectedNote(null); toast({title: "Success", description: "Note updated successfully"}); } }}>Update Note</Button></DialogFooter>
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
                </>
              )}
            </div>
          )}

          {activeTab === "callhistory" && !isAdmin && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Call History</h1>
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
                      {leads.flatMap(lead => 
                        (lead.history || [])
                          .filter(h => h.type === 'call')
                          .map((history, idx) => (
                            <TableRow key={`${lead._id}-${idx}`}>
                              <TableCell className="font-medium">{lead.name}</TableCell>
                              <TableCell>{lead.campaignName ? <Badge variant="secondary">{lead.campaignName}</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                              <TableCell className="text-sm">{new Date(history.date).toLocaleString()}</TableCell>
                              <TableCell><Badge variant="outline">{history.outcome}</Badge></TableCell>
                              <TableCell className="text-sm">{history.duration}</TableCell>
                              <TableCell><Button size="sm" variant="ghost"><Play className="h-4 w-4 mr-1" /> Play</Button></TableCell>
                              <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setCallConfirm({ leadId: lead._id, type: "call" }); }}><Phone className="h-4 w-4" /></Button></TableCell>
                              <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setCallConfirm({ leadId: lead._id, type: "sms" }); }}><MessageSquare className="h-4 w-4" /></Button></TableCell>
                            </TableRow>
                          ))
                      )}
                      {leads.flatMap(lead => (lead.history || []).filter(h => h.type === 'call')).length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No call history yet.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "crm" && !isAdmin && (
             <div className="space-y-6">
               <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Lead CRM</h1>
                <div className="flex gap-2">
                  <Button variant="outline">Import CSV</Button>
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
                    <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Company</TableHead><TableHead>Campaign</TableHead><TableHead>Status</TableHead><TableHead>Last Interaction</TableHead><TableHead className="text-right">Call</TableHead><TableHead className="text-right">SMS</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {leads.filter(lead => { const searchLower = campaignSearch.toLowerCase(); const matchesSearch = !campaignSearch || lead.name.toLowerCase().includes(searchLower) || (lead.company || "").toLowerCase().includes(searchLower) || (lead.phone || "").toLowerCase().includes(searchLower) || (lead.email || "").toLowerCase().includes(searchLower) || (lead.status || "").toLowerCase().includes(searchLower) || (lead.campaignName || "").toLowerCase().includes(searchLower); if (!matchesSearch) return false; if (leadCampaignFilter === "all") return true; if (leadCampaignFilter === "none") return !lead.campaignId; return lead.campaignId === leadCampaignFilter; }).map((lead) => (
                        <TableRow key={lead._id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewLead(lead)}>
                          <TableCell className="font-medium">{lead.name}</TableCell><TableCell>{lead.company || "-"}</TableCell><TableCell>{lead.campaignName ? <Badge variant="secondary">{lead.campaignName}</Badge> : <span className="text-muted-foreground">-</span>}</TableCell><TableCell><Badge variant="outline">{lead.status}</Badge></TableCell><TableCell className="text-muted-foreground">{formatTimeAgo(lead.lastContact)}</TableCell>
                          <TableCell className="text-right"><Button size="sm" variant="ghost" data-testid={`button-call-${lead._id}`} onClick={(e) => { e.stopPropagation(); setCallConfirm({ leadId: lead._id, type: "call" }); }}><Phone className="h-4 w-4" /></Button></TableCell>
                          <TableCell className="text-right"><Button size="sm" variant="ghost" data-testid={`button-sms-${lead._id}`} onClick={(e) => { e.stopPropagation(); setCallConfirm({ leadId: lead._id, type: "sms" }); }}><MessageSquare className="h-4 w-4" /></Button></TableCell>
                          <TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" data-testid={`button-actions-${lead._id}`}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewLead(lead); }}>View Details</DropdownMenuItem><DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditLead(lead); }}>Edit Lead</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={(e) => { e.stopPropagation(); confirmDeleteLead(lead); }} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell>
                        </TableRow>
                      ))}
                      {leads.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No leads yet. Add your first lead to get started.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
             </div>
          )}

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
                <CardHeader><CardTitle>Platform Users</CardTitle><CardDescription>Total {registeredUsers.length} registered users.</CardDescription></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Company</TableHead><TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {registeredUsers.map((u) => (
                        <TableRow key={u._id}>
                          <TableCell><div className="flex items-center gap-3"><Avatar className="h-8 w-8"><AvatarFallback>{u.firstName?.charAt(0)}{u.lastName?.charAt(0)}</AvatarFallback></Avatar><div><div className="font-medium">{u.firstName} {u.lastName}</div><div className="text-xs text-muted-foreground">{u.email}</div></div></div></TableCell>
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

          {/* Campaigns View */}
          {activeTab === "campaigns" && !isAdmin && (
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
                      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => { setSelectedCampaign(campaign); setEditCampaignForm({ name: campaign.name, goal: campaign.goal as any, script: campaign.script, voice: campaign.voice, additionalContext: campaign.additionalContext || "", callingHours: campaign.callingHours || { start: "09:00", end: "17:00" }, status: campaign.status as any, knowledgeBaseFiles: campaign.knowledgeBaseFiles || [], startDate: campaign.startDate || "", endDate: campaign.endDate || "" }); setIsEditCampaignOpen(true); }}>Edit Campaign</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={() => setDeleteConfirm({ type: "campaign", id: campaign._id, name: campaign.name })}>Delete Campaign</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                    </CardHeader>
                    <CardContent className="pb-2"><p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">{campaign.script}</p><div className="flex items-center gap-4 mt-4"><div className="flex flex-col"><span className="text-2xl font-bold">{leads.filter(l => l.campaignId === campaign._id).length}</span><span className="text-[10px] text-muted-foreground uppercase font-bold">Leads</span></div><div className="flex flex-col"><span className="text-2xl font-bold">{leads.filter(l => l.campaignId === campaign._id && l.status === 'Interested').length}</span><span className="text-[10px] text-muted-foreground uppercase font-bold">Interested</span></div></div></CardContent>
                    <CardFooter className="pt-2 border-t flex items-center justify-between bg-muted/5"><Badge variant={campaign.status === "Active" ? "default" : "secondary"}>{campaign.status}</Badge><div className="flex items-center gap-2"><Button variant="ghost" size="icon" className="h-8 w-8">{campaign.status === "Active" ? <X className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button></div></CardFooter>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Calendar View */}
          {activeTab === "calendar" && !isAdmin && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
                <Button onClick={() => setIsAddAppointmentOpen(true)}><Plus className="mr-2 h-4 w-4" /> Schedule</Button>
              </div>
              <Card className="p-6">
                <div className="flex items-center justify-between mb-8"><div className="flex items-center gap-4"><Button variant="outline" size="icon" onClick={() => setCalendarDate(new Date(calendarDate.setMonth(calendarDate.getMonth() - 1)))}><ChevronLeft className="h-4 w-4" /></Button><h2 className="text-xl font-bold">{calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2><Button variant="outline" size="icon" onClick={() => setCalendarDate(new Date(calendarDate.setMonth(calendarDate.getMonth() + 1)))}><ChevronRight className="h-4 w-4" /></Button></div></div>
                <div className="grid grid-cols-7 gap-px bg-muted overflow-hidden rounded-lg border">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="bg-muted/50 p-2 text-center text-xs font-bold text-muted-foreground uppercase">{day}</div>)}
                  {Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay() }).map((_, i) => <div key={`empty-${i}`} className="bg-background min-h-[120px] p-2" />)}
                  {Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate() }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayApts = appointments.filter(a => a.date === dateStr);
                    return (<div key={day} className={`bg-background min-h-[120px] p-2 border-t hover:bg-muted/5 transition-colors ${new Date().toISOString().split('T')[0] === dateStr ? 'bg-primary/5' : ''}`}><div className={`text-sm font-bold h-6 w-6 flex items-center justify-center rounded-full mb-1 ${new Date().toISOString().split('T')[0] === dateStr ? 'bg-primary text-primary-foreground' : ''}`}>{day}</div><div className="space-y-1">{dayApts.map(apt => (<div key={apt._id} className="text-[10px] p-1 rounded bg-primary/10 text-primary truncate border border-primary/20 cursor-pointer" onClick={() => handleEditAppointment(apt)}>{apt.time} - {apt.leadName}</div>))}</div></div>);
                  })}
                </div>
              </Card>
            </div>
          )}

          {/* Profile & Settings View */}
          {(activeTab === "profile" || activeTab === "settings") && (
            <div className="max-w-4xl mx-auto space-y-8">
              <div><h1 className="text-3xl font-bold tracking-tight">{activeTab === "profile" ? "Profile Settings" : "Account Settings"}</h1><p className="text-muted-foreground">Manage your personal information and platform preferences.</p></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-6">
                  <Card className="p-6 text-center"><Avatar className="h-24 w-24 mx-auto mb-4 border-4 border-background shadow-xl ring-1 ring-primary/20"><AvatarFallback className="text-3xl bg-primary/10 text-primary font-bold">{user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}</AvatarFallback></Avatar><h3 className="font-bold text-lg">{user?.firstName} {user?.lastName}</h3><p className="text-sm text-muted-foreground mb-4">{user?.email}</p><Badge variant="secondary" className="uppercase tracking-widest text-[10px]">{user?.role || 'User'}</Badge></Card>
                  <Card className="p-6"><h4 className="font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2 text-primary"><CreditCard className="h-4 w-4" /> Subscription</h4><div className="space-y-4"><div><p className="text-xs text-muted-foreground">Current Plan</p><p className="font-bold text-lg">{user?.subscription?.plan || "Free"}</p></div><div><p className="text-xs text-muted-foreground">Status</p><Badge variant="outline" className="mt-1 border-green-500 text-green-600 bg-green-500/10">{user?.subscription?.status || "Active"}</Badge></div><Button className="w-full mt-4" variant="outline" size="sm">Manage Billing</Button></div></Card>
                </div>
                <div className="md:col-span-2 space-y-6">
                  <Tabs defaultValue={activeTab} className="w-full"><TabsList className="grid w-full grid-cols-3"><TabsTrigger value="profile">Profile</TabsTrigger><TabsTrigger value="settings">Settings</TabsTrigger><TabsTrigger value="security">Security</TabsTrigger></TabsList>
                    <TabsContent value="profile" className="mt-6"><Card><CardHeader><CardTitle>Basic Information</CardTitle><CardDescription>Update your personal and company details.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>First Name</Label><Input value={profileForm.firstName} onChange={e => setProfileForm({...profileForm, firstName: e.target.value})} /></div><div className="space-y-2"><Label>Last Name</Label><Input value={profileForm.lastName} onChange={e => setProfileForm({...profileForm, lastName: e.target.value})} /></div></div><div className="space-y-2"><Label>Email Address</Label><Input value={profileForm.email} readOnly className="bg-muted" /></div><div className="space-y-2"><Label>Phone Number</Label><Input value={profileForm.phone} onChange={e => setProfileForm({...profileForm, phone: e.target.value})} /></div><div className="space-y-2"><Label>Company Name</Label><Input value={profileForm.companyName} onChange={e => setProfileForm({...profileForm, companyName: e.target.value})} /></div><Button className="mt-4">Save Changes</Button></CardContent></Card></TabsContent>
                    <TabsContent value="settings" className="mt-6"><Card><CardHeader><CardTitle>Platform Preferences</CardTitle><CardDescription>Configure how you want the AI agents to behave.</CardDescription></CardHeader><CardContent className="space-y-6"><div className="flex items-center justify-between"><div><p className="font-medium">Do Not Disturb (DND)</p><p className="text-sm text-muted-foreground">Stop all automated calling activity.</p></div><Switch checked={dndEnabled} onCheckedChange={setDndEnabled} /></div><div className="space-y-2"><Label>Daily Call Limit</Label><Input type="number" value={callLimit} onChange={e => setCallLimit(parseInt(e.target.value))} /><p className="text-xs text-muted-foreground">Maximum calls allowed per 24-hour period.</p></div><div className="flex items-center justify-between"><div><p className="font-medium">Local Presence Dialing</p><p className="text-sm text-muted-foreground">Use local area codes for better answer rates.</p></div><Switch checked={localPresence} onCheckedChange={setLocalPresence} /></div><Button className="mt-4">Update Settings</Button></CardContent></Card></TabsContent>
                    <TabsContent value="security" className="mt-6"><Card><CardHeader><CardTitle>Change Password</CardTitle><CardDescription>Ensure your account remains secure.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label>Current Password</Label><Input type="password" /></div><div className="space-y-2"><Label>New Password</Label><Input type="password" /></div><div className="space-y-2"><Label>Confirm New Password</Label><Input type="password" /></div><Button className="mt-4">Update Password</Button></CardContent></Card></TabsContent>
                  </Tabs>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Confirmation Dialogs */}
      <AlertDialog open={deleteConfirm.type !== null} onOpenChange={(open) => !open && setDeleteConfirm({ type: null, id: "", name: "" })}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the {deleteConfirm.type} "<strong>{deleteConfirm.name}</strong>". This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteConfirm.type === 'lead') handleDeleteLead(deleteConfirm.id); else if (deleteConfirm.type === 'campaign') campaignsApi.delete(deleteConfirm.id).then(() => setCampaigns(campaigns.filter(c => c._id !== deleteConfirm.id))); else if (deleteConfirm.type === 'appointment') handleDeleteAppointment(deleteConfirm.id); setDeleteConfirm({ type: null, id: "", name: "" }); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
