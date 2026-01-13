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
  Send,
  Smartphone,
  Calendar as CalendarIcon
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
  const { user, logout, loading: authLoading, refetchUser } = useAuth();
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
    { label: "Bulk SMS", value: "0", change: "0%", icon: Smartphone, tab: "bulk-sms" },
    { label: "Bulk WhatsApp", value: "0", change: "0%", icon: MessageSquare, tab: "bulk-whatsapp" },
    { label: "Appointments", value: appointments.length.toString(), change: "-1.1%", icon: Clock, tab: "calendar" },
    { label: "Credit Balance", value: `₹${(user?.subscription?.monthlyCallCredits || 0).toLocaleString()}`, change: "0%", icon: Wallet, tab: "profile" },
  ];

  // Side Navigation Items
  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "crm", label: "Call History", icon: PhoneCall },
    { id: "campaigns", label: "Campaigns", icon: Megaphone },
    { id: "bulk-sms", label: "Bulk SMS", icon: Smartphone },
    { id: "bulk-whatsapp", label: "Bulk WhatsApp", icon: MessageCircle },
    { id: "calendar", label: "Calendar", icon: CalendarDays },
    { id: "knowledge-base", label: "Knowledge Base", icon: BrainCircuit },
    { id: "analytics", label: "Analytics", icon: BarChart },
    { id: "profile", label: "Profile", icon: UserCog },
  ];

  if (isAdmin) {
    navItems.splice(1, 0, { id: "admin-users", label: "Users", icon: Users });
    navItems.push({ id: "plans", label: "Manage Plans", icon: CreditCard });
  }

  // Handle sidebar navigation
  const handleNavClick = (tabId: string) => {
    if (tabId === "plans") {
      setLocation("/admin/plans");
    } else {
      setActiveTab(tabId);
    }
  };

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

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);
    try {
      await usersApi.update(user._id, profileForm);
      toast({ title: "Profile updated successfully!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error updating profile", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (passwordForm.new !== passwordForm.confirm) {
      toast({ variant: "destructive", title: "Passwords do not match" });
      return;
    }
    setIsSaving(true);
    try {
      await usersApi.changePassword(user._id, {
        currentPassword: passwordForm.current,
        newPassword: passwordForm.new
      });
      toast({ title: "Password changed successfully!" });
      setPasswordForm({ current: "", new: "", confirm: "" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error changing password", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const formData = new FormData();
    formData.append("logo", file);

    setIsUploading(true);
    try {
      await usersApi.uploadLogo(user._id, formData);
      toast({ title: "Logo uploaded successfully!" });
      if (refetchUser) await refetchUser();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error uploading logo", description: error.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateSettings = async (updates: Partial<typeof user.settings>) => {
    if (!user) return;
    try {
      await settingsApi.update(updates);
      toast({ title: "Settings updated!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error updating settings", description: error.message });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Side Navigation */}
      <aside className="w-64 border-r bg-card flex flex-col h-full sticky top-0">
        <div className="p-6 border-b flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Mic className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-xl tracking-tight">Nijvox AI</span>
        </div>
        
        <ScrollArea className="flex-1 py-4 px-4">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Button
                key={item.id}
                variant={activeTab === item.id ? "secondary" : "ghost"}
                className={`w-full justify-start gap-3 h-10 px-3 hover-elevate transition-all duration-200 ${
                  activeTab === item.id ? "bg-primary/10 text-primary font-medium border-l-2 border-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                }`}
                onClick={() => handleNavClick(item.id)}
              >
                <item.icon className={`h-4 w-4 ${activeTab === item.id ? "text-primary" : ""}`} />
                {item.label}
              </Button>
            ))}
          </nav>
        </ScrollArea>

        <div className="p-4 border-t mt-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-3 p-2 hover:bg-muted group">
                <Avatar className="h-8 w-8 ring-2 ring-primary/20 group-hover:ring-primary/40 transition-all">
                  <AvatarImage src={user?.logoUrl} />
                  <AvatarFallback className="bg-primary/5 text-primary font-semibold">
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start overflow-hidden">
                  <span className="text-sm font-medium truncate w-full">{user?.firstName} {user?.lastName}</span>
                  <span className="text-xs text-muted-foreground truncate w-full capitalize">{user?.role}</span>
                </div>
                <MoreVertical className="h-4 w-4 ml-auto text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setActiveTab("profile")}>
                <UserCog className="mr-2 h-4 w-4" />
                Profile Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab("billing")}>
                <Wallet className="mr-2 h-4 w-4" />
                Billing & Usage
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()} className="text-destructive focus:bg-destructive focus:text-destructive-foreground">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative h-screen">
        <div className="container mx-auto p-4 md:p-8 max-w-7xl animate-in fade-in duration-500">
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
              
              {/* Existing Charts and Sections for Overview */}
              {/* ... Omitting some parts for brevity ... */}
            </div>
          )}

          {activeTab === "crm" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Lead CRM</h1>
                <Button onClick={() => setIsAddLeadOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Lead
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-4 bg-muted/20 p-4 rounded-lg border border-border/50">
                <div className="relative min-w-[300px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search name, phone or email..." 
                    className="pl-9 h-9" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Select value={leadCampaignFilter} onValueChange={setLeadCampaignFilter}>
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
                <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="New">New</SelectItem>
                    <SelectItem value="Interested">Interested</SelectItem>
                    <SelectItem value="Follow Up">Follow Up</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Closed">Closed</SelectItem>
                    <SelectItem value="Unqualified">Unqualified</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle>Leads Directory</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leads
                        .filter(l => {
                          const matchesSearch = l.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                              l.phone.includes(searchTerm) || 
                                              (l.email && l.email.toLowerCase().includes(searchTerm.toLowerCase()));
                          const matchesCampaign = leadCampaignFilter === "all" || l.campaignId === leadCampaignFilter;
                          const matchesStatus = campaignFilter === "all" || l.status === campaignFilter;
                          return matchesSearch && matchesCampaign && matchesStatus;
                        })
                        .map((lead) => (
                        <TableRow key={lead._id}>
                          <TableCell className="font-medium">{lead.name}</TableCell>
                          <TableCell>
                            <div className="text-sm">{lead.phone}</div>
                            <div className="text-xs text-muted-foreground">{lead.email}</div>
                          </TableCell>
                          <TableCell>{lead.campaignName || "General"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{lead.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => handleViewLead(lead)}><Eye className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleEditLead(lead)}><Edit3 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "profile" && (
            <div className="p-6 space-y-6">
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <UserCog className="h-8 w-8 text-primary" />
                  Profile & Settings
                </h1>
                <p className="text-muted-foreground">Manage your account information, security, and platform preferences.</p>
              </div>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle>Logo & Branding</CardTitle>
                  <CardDescription>Upload your company logo for white-label reports.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-6">
                    <Avatar className="h-24 w-24 border">
                      <AvatarImage src={user?.logoUrl} />
                      <AvatarFallback><Building className="h-12 w-12" /></AvatarFallback>
                    </Avatar>
                    <div className="space-y-2">
                      <Input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleLogoUpload}
                        disabled={isUploading}
                        className="max-w-xs"
                      />
                      <p className="text-xs text-muted-foreground">Recommended size: 200x200px. Max 2MB.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="account" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="account">Profile</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                  <TabsTrigger value="security">Security</TabsTrigger>
                </TabsList>
                
                <TabsContent value="account" className="space-y-4 pt-4">
                  <Card className="border-border/50">
                    <CardHeader>
                      <CardTitle>Account Information</CardTitle>
                      <CardDescription>Update your personal and company details.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleUpdateProfile} className="space-y-4">
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
                          <Label>Email</Label>
                          <Input value={profileForm.email} disabled className="bg-muted" />
                        </div>
                        <div className="space-y-2">
                          <Label>Phone</Label>
                          <Input value={profileForm.phone} onChange={e => setProfileForm({...profileForm, phone: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                          <Label>Company Name</Label>
                          <Input value={profileForm.companyName} onChange={e => setProfileForm({...profileForm, companyName: e.target.value})} />
                        </div>
                        <Button type="submit" disabled={isSaving}>
                          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Update Profile
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  <Card className="border-border/50 overflow-hidden group">
                    <CardHeader className="bg-primary/5 border-b border-primary/10">
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text-xl">Subscription Status</CardTitle>
                          <CardDescription>Current plan: {user?.subscription?.plan}</CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
                          {user?.subscription?.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Credits Used</span>
                            <span className="font-medium">{user?.subscription?.creditsUsed} / {user?.subscription?.monthlyCallCredits}</span>
                          </div>
                          <Progress value={(user?.subscription?.creditsUsed || 0) / (user?.subscription?.monthlyCallCredits || 1) * 100} className="h-2" />
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CalendarDays className="h-4 w-4" />
                            <span>Renewal Date: {user?.subscription?.renewalDate ? new Date(user?.subscription?.renewalDate).toLocaleDateString() : "Next billing cycle"}</span>
                          </div>
                        </div>
                        <div className="flex flex-col justify-center gap-3">
                          <Button className="w-full" onClick={() => handleNavClick("billing")}>
                            <CreditCard className="mr-2 h-4 w-4" />
                            Manage Billing & Usage
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="settings" className="space-y-4 pt-4">
                  <Card className="border-border/50">
                    <CardHeader>
                      <CardTitle>Platform Settings</CardTitle>
                      <CardDescription>Configure your dialer and notification preferences.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Do Not Disturb</Label>
                          <p className="text-sm text-muted-foreground">Pause all outgoing campaigns temporarily.</p>
                        </div>
                        <Switch checked={dndEnabled} onCheckedChange={(val) => { setDndEnabled(val); handleUpdateSettings({ dndEnabled: val }); }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Local Presence Dialing</Label>
                          <p className="text-sm text-muted-foreground">Show local area codes to increase answer rates.</p>
                        </div>
                        <Switch checked={localPresence} onCheckedChange={(val) => { setLocalPresence(val); handleUpdateSettings({ localPresenceDialing: val }); }} />
                      </div>
                      <div className="space-y-2">
                        <Label>Daily Call Limit</Label>
                        <Input type="number" value={callLimit} onChange={(e) => { setCallLimit(parseInt(e.target.value)); handleUpdateSettings({ dailyCallLimit: parseInt(e.target.value) }); }} />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="security" className="space-y-4 pt-4">
                  <Card className="border-border/50">
                    <CardHeader>
                      <CardTitle>Change Password</CardTitle>
                      <CardDescription>Ensure your account remains secure.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleChangePassword} className="space-y-4">
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
                        <Button type="submit" disabled={isSaving}>
                          {isSaving ? "Updating..." : "Update Password"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {activeTab === "billing" && (
            <div className="p-6 space-y-6">
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <Wallet className="h-8 w-8 text-primary" />
                  Billing & Usage
                </h1>
                <p className="text-muted-foreground">Manage your subscription, view credits, and track usage.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-border/50 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Available Credits</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">₹{(user?.subscription?.monthlyCallCredits || 0).toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground mt-1">Prepaid balance for all services</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-orange-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Consumption</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">₹{(user?.subscription?.creditsUsed || 0).toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground mt-1">Used in current cycle</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-green-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Active Plan</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{user?.subscription?.plan}</div>
                    <p className="text-xs text-muted-foreground mt-1">Status: {user?.subscription?.status}</p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle>Available Plans</CardTitle>
                  <CardDescription>Upgrade or renew your subscription to get more features.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {plans.map((plan) => (
                      <Card key={plan._id} className={`relative flex flex-col ${user?.subscription?.plan === plan.name ? 'border-primary ring-1 ring-primary' : 'border-border/50 hover-elevate'}`}>
                        {user?.subscription?.plan === plan.name && (
                          <div className="absolute top-0 right-0 p-2">
                            <Badge variant="default">Current</Badge>
                          </div>
                        )}
                        <CardHeader>
                          <CardTitle>{plan.name}</CardTitle>
                          <div className="mt-4 flex items-baseline text-3xl font-bold">
                            ₹{plan.price}
                            <span className="ml-1 text-sm font-normal text-muted-foreground">/{plan.duration}</span>
                          </div>
                          <CardDescription className="mt-2">{plan.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1">
                          <ul className="space-y-2 text-sm">
                            {plan.features.map((feature, i) => (
                              <li key={i} className="flex items-center">
                                <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                                {feature}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                        <CardFooter>
                          <Button 
                            className="w-full" 
                            variant={user?.subscription?.plan === plan.name ? "outline" : "default"}
                          >
                            {user?.subscription?.plan === plan.name ? "Renew Plan" : "Select Plan"}
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "profile" && (
            <div className="p-6 space-y-6">
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <UserCog className="h-8 w-8 text-primary" />
                  Profile & Settings
                </h1>
                <p className="text-muted-foreground">Manage your account information, security, and platform preferences.</p>
              </div>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle>Logo & Branding</CardTitle>
                  <CardDescription>Upload your company logo for white-label reports.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-6">
                    <Avatar className="h-24 w-24 border">
                      <AvatarImage src={user?.logoUrl} />
                      <AvatarFallback><Building className="h-12 w-12" /></AvatarFallback>
                    </Avatar>
                    <div className="space-y-2">
                      <Input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleLogoUpload}
                        disabled={isUploading}
                        className="max-w-xs"
                      />
                      <p className="text-xs text-muted-foreground">Recommended size: 200x200px. Max 2MB.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="account" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="account">Profile</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                  <TabsTrigger value="security">Security</TabsTrigger>
                </TabsList>
                
                <TabsContent value="account" className="space-y-4 pt-4">
                  <Card className="border-border/50">
                    <CardHeader>
                      <CardTitle>Account Information</CardTitle>
                      <CardDescription>Update your personal and company details.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleUpdateProfile} className="space-y-4">
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
                          <Label>Email</Label>
                          <Input value={profileForm.email} disabled className="bg-muted" />
                        </div>
                        <div className="space-y-2">
                          <Label>Phone</Label>
                          <Input value={profileForm.phone} onChange={e => setProfileForm({...profileForm, phone: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                          <Label>Company Name</Label>
                          <Input value={profileForm.companyName} onChange={e => setProfileForm({...profileForm, companyName: e.target.value})} />
                        </div>
                        <Button type="submit" disabled={isSaving}>
                          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Update Profile
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  <Card className="border-border/50 overflow-hidden group">
                    <CardHeader className="bg-primary/5 border-b border-primary/10">
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text-xl">Subscription Status</CardTitle>
                          <CardDescription>Current plan: {user?.subscription?.plan}</CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
                          {user?.subscription?.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Credits Used</span>
                            <span className="font-medium">{user?.subscription?.creditsUsed} / {user?.subscription?.monthlyCallCredits}</span>
                          </div>
                          <Progress value={(user?.subscription?.creditsUsed || 0) / (user?.subscription?.monthlyCallCredits || 1) * 100} className="h-2" />
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CalendarDays className="h-4 w-4" />
                            <span>Renewal Date: {user?.subscription?.renewalDate ? new Date(user?.subscription?.renewalDate).toLocaleDateString() : "Next billing cycle"}</span>
                          </div>
                        </div>
                        <div className="flex flex-col justify-center gap-3">
                          <Button className="w-full" onClick={() => handleNavClick("billing")}>
                            <CreditCard className="mr-2 h-4 w-4" />
                            Manage Billing & Usage
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="settings" className="space-y-4 pt-4">
                  <Card className="border-border/50">
                    <CardHeader>
                      <CardTitle>Platform Settings</CardTitle>
                      <CardDescription>Configure your dialer and notification preferences.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Do Not Disturb</Label>
                          <p className="text-sm text-muted-foreground">Pause all outgoing campaigns temporarily.</p>
                        </div>
                        <Switch checked={dndEnabled} onCheckedChange={(val) => { setDndEnabled(val); handleUpdateSettings({ dndEnabled: val }); }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Local Presence Dialing</Label>
                          <p className="text-sm text-muted-foreground">Show local area codes to increase answer rates.</p>
                        </div>
                        <Switch checked={localPresence} onCheckedChange={(val) => { setLocalPresence(val); handleUpdateSettings({ localPresenceDialing: val }); }} />
                      </div>
                      <div className="space-y-2">
                        <Label>Daily Call Limit</Label>
                        <Input type="number" value={callLimit} onChange={(e) => { setCallLimit(parseInt(e.target.value)); handleUpdateSettings({ dailyCallLimit: parseInt(e.target.value) }); }} />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="security" className="space-y-4 pt-4">
                  <Card className="border-border/50">
                    <CardHeader>
                      <CardTitle>Change Password</CardTitle>
                      <CardDescription>Ensure your account remains secure.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleChangePassword} className="space-y-4">
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
                        <Button type="submit" disabled={isSaving}>
                          {isSaving ? "Updating..." : "Update Password"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {activeTab === "billing" && (
            <div className="p-6 space-y-6">
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <Wallet className="h-8 w-8 text-primary" />
                  Billing & Usage
                </h1>
                <p className="text-muted-foreground">Manage your subscription, view credits, and track usage.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-border/50 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Available Credits</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">₹{(user?.subscription?.monthlyCallCredits || 0).toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground mt-1">Prepaid balance for all services</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-orange-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Consumption</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">₹{(user?.subscription?.creditsUsed || 0).toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground mt-1">Used in current cycle</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-green-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Active Plan</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{user?.subscription?.plan}</div>
                    <p className="text-xs text-muted-foreground mt-1">Status: {user?.subscription?.status}</p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle>Available Plans</CardTitle>
                  <CardDescription>Upgrade or renew your subscription to get more features.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {plans.map((plan) => (
                      <Card key={plan._id} className={`relative flex flex-col ${user?.subscription?.plan === plan.name ? 'border-primary ring-1 ring-primary' : 'border-border/50 hover-elevate'}`}>
                        {user?.subscription?.plan === plan.name && (
                          <div className="absolute top-0 right-0 p-2">
                            <Badge variant="default">Current</Badge>
                          </div>
                        )}
                        <CardHeader>
                          <CardTitle>{plan.name}</CardTitle>
                          <div className="mt-4 flex items-baseline text-3xl font-bold">
                            ₹{plan.price}
                            <span className="ml-1 text-sm font-normal text-muted-foreground">/{plan.duration}</span>
                          </div>
                          <CardDescription className="mt-2">{plan.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1">
                          <ul className="space-y-2 text-sm">
                            {plan.features.map((feature, i) => (
                              <li key={i} className="flex items-center">
                                <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                                {feature}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                        <CardFooter>
                          <Button 
                            className="w-full" 
                            variant={user?.subscription?.plan === plan.name ? "outline" : "default"}
                          >
                            {user?.subscription?.plan === plan.name ? "Renew Plan" : "Select Plan"}
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "profile" && (
            <div className="p-6 space-y-6">
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <UserCog className="h-8 w-8 text-primary" />
                  Profile & Settings
                </h1>
                <p className="text-muted-foreground">Manage your account information, security, and platform preferences.</p>
              </div>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle>Logo & Branding</CardTitle>
                  <CardDescription>Upload your company logo for white-label reports.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-6">
                    <Avatar className="h-24 w-24 border">
                      <AvatarImage src={user?.logoUrl} />
                      <AvatarFallback><Building className="h-12 w-12" /></AvatarFallback>
                    </Avatar>
                    <div className="space-y-2">
                      <Input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleLogoUpload}
                        disabled={isUploading}
                        className="max-w-xs"
                      />
                      <p className="text-xs text-muted-foreground">Recommended size: 200x200px. Max 2MB.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="account" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="account">Profile</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                  <TabsTrigger value="security">Security</TabsTrigger>
                </TabsList>
                
                <TabsContent value="account" className="space-y-4 pt-4">
                  <Card className="border-border/50">
                    <CardHeader>
                      <CardTitle>Account Information</CardTitle>
                      <CardDescription>Update your personal and company details.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleUpdateProfile} className="space-y-4">
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
                          <Label>Email</Label>
                          <Input value={profileForm.email} disabled className="bg-muted" />
                        </div>
                        <div className="space-y-2">
                          <Label>Phone</Label>
                          <Input value={profileForm.phone} onChange={e => setProfileForm({...profileForm, phone: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                          <Label>Company Name</Label>
                          <Input value={profileForm.companyName} onChange={e => setProfileForm({...profileForm, companyName: e.target.value})} />
                        </div>
                        <Button type="submit" disabled={isSaving}>
                          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Update Profile
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  <Card className="border-border/50 overflow-hidden group">
                    <CardHeader className="bg-primary/5 border-b border-primary/10">
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text-xl">Subscription Status</CardTitle>
                          <CardDescription>Current plan: {user?.subscription?.plan}</CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
                          {user?.subscription?.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Credits Used</span>
                            <span className="font-medium">{user?.subscription?.creditsUsed} / {user?.subscription?.monthlyCallCredits}</span>
                          </div>
                          <Progress value={(user?.subscription?.creditsUsed || 0) / (user?.subscription?.monthlyCallCredits || 1) * 100} className="h-2" />
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CalendarIcon className="h-4 w-4" />
                            <span>Renewal Date: {user?.subscription?.renewalDate ? new Date(user?.subscription?.renewalDate).toLocaleDateString() : "Next billing cycle"}</span>
                          </div>
                        </div>
                        <div className="flex flex-col justify-center gap-3">
                          <Button className="w-full" onClick={() => setActiveTab("billing")}>
                            <CreditCard className="mr-2 h-4 w-4" />
                            Manage Billing & Usage
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="settings" className="space-y-4 pt-4">
                  <Card className="border-border/50">
                    <CardHeader>
                      <CardTitle>Platform Settings</CardTitle>
                      <CardDescription>Configure your dialer and notification preferences.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Do Not Disturb</Label>
                          <p className="text-sm text-muted-foreground">Pause all outgoing campaigns temporarily.</p>
                        </div>
                        <Switch checked={dndEnabled} onCheckedChange={(val) => { setDndEnabled(val); handleUpdateSettings({ dndEnabled: val }); }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Local Presence Dialing</Label>
                          <p className="text-sm text-muted-foreground">Show local area codes to increase answer rates.</p>
                        </div>
                        <Switch checked={localPresence} onCheckedChange={(val) => { setLocalPresence(val); handleUpdateSettings({ localPresenceDialing: val }); }} />
                      </div>
                      <div className="space-y-2">
                        <Label>Daily Call Limit</Label>
                        <Input type="number" value={callLimit} onChange={(e) => { setCallLimit(parseInt(e.target.value)); handleUpdateSettings({ dailyCallLimit: parseInt(e.target.value) }); }} />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="security" className="space-y-4 pt-4">
                  <Card className="border-border/50">
                    <CardHeader>
                      <CardTitle>Change Password</CardTitle>
                      <CardDescription>Ensure your account remains secure.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleChangePassword} className="space-y-4">
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
                        <Button type="submit" disabled={isSaving}>
                          {isSaving ? "Updating..." : "Update Password"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {activeTab === "billing" && (
            <div className="p-6 space-y-6">
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <Wallet className="h-8 w-8 text-primary" />
                  Billing & Usage
                </h1>
                <p className="text-muted-foreground">Manage your subscription, view credits, and track usage.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-border/50 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Available Credits</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">₹{(user?.subscription?.monthlyCallCredits || 0).toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground mt-1">Prepaid balance for all services</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-orange-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Consumption</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">₹{(user?.subscription?.creditsUsed || 0).toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground mt-1">Used in current cycle</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-green-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Active Plan</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{user?.subscription?.plan}</div>
                    <p className="text-xs text-muted-foreground mt-1">Status: {user?.subscription?.status}</p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle>Available Plans</CardTitle>
                  <CardDescription>Upgrade or renew your subscription to get more features.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {plans.map((plan) => (
                      <Card key={plan._id} className={`relative flex flex-col ${user?.subscription?.plan === plan.name ? 'border-primary ring-1 ring-primary' : 'border-border/50 hover-elevate'}`}>
                        {user?.subscription?.plan === plan.name && (
                          <div className="absolute top-0 right-0 p-2">
                            <Badge variant="default">Current</Badge>
                          </div>
                        )}
                        <CardHeader>
                          <CardTitle>{plan.name}</CardTitle>
                          <div className="mt-4 flex items-baseline text-3xl font-bold">
                            ₹{plan.price}
                            <span className="ml-1 text-sm font-normal text-muted-foreground">/{plan.duration}</span>
                          </div>
                          <CardDescription className="mt-2">{plan.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1">
                          <ul className="space-y-2 text-sm">
                            {plan.features.map((feature, i) => (
                              <li key={i} className="flex items-center">
                                <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                                {feature}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                        <CardFooter>
                          <Button 
                            className="w-full" 
                            variant={user?.subscription?.plan === plan.name ? "outline" : "default"}
                          >
                            {user?.subscription?.plan === plan.name ? "Renew Plan" : "Select Plan"}
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ... Remaining components for other tabs (campaigns, knowledge base, etc) ... */}
        </div>
      </main>
    </div>
  );
}
