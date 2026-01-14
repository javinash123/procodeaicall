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
    { label: "Bulk WhatsApp", value: "0", change: "0%", icon: MessageCircle, tab: "bulk-whatsapp" },
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

  const adminNavItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "admin-users", label: "User Management", icon: Users },
    { id: "plans", label: "Plans", icon: CreditCard },
    { id: "profile", label: "Profile", icon: UserCog },
  ];

  const displayNavItems = isAdmin ? adminNavItems : navItems;

  // Handle sidebar navigation
  const handleNavClick = (tabId: string) => {
    if (tabId === "plans") {
      setLocation("/admin/plans");
    } else {
      setActiveTab(tabId);
    }
  };

  // Sidebar Component
  const Sidebar = () => (
    <div className="w-64 border-r bg-card flex flex-col h-full overflow-hidden shrink-0">
      <div className="p-6 border-b">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-xl tracking-tight">AI Agent</span>
        </div>
      </div>
      <ScrollArea className="flex-1 py-4">
        <div className="px-3 space-y-1">
          {displayNavItems.map((item) => (
            <Button
              key={item.id}
              variant={activeTab === item.id ? "secondary" : "ghost"}
              className="w-full justify-start gap-3 h-10 px-3 hover-elevate"
              onClick={() => handleNavClick(item.id)}
            >
              <item.icon className={`w-4 h-4 ${activeTab === item.id ? "text-primary" : "text-muted-foreground"}`} />
              <span className="font-medium">{item.label}</span>
            </Button>
          ))}
        </div>
      </ScrollArea>
      <div className="p-4 border-t mt-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-3 h-12 hover-elevate px-2">
              <Avatar className="h-8 w-8 border">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start overflow-hidden">
                <span className="text-sm font-semibold truncate w-full">{user?.firstName} {user?.lastName}</span>
                <span className="text-xs text-muted-foreground truncate w-full">{user?.email}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setActiveTab("profile")}>
              <User className="mr-2 h-4 w-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => logout()}>
              <LogOut className="mr-2 h-4 w-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

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
      await usersApi.update(user._id, { password: passwordForm.new });
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
      await usersApi.uploadLogo(user._id, file);
      toast({ title: "Logo uploaded successfully!" });
      if (refetchUser) await refetchUser();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error uploading logo", description: error.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateSettings = async (updates: Partial<any>) => {
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
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b flex items-center justify-between px-8 shrink-0 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold capitalize">
              {activeTab.replace("admin-", "").replace("-", " ")}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-secondary rounded-full text-xs font-medium">
              <Shield className="w-3 h-3 text-primary" />
              <span>{isAdmin ? "Administrator" : user?.subscription?.plan || "Free Plan"}</span>
            </div>
            <Button variant="ghost" size="icon" className="relative hover-elevate">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full border-2 border-background"></span>
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-8 pb-12">
              {activeTab === "overview" && (
                <div className="space-y-8">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {stats.map((stat, i) => (
                      <Card key={i} className="hover-elevate cursor-pointer transition-all border-none shadow-sm bg-card/50" onClick={() => handleNavClick(stat.tab)}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                          <stat.icon className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{stat.value}</div>
                          {(stat as any).change && (
                            <p className={`text-xs mt-1 ${(stat as any).change.startsWith("+") ? "text-green-500" : "text-destructive"}`}>
                              {(stat as any).change} <span className="text-muted-foreground ml-1">from last month</span>
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Activity Chart */}
                    <Card className="border-none shadow-sm bg-card/50">
                      <CardHeader>
                        <div className="flex justify-between items-center">
                          <div>
                            <CardTitle>Daily Call Activity</CardTitle>
                            <CardDescription>Monitor calling performance</CardDescription>
                          </div>
                          {isAdmin && (
                            <Select value={callActivityCampaignFilter} onValueChange={setCallActivityCampaignFilter}>
                              <SelectTrigger className="w-[180px] h-8 text-xs">
                                <SelectValue placeholder="All Campaigns" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Campaigns</SelectItem>
                                {campaigns.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={[
                            { day: "Mon", calls: 12 },
                            { day: "Tue", calls: 19 },
                            { day: "Wed", calls: 15 },
                            { day: "Thu", calls: 22 },
                            { day: "Fri", calls: 30 },
                            { day: "Sat", calls: 8 },
                            { day: "Sun", calls: 5 },
                          ]}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="day" axisLine={false} tickLine={false} />
                            <YAxis axisLine={false} tickLine={false} />
                            <RechartsTooltip />
                            <Line type="monotone" dataKey="calls" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* Status Chart */}
                    <Card className="border-none shadow-sm bg-card/50">
                      <CardHeader>
                        <div className="flex justify-between items-center">
                          <div>
                            <CardTitle>Lead Status</CardTitle>
                            <CardDescription>Distribution across stages</CardDescription>
                          </div>
                          {isAdmin && (
                            <div className="flex gap-2">
                              <Select value={selectedAdminPieMonth.toString()} onValueChange={(v) => setSelectedAdminPieMonth(parseInt(v))}>
                                <SelectTrigger className="w-[100px] h-8 text-xs">
                                  <SelectValue placeholder="Month" />
                                </SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: 12 }, (_, i) => (
                                    <SelectItem key={i} value={i.toString()}>{new Date(2024, i).toLocaleString('default', { month: 'short' })}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: "New", value: leads.filter(l => l.status === "New").length || 400 },
                                { name: "Interested", value: leads.filter(l => l.status === "Interested").length || 300 },
                                { name: "In Progress", value: leads.filter(l => l.status === "In Progress").length || 300 },
                                { name: "Closed", value: leads.filter(l => l.status === "Closed").length || 200 },
                              ]}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              <Cell fill="hsl(var(--primary))" />
                              <Cell fill="#10b981" />
                              <Cell fill="#f59e0b" />
                              <Cell fill="#ef4444" />
                            </Pie>
                            <RechartsTooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>

                  {isAdmin && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <Card className="border-none shadow-sm bg-card/50 col-span-2">
                        <CardHeader>
                          <div className="flex justify-between items-center">
                            <div>
                              <CardTitle>Revenue Trends</CardTitle>
                              <CardDescription>Monthly subscription revenue</CardDescription>
                            </div>
                            <Select value={selectedAdminRevenueYear.toString()} onValueChange={(v) => setSelectedAdminRevenueYear(parseInt(v))}>
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
                        <CardContent className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={[
                              { month: "Jan", revenue: 45000 },
                              { month: "Feb", revenue: 52000 },
                              { month: "Mar", revenue: 48000 },
                              { month: "Apr", revenue: 61000 },
                              { month: "May", revenue: 55000 },
                              { month: "Jun", revenue: 67000 },
                            ]}>
                              <defs>
                                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                              <XAxis dataKey="month" axisLine={false} tickLine={false} />
                              <YAxis axisLine={false} tickLine={false} />
                              <RechartsTooltip />
                              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorRev)" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                      <Card className="border-none shadow-sm bg-card/50">
                        <CardHeader>
                          <CardTitle>Recent Users</CardTitle>
                          <CardDescription>Newly registered customers</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {registeredUsers.slice(0, 5).map((u, i) => (
                              <div key={i} className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">
                                    {u.firstName?.[0]}{u.lastName?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 overflow-hidden">
                                  <p className="text-sm font-medium truncate">{u.firstName} {u.lastName}</p>
                                  <p className="text-xs text-muted-foreground truncate">{u.subscription?.plan || "No Plan"}</p>
                                </div>
                                <Badge variant="outline" className="text-[10px]">{u.subscription?.status}</Badge>
                              </div>
                            ))}
                            <Button variant="ghost" className="w-full text-xs mt-4" onClick={() => setActiveTab("admin-users")}>
                              View All Users
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "profile" && (
                <div className="space-y-6">
                  <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                      <UserCog className="h-8 w-8 text-primary" />
                      Profile & Settings
                    </h1>
                    <p className="text-muted-foreground">Manage account info and preferences.</p>
                  </div>

                  <Card className="border-border/50">
                    <CardHeader>
                      <CardTitle>Account Information</CardTitle>
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
                        <Button type="submit" disabled={isSaving}>Update Profile</Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}
