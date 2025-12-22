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
  Megaphone
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { leadsApi, campaignsApi, appointmentsApi, usersApi, settingsApi, uploadApi, notesApi, type UploadedFile } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { Lead, Campaign, Appointment, User as UserType, KnowledgeBaseFile } from "@shared/schema";
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
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import dashboardImage from "@assets/generated_images/futuristic_dashboard_interface_mockup_glowing_in_orange..png";

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
  const { user, logout, loading: authLoading } = useAuth();
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

  // Call/SMS Confirmation State
  const [callConfirm, setCallConfirm] = useState<{ leadId: string; type: "call" | "sms" } | null>(null);

  // Stats derived from data
  const stats = [
    { label: "Total Leads", value: leads.length.toString(), change: "+12.5%", icon: PhoneCall },
    { label: "Active Campaigns", value: campaigns.filter(c => c.status === "Active").length.toString(), change: "+4.2%", icon: CheckCircle2 },
    { label: "Appointments", value: appointments.length.toString(), change: "-1.1%", icon: Clock },
    { label: "Pipeline Value", value: `$${(leads.length * 500).toLocaleString()}`, change: "+18.2%", icon: ArrowUpRight },
  ];

  // Fetch data on mount
  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [leadsData, campaignsData, appointmentsData, notesData] = await Promise.all([
          leadsApi.getAll(),
          campaignsApi.getAll(),
          appointmentsApi.getAll(),
          notesApi.getAll()
        ]);
        setLeads(leadsData);
        setCampaigns(campaignsData);
        setAppointments(appointmentsData);
        setNotes(notesData);

        // Admin: fetch all users
        if (isAdmin) {
          const usersData = await usersApi.getAll();
          setRegisteredUsers(usersData);
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
      setLocation("/login");
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

  const validateCampaign = (data: typeof newCampaign): boolean => {
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
      // Add campaign name for display if campaign was selected
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
      // Add campaign name for display
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

  // Log activity for lead
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
      
      // Update local state
      const updatedLead = {
        ...selectedLead,
        history: [...(selectedLead.history || []), historyItem] as typeof selectedLead.history,
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

  // Schedule meeting from lead
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

  // Add appointment
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

  // Edit appointment
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

  // Update appointment
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

  // Delete appointment
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

  // Calendar navigation
  const goToPreviousMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCalendarDate(new Date());
  };

  // Calendar helpers
  const getCalendarDays = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days: { day: number; isCurrentMonth: boolean; date: string }[] = [];
    
    // Previous month filler days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      days.push({ 
        day: d, 
        isCurrentMonth: false, 
        date: `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` 
      });
    }
    
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ 
        day: d, 
        isCurrentMonth: true, 
        date: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` 
      });
    }
    
    // Next month filler days
    const remainingDays = 42 - days.length; // 6 rows * 7 days
    for (let d = 1; d <= remainingDays; d++) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      days.push({ 
        day: d, 
        isCurrentMonth: false, 
        date: `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` 
      });
    }
    
    return days;
  };

  const isToday = (dateStr: string) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return dateStr === todayStr;
  };

  const formatMonthYear = () => {
    return calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // File upload handlers
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const uploadedFiles = await uploadApi.uploadFiles(Array.from(files));
      if (isEdit) {
        setEditCampaignForm(prev => ({
          ...prev,
          knowledgeBaseFiles: [...prev.knowledgeBaseFiles, ...uploadedFiles]
        }));
      } else {
        setNewCampaign(prev => ({
          ...prev,
          knowledgeBaseFiles: [...prev.knowledgeBaseFiles, ...uploadedFiles]
        }));
      }
      toast({ title: `${uploadedFiles.length} file(s) uploaded successfully!` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error uploading files", description: error.message });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveFile = async (fileId: string, fileUrl: string, isEdit: boolean) => {
    try {
      const filename = fileUrl.split("/").pop();
      if (filename) {
        await uploadApi.deleteFile(filename);
      }
      if (isEdit) {
        setEditCampaignForm(prev => ({
          ...prev,
          knowledgeBaseFiles: prev.knowledgeBaseFiles.filter(f => f.id !== fileId)
        }));
      } else {
        setNewCampaign(prev => ({
          ...prev,
          knowledgeBaseFiles: prev.knowledgeBaseFiles.filter(f => f.id !== fileId)
        }));
      }
      toast({ title: "File removed" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error removing file", description: error.message });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getFileIcon = (type: string) => {
    if (type.includes("pdf")) return <FileText className="h-5 w-5 text-red-500" />;
    if (type.includes("word") || type.includes("document")) return <File className="h-5 w-5 text-blue-500" />;
    if (type.includes("image")) return <File className="h-5 w-5 text-green-500" />;
    return <File className="h-5 w-5 text-gray-500" />;
  };

  const handleCreateCampaign = async () => {
    if (!user) return;
    if (!validateCampaign(newCampaign)) return;
    
    setIsSaving(true);
    try {
      const campaign = await campaignsApi.create({
        userId: user._id,
        name: newCampaign.name.trim(),
        goal: newCampaign.goal,
        script: newCampaign.script.trim(),
        voice: newCampaign.voice,
        additionalContext: newCampaign.additionalContext.trim(),
        callingHours: newCampaign.callingHours,
        knowledgeBaseFiles: newCampaign.knowledgeBaseFiles as any,
        status: "Draft"
      });
      setCampaigns([campaign, ...campaigns]);
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
      setCampaignTab("basics");
      toast({ title: "Campaign created successfully!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error creating campaign", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditCampaign = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setEditCampaignForm({
      name: campaign.name,
      goal: campaign.goal,
      script: campaign.script || "",
      voice: campaign.voice || "Rachel (American)",
      additionalContext: campaign.additionalContext || "",
      callingHours: campaign.callingHours || { start: "09:00", end: "17:00" },
      status: campaign.status,
      knowledgeBaseFiles: (campaign.knowledgeBaseFiles || []) as UploadedFile[],
      startDate: campaign.startDate || "",
      endDate: campaign.endDate || ""
    });
    setCampaignErrors({});
    setCampaignTab("basics");
    setIsEditCampaignOpen(true);
  };

  const handleUpdateCampaign = async () => {
    if (!selectedCampaign) return;
    if (!validateCampaign(editCampaignForm)) return;
    
    setIsSaving(true);
    try {
      const updated = await campaignsApi.update(selectedCampaign._id, {
        name: editCampaignForm.name.trim(),
        goal: editCampaignForm.goal,
        script: editCampaignForm.script.trim(),
        voice: editCampaignForm.voice,
        additionalContext: editCampaignForm.additionalContext.trim(),
        callingHours: editCampaignForm.callingHours,
        knowledgeBaseFiles: editCampaignForm.knowledgeBaseFiles as any,
        status: editCampaignForm.status
      });
      setCampaigns(campaigns.map(c => c._id === selectedCampaign._id ? updated : c));
      setIsEditCampaignOpen(false);
      setCampaignErrors({});
      toast({ title: "Campaign updated successfully!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error updating campaign", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleCampaignStatus = async (campaign: Campaign) => {
    const newStatus = campaign.status === "Active" ? "Paused" : "Active";
    setIsSaving(true);
    try {
      const updated = await campaignsApi.update(campaign._id, { status: newStatus });
      setCampaigns(campaigns.map(c => c._id === campaign._id ? updated : c));
      toast({ title: `Campaign ${newStatus === "Active" ? "resumed" : "paused"}!` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error updating campaign", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteCampaign = (campaign: Campaign) => {
    setDeleteConfirm({ type: "campaign", id: campaign._id, name: campaign.name });
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

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await settingsApi.update({
        dailyCallLimit: callLimit,
        dndEnabled,
        localPresenceDialing: localPresence
      });
      toast({ title: "Settings saved!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error saving settings", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await settingsApi.update(profileForm);
      toast({ title: "Profile updated!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error updating profile", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user) return;
    if (passwordForm.new !== passwordForm.confirm) {
      toast({ variant: "destructive", title: "Passwords don't match" });
      return;
    }
    setIsSaving(true);
    try {
      await settingsApi.changePassword(user._id, passwordForm.current, passwordForm.new);
      setPasswordForm({ current: "", new: "", confirm: "" });
      toast({ title: "Password changed successfully!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error changing password", description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  // Show loading state
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const SidebarItem = ({ icon: Icon, label, id }: { icon: any, label: string, id: string }) => (
    <button 
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all ${activeTab === id ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-sidebar p-4 sticky top-0 h-screen">
        <div className="flex items-center gap-2 px-2 mb-8 mt-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Phone className="h-4 w-4" />
          </div>
          <span className="text-xl font-bold tracking-tight">NIJVOX</span>
        </div>

        <div className="space-y-1 flex-1">
          <SidebarItem icon={LayoutDashboard} label="Overview" id="overview" />
          
          {isAdmin ? (
            <>
              <SidebarItem icon={Users} label="SaaS Management" id="saas" />
            </>
          ) : (
            <>
              <SidebarItem icon={Users} label="CRM / Leads" id="crm" />
              <SidebarItem icon={History} label="Call History" id="callhistory" />
              <SidebarItem icon={Phone} label="Campaigns" id="campaigns" />
              <SidebarItem icon={MessageSquare} label="Bulk SMS" id="sms" />
              <SidebarItem icon={Calendar} label="Calendar" id="calendar" />
            </>
          )}
        </div>

        <div className="mt-auto pt-4 border-t">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-3 px-2 py-2 mb-2 cursor-pointer hover:bg-muted rounded-md transition-colors">
                <Avatar className="h-8 w-8">
                  <AvatarImage src="" />
                  <AvatarFallback>{user.firstName?.[0]}{user.lastName?.[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden text-left">
                  <div className="text-sm font-medium truncate">{user.firstName} {user.lastName}</div>
                  <div className="text-xs text-muted-foreground truncate">{user.email}</div>
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
        {/* Header */}
        <header className="h-16 border-b flex items-center justify-between px-6 bg-background/50 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-4 w-full max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder={isAdmin ? "Search users..." : "Search leads, campaigns..."} className="pl-9 bg-muted/20 border-none focus-visible:ring-1" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
            </Button>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 p-6 overflow-auto">
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                  <Card key={i} className="hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                      <stat.icon className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{stat.value}</div>
                      <p className={`text-xs ${stat.change.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                        {stat.change} from last week
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Recent Logs - Last 50 Records */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Logs</CardTitle>
                  <CardDescription>Last 50 lead records</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead className="text-right">Last Interaction</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leads.slice(0, 50).map((lead) => (
                        <TableRow key={lead._id}>
                          <TableCell className="font-medium">{lead.name}</TableCell>
                          <TableCell>
                            <Badge variant={lead.status === 'Interested' ? 'default' : 'secondary'} className={lead.status === 'Interested' ? 'bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/25 border-none' : ''}>
                              {lead.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{lead.outcome}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatTimeAgo(lead.lastContact)}</TableCell>
                        </TableRow>
                      ))}
                      {leads.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No leads yet.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Lead Status Distribution Pie Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Lead Status Distribution</CardTitle>
                    <CardDescription>Total leads by status</CardDescription>
                  </CardHeader>
                  <CardContent className="h-80 flex items-center justify-center">
                    {leads.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: "New", value: leads.filter(l => l.status === "New").length },
                              { name: "Interested", value: leads.filter(l => l.status === "Interested").length },
                              { name: "Follow Up", value: leads.filter(l => l.status === "Follow Up").length },
                              { name: "In Progress", value: leads.filter(l => l.status === "In Progress").length },
                              { name: "Closed", value: leads.filter(l => l.status === "Closed").length },
                              { name: "Unqualified", value: leads.filter(l => l.status === "Unqualified").length }
                            ]}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            <Cell fill="#3b82f6" />
                            <Cell fill="#10b981" />
                            <Cell fill="#f59e0b" />
                            <Cell fill="#8b5cf6" />
                            <Cell fill="#ef4444" />
                            <Cell fill="#6b7280" />
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-muted-foreground text-center">No data available</div>
                    )}
                  </CardContent>
                </Card>

                {/* Last 12 Months Lead Counts */}
                <Card>
                  <CardHeader>
                    <CardTitle>Lead Trends (12 Months)</CardTitle>
                    <CardDescription>Monthly lead count</CardDescription>
                  </CardHeader>
                  <CardContent className="h-80 flex items-center justify-center">
                    {leads.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={
                          Array.from({ length: 12 }, (_, i) => {
                            const date = new Date();
                            date.setMonth(date.getMonth() - (11 - i));
                            const monthLeads = leads.filter(l => {
                              const leadDate = new Date(l.createdAt);
                              return leadDate.getMonth() === date.getMonth() && leadDate.getFullYear() === date.getFullYear();
                            }).length;
                            return {
                              month: date.toLocaleDateString('en-US', { month: 'short' }),
                              leads: monthLeads
                            };
                          })
                        }>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip />
                          <Line type="monotone" dataKey="leads" stroke="#3b82f6" />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-muted-foreground text-center">No data available</div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Notes Section */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Notes</CardTitle>
                    <CardDescription>All your saved notes</CardDescription>
                  </div>
                  <Dialog open={isAddNoteOpen} onOpenChange={setIsAddNoteOpen}>
                    <DialogTrigger asChild>
                      <Button><Plus className="mr-2 h-4 w-4" /> Add Note</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                      <DialogHeader>
                        <DialogTitle>Add Note</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="note-title">Title</Label>
                          <Input id="note-title" placeholder="Note title" value={noteForm.title} onChange={(e) => setNoteForm({...noteForm, title: e.target.value})} data-testid="input-note-title" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="note-content">Content</Label>
                          <Textarea id="note-content" placeholder="Note content" className="min-h-32" value={noteForm.content} onChange={(e) => setNoteForm({...noteForm, content: e.target.value})} data-testid="input-note-content" />
                        </div>
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
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm">{note.title}</h4>
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{note.content}</p>
                              <p className="text-xs text-muted-foreground mt-2">{new Date(note.createdAt).toLocaleDateString()}</p>
                            </div>
                            <div className="flex gap-1">
                              <Dialog open={isEditNoteOpen && selectedNote?._id === note._id} onOpenChange={(open) => { if (!open) { setSelectedNote(null); setNoteForm({title: "", content: ""}); } setIsEditNoteOpen(open); }}>
                                <DialogTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setSelectedNote(note); setNoteForm({title: note.title, content: note.content}); }} data-testid={`button-edit-note-${note._id}`}><Edit3 className="h-4 w-4" /></Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[500px]">
                                  <DialogHeader>
                                    <DialogTitle>Edit Note</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div className="space-y-2">
                                      <Label htmlFor="edit-note-title">Title</Label>
                                      <Input id="edit-note-title" placeholder="Note title" value={noteForm.title} onChange={(e) => setNoteForm({...noteForm, title: e.target.value})} />
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor="edit-note-content">Content</Label>
                                      <Textarea id="edit-note-content" placeholder="Note content" className="min-h-32" value={noteForm.content} onChange={(e) => setNoteForm({...noteForm, content: e.target.value})} />
                                    </div>
                                  </div>
                                  <DialogFooter>
                                    <Button variant="outline" onClick={() => { setIsEditNoteOpen(false); setSelectedNote(null); setNoteForm({title: "", content: ""}); }}>Cancel</Button>
                                    <Button onClick={async () => { if (selectedNote && noteForm.title.trim() && noteForm.content.trim()) { const updated = await notesApi.update(selectedNote._id, noteForm); setNotes(notes.map(n => n._id === selectedNote._id ? updated : n)); setNoteForm({title: "", content: ""}); setIsEditNoteOpen(false); setSelectedNote(null); toast({title: "Success", description: "Note updated successfully"}); } }}>Update Note</Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={async () => { if (confirm("Delete this note?")) { await notesApi.delete(note._id); setNotes(notes.filter(n => n._id !== note._id)); toast({title: "Success", description: "Note deleted"}); } }} data-testid={`button-delete-note-${note._id}`}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center text-muted-foreground py-8">No notes yet. Create one to get started!</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Daily Calling Counts with Month/Year Filter */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Daily Call Activity</CardTitle>
                      <CardDescription>Calling counts by day</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Select value={selectedChartMonth.toString()} onValueChange={(val) => setSelectedChartMonth(parseInt(val))}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => (
                            <SelectItem key={i} value={i.toString()}>
                              {new Date(2024, i).toLocaleDateString('en-US', { month: 'long' })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={selectedChartYear.toString()} onValueChange={(val) => setSelectedChartYear(parseInt(val))}>
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 5 }, (_, i) => {
                            const year = new Date().getFullYear() - i;
                            return <SelectItem key={year} value={year.toString()}>{year}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="h-80 flex items-center justify-center">
                  {leads.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={
                        Array.from({ length: new Date(selectedChartYear, selectedChartMonth + 1, 0).getDate() }, (_, i) => {
                          const day = i + 1;
                          const callsCount = leads.reduce((acc, lead) => {
                            const historyForDay = (lead.history || []).filter(h => {
                              const hDate = new Date(h.date);
                              return h.type === 'call' && hDate.getDate() === day && hDate.getMonth() === selectedChartMonth && hDate.getFullYear() === selectedChartYear;
                            }).length;
                            return acc + historyForDay;
                          }, 0);
                          return {
                            day: `Day ${day}`,
                            calls: callsCount
                          };
                        })
                      }>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="calls" stroke="#10b981" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-muted-foreground text-center">No data available</div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Admin: SaaS Management */}
          {activeTab === "saas" && isAdmin && (
            <div className="space-y-6">
               <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">SaaS Management</h1>
                <Button><Plus className="mr-2 h-4 w-4" /> Invite User</Button>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Registered Users</CardTitle>
                  <CardDescription>Manage all registered users on the platform.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Joined</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registeredUsers.map((u) => (
                        <TableRow key={u._id}>
                          <TableCell className="font-medium">{u.firstName} {u.lastName}</TableCell>
                          <TableCell>{u.email}</TableCell>
                          <TableCell><Badge variant="outline">{u.subscription?.plan || "Free"}</Badge></TableCell>
                          <TableCell>
                            <Badge variant={u.subscription?.status === 'Active' ? 'default' : 'destructive'}>{u.subscription?.status || "Inactive"}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right">
                             <Button variant="ghost" size="icon"><Settings className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {registeredUsers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No registered users yet.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* User: Campaigns */}
          {activeTab === "campaigns" && !isAdmin && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Search campaigns..." 
                    className="w-64"
                    value={campaignSearch}
                    onChange={(e) => setCampaignSearch(e.target.value)}
                    data-testid="input-campaign-search"
                  />
                  <Dialog open={isCreateCampaignOpen} onOpenChange={setIsCreateCampaignOpen}>
                    <DialogTrigger asChild>
                      <Button><Plus className="mr-2 h-4 w-4" /> Create Campaign</Button>
                    </DialogTrigger>
                  <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col p-0 gap-0">
                    <DialogHeader className="px-6 py-4 border-b">
                      <DialogTitle>Create AI Campaign</DialogTitle>
                      <DialogDescription>
                        Configure your AI agent and knowledge base for this campaign.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-y-auto">
                      <Tabs defaultValue="basics" className="w-full">
                        <div className="px-6 pt-4">
                          <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="basics">Basics</TabsTrigger>
                            <TabsTrigger value="knowledge">AI Knowledge</TabsTrigger>
                            <TabsTrigger value="config">Configuration</TabsTrigger>
                          </TabsList>
                        </div>
                        
                        <div className="p-6">
                          <TabsContent value="basics" className="mt-0 space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="camp-name">Campaign Name <span className="text-destructive">*</span></Label>
                              <Input id="camp-name" placeholder="e.g., Summer Outreach 2024" value={newCampaign.name} onChange={(e) => setNewCampaign({...newCampaign, name: e.target.value})} className={campaignErrors.name ? "border-destructive" : ""} />
                              {campaignErrors.name && <p className="text-xs text-destructive">{campaignErrors.name}</p>}
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="camp-goal">Campaign Goal <span className="text-destructive">*</span></Label>
                              <Select value={newCampaign.goal} onValueChange={(value: "sales" | "support" | "survey" | "appointment") => setNewCampaign({...newCampaign, goal: value})}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a goal" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="sales">Sales / Cold Call</SelectItem>
                                  <SelectItem value="support">Customer Support</SelectItem>
                                  <SelectItem value="survey">Survey / Feedback</SelectItem>
                                  <SelectItem value="appointment">Appointment Setting</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="camp-script">Initial Script / Opening <span className="text-destructive">*</span></Label>
                              <Textarea id="camp-script" placeholder="Hi, this is Alex from NIJVOX. I'm calling about..." className={`h-32 ${campaignErrors.script ? "border-destructive" : ""}`} value={newCampaign.script} onChange={(e) => setNewCampaign({...newCampaign, script: e.target.value})} />
                              {campaignErrors.script && <p className="text-xs text-destructive">{campaignErrors.script}</p>}
                            </div>
                          </TabsContent>

                          <TabsContent value="knowledge" className="mt-0 space-y-6">
                            <div className="space-y-4">
                              <div className="bg-muted/30 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:bg-muted/50 transition-colors cursor-pointer relative">
                                <input
                                  type="file"
                                  multiple
                                  accept=".pdf,.doc,.docx,.txt,image/*"
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  onChange={(e) => handleFileUpload(e, false)}
                                  disabled={isUploading}
                                />
                                {isUploading ? (
                                  <Loader2 className="mx-auto h-10 w-10 text-muted-foreground mb-4 animate-spin" />
                                ) : (
                                  <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
                                )}
                                <h3 className="font-semibold text-lg">{isUploading ? "Uploading..." : "Upload Training Documents"}</h3>
                                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                                  Click or drag PDF, DOCX, TXT, or images here to train the AI.
                                </p>
                                <Button variant="outline" className="mt-4" disabled={isUploading}>Select Files</Button>
                              </div>

                              {newCampaign.knowledgeBaseFiles.length > 0 && (
                                <div className="space-y-2">
                                  <Label className="text-base">Uploaded Knowledge Base ({newCampaign.knowledgeBaseFiles.length} files)</Label>
                                  <div className="space-y-2">
                                    {newCampaign.knowledgeBaseFiles.map((file) => (
                                      <div key={file.id} className="flex items-center justify-between p-3 border rounded-md bg-card">
                                        <div className="flex items-center gap-3">
                                          {getFileIcon(file.type)}
                                          <div>
                                            <div className="font-medium">{file.name}</div>
                                            <div className="text-xs text-muted-foreground">{formatFileSize(file.size)}</div>
                                          </div>
                                        </div>
                                        <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                          onClick={() => handleRemoveFile(file.id, file.url, false)}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="space-y-2">
                                <Label htmlFor="kb-text">Additional Context (Text)</Label>
                                <Textarea id="kb-text" placeholder="Paste FAQs, objection handling scripts, or specific details here..." className="h-32" value={newCampaign.additionalContext} onChange={(e) => setNewCampaign({...newCampaign, additionalContext: e.target.value})} />
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="config" className="mt-0 space-y-4">
                            <div className="space-y-2">
                              <Label>AI Voice <span className="text-destructive">*</span></Label>
                              <div className="grid grid-cols-2 gap-4">
                                <div 
                                  className={`border rounded-md p-4 cursor-pointer hover:border-primary transition-colors ${newCampaign.voice === "Rachel (American)" ? "bg-primary/5 border-primary" : ""}`}
                                  onClick={() => setNewCampaign({...newCampaign, voice: "Rachel (American)"})}
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    <Mic className={`h-4 w-4 ${newCampaign.voice === "Rachel (American)" ? "text-primary" : ""}`} />
                                    <span className="font-medium">Rachel (American)</span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">Professional, warm, clear. Best for sales.</div>
                                </div>
                                <div 
                                  className={`border rounded-md p-4 cursor-pointer hover:border-primary transition-colors ${newCampaign.voice === "Drew (British)" ? "bg-primary/5 border-primary" : ""}`}
                                  onClick={() => setNewCampaign({...newCampaign, voice: "Drew (British)"})}
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    <Mic className={`h-4 w-4 ${newCampaign.voice === "Drew (British)" ? "text-primary" : ""}`} />
                                    <span className="font-medium">Drew (British)</span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">Sophisticated, calm. Best for support.</div>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Calling Hours <span className="text-destructive">*</span></Label>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Start Time</Label>
                                  <Input type="time" value={newCampaign.callingHours.start} onChange={(e) => setNewCampaign({...newCampaign, callingHours: {...newCampaign.callingHours, start: e.target.value}})} />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">End Time</Label>
                                  <Input type="time" value={newCampaign.callingHours.end} onChange={(e) => setNewCampaign({...newCampaign, callingHours: {...newCampaign.callingHours, end: e.target.value}})} />
                                </div>
                              </div>
                              {campaignErrors.callingHours && <p className="text-xs text-destructive">{campaignErrors.callingHours}</p>}
                            </div>
                            <div className="space-y-2">
                              <Label>Campaign Duration</Label>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Start Date</Label>
                                  <Input type="date" value={newCampaign.startDate} onChange={(e) => setNewCampaign({...newCampaign, startDate: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">End Date</Label>
                                  <Input type="date" value={newCampaign.endDate} onChange={(e) => setNewCampaign({...newCampaign, endDate: e.target.value})} />
                                </div>
                              </div>
                            </div>
                          </TabsContent>
                        </div>
                      </Tabs>
                    </div>

                    <DialogFooter className="px-6 py-4 border-t mt-auto">
                      <Button variant="outline" onClick={() => setIsCreateCampaignOpen(false)}>Cancel</Button>
                      <Button onClick={handleCreateCampaign} disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Create & Train AI
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

              <div className="grid gap-6">
                 {campaigns.filter(camp => camp.name.toLowerCase().includes(campaignSearch.toLowerCase())).map(camp => {
                   const campaignLeads = leads.filter(l => l.campaignId === camp._id).length;
                   return (
                   <Card key={camp._id} data-testid={`card-campaign-${camp._id}`}>
                     <CardHeader className="flex flex-row items-center justify-between pb-2">
                       <div className="space-y-1">
                         <CardTitle className="text-xl">{camp.name}</CardTitle>
                         <CardDescription>Goal: {camp.goal} • Voice: {camp.voice}</CardDescription>
                       </div>
                       <Badge variant={camp.status === 'Active' ? 'default' : 'secondary'}>{camp.status}</Badge>
                     </CardHeader>
                     <CardContent>
                       <div className="space-y-3">
                         <div className="grid grid-cols-3 gap-4 text-sm border-b pb-3">
                           <div>
                             <span className="text-muted-foreground">Start Date</span>
                             <div className="font-medium">{camp.startDate ? new Date(camp.startDate).toLocaleDateString() : '-'}</div>
                           </div>
                           <div>
                             <span className="text-muted-foreground">End Date</span>
                             <div className="font-medium">{camp.endDate ? new Date(camp.endDate).toLocaleDateString() : '-'}</div>
                           </div>
                           <div>
                             <span className="text-muted-foreground">Total Leads</span>
                             <div className="font-medium">{campaignLeads}</div>
                           </div>
                         </div>
                         <div className="flex justify-between text-sm">
                           <span>Progress</span>
                           <span className="font-medium">{camp.progress || 0}%</span>
                         </div>
                         <div className="h-2 rounded-full bg-muted overflow-hidden">
                           <div className="h-full bg-primary transition-all" style={{ width: `${camp.progress || 0}%` }} />
                         </div>
                         <div className="flex gap-4 text-sm text-muted-foreground mt-2">
                           <div className="flex items-center gap-1"><Phone className="h-4 w-4" /> {camp.callsMade || 0} Calls Made</div>
                           <div className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> {camp.goalsMet || 0} Goals Met</div>
                         </div>
                       </div>
                     </CardContent>
                     <CardFooter className="border-t pt-4 flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleToggleCampaignStatus(camp)}
                          disabled={isSaving}
                        >
                          {camp.status === 'Active' ? <><Clock className="mr-2 h-4 w-4" /> Pause</> : <><Play className="mr-2 h-4 w-4" /> Resume</>}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEditCampaign(camp)}>
                          <Settings className="mr-2 h-4 w-4" /> Edit Config
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => confirmDeleteCampaign(camp)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </Button>
                     </CardFooter>
                   </Card>
                   );
                 })}
                 {campaigns.length === 0 && (
                   <Card className="border-dashed">
                     <CardContent className="flex flex-col items-center justify-center py-12">
                       <BrainCircuit className="h-12 w-12 text-muted-foreground mb-4" />
                       <h3 className="font-semibold text-lg mb-2">No Campaigns Yet</h3>
                       <p className="text-muted-foreground text-center mb-4">Create your first AI calling campaign to start reaching leads automatically.</p>
                       <Button onClick={() => setIsCreateCampaignOpen(true)}><Plus className="mr-2 h-4 w-4" /> Create Campaign</Button>
                     </CardContent>
                   </Card>
                 )}
              </div>
            </div>
          )}

          {/* User: CRM */}
          {/* User: Call History */}
          {activeTab === "callhistory" && !isAdmin && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Call History</h1>
              </div>

              {/* Filters */}
              <div className="flex flex-col gap-4">
                <div className="flex gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-sm text-muted-foreground mb-2 block">Search by lead name</Label>
                    <Input placeholder="Search leads..." className="w-full" />
                  </div>
                  <div className="min-w-[200px]">
                    <Label className="text-sm text-muted-foreground mb-2 block">Campaign</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="All Campaigns" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Campaigns</SelectItem>
                        {campaigns.map(c => (
                          <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[200px]">
                    <Label className="text-sm text-muted-foreground mb-2 block">Start Date</Label>
                    <Input type="date" />
                  </div>
                  <div className="min-w-[200px]">
                    <Label className="text-sm text-muted-foreground mb-2 block">End Date</Label>
                    <Input type="date" />
                  </div>
                </div>
              </div>

              {/* Call History Table */}
              <Card>
                <CardContent className="p-0">
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
                              <TableCell>
                                {lead.campaignName ? (
                                  <Badge variant="secondary">{lead.campaignName}</Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm">{new Date(history.date).toLocaleString()}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{history.outcome}</Badge>
                              </TableCell>
                              <TableCell className="text-sm">{history.duration}</TableCell>
                              <TableCell>
                                <Button size="sm" variant="ghost"><Play className="h-4 w-4 mr-1" /> Play</Button>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setCallConfirm({ leadId: lead._id, type: "call" }); }}>
                                  <Phone className="h-4 w-4" />
                                </Button>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setCallConfirm({ leadId: lead._id, type: "sms" }); }}>
                                  <MessageSquare className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                      )}
                      {leads.flatMap(lead => (lead.history || []).filter(h => h.type === 'call')).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No call history yet.</TableCell>
                        </TableRow>
                      )}
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
                    <DialogTrigger asChild>
                      <Button><Plus className="mr-2 h-4 w-4" /> Add Lead</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New Lead</DialogTitle>
                        <DialogDescription>
                          Enter the details of the new prospect.
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleAddLead} className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label>
                            <Input id="name" placeholder="John Doe" value={newLead.name} onChange={e => setNewLead({...newLead, name: e.target.value})} className={leadErrors.name ? "border-destructive" : ""} />
                            {leadErrors.name && <p className="text-xs text-destructive">{leadErrors.name}</p>}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="company">Company</Label>
                            <Input id="company" placeholder="Acme Inc" value={newLead.company} onChange={e => setNewLead({...newLead, company: e.target.value})} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="email">Email</Label>
                          <Input id="email" type="email" placeholder="john@example.com" value={newLead.email} onChange={e => setNewLead({...newLead, email: e.target.value})} className={leadErrors.email ? "border-destructive" : ""} />
                          {leadErrors.email && <p className="text-xs text-destructive">{leadErrors.email}</p>}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="phone">Phone Number <span className="text-destructive">*</span></Label>
                          <Input id="phone" placeholder="+1 (555) 000-0000" value={newLead.phone} onChange={e => setNewLead({...newLead, phone: e.target.value})} className={leadErrors.phone ? "border-destructive" : ""} />
                          {leadErrors.phone && <p className="text-xs text-destructive">{leadErrors.phone}</p>}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="notes">Initial Notes</Label>
                          <Textarea id="notes" placeholder="Any specific details..." value={newLead.notes} onChange={e => setNewLead({...newLead, notes: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="campaign">Associated Campaign</Label>
                          <Select value={newLead.campaignId} onValueChange={(value) => setNewLead({...newLead, campaignId: value})}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a campaign (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Campaign</SelectItem>
                              {campaigns.map(c => (
                                <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <DialogFooter>
                          <Button type="submit" disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Add Lead
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              {/* Campaign Filter */}
              <div className="flex items-center gap-2 mb-4">
                <Label className="text-sm text-muted-foreground">Filter by Campaign:</Label>
                <Select value={leadCampaignFilter} onValueChange={setLeadCampaignFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Campaigns" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Campaigns</SelectItem>
                    <SelectItem value="none">No Campaign</SelectItem>
                    {campaigns.map(c => (
                      <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Interaction</TableHead>
                        <TableHead className="text-right">Call</TableHead>
                        <TableHead className="text-right">SMS</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leads
                        .filter(lead => {
                          if (leadCampaignFilter === "all") return true;
                          if (leadCampaignFilter === "none") return !lead.campaignId;
                          return lead.campaignId === leadCampaignFilter;
                        })
                        .map((lead) => (
                        <TableRow key={lead._id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewLead(lead)}>
                          <TableCell className="font-medium">{lead.name}</TableCell>
                          <TableCell>{lead.company || "-"}</TableCell>
                          <TableCell>
                            {lead.campaignName ? (
                              <Badge variant="secondary">{lead.campaignName}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                             <Badge variant="outline">{lead.status}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{formatTimeAgo(lead.lastContact)}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" data-testid={`button-call-${lead._id}`} onClick={(e) => { e.stopPropagation(); setCallConfirm({ leadId: lead._id, type: "call" }); }}>
                              <Phone className="h-4 w-4" />
                            </Button>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" data-testid={`button-sms-${lead._id}`} onClick={(e) => { e.stopPropagation(); setCallConfirm({ leadId: lead._id, type: "sms" }); }}>
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`button-actions-${lead._id}`}><MoreVertical className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewLead(lead); }}>View Details</DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditLead(lead); }}>Edit Lead</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); confirmDeleteLead(lead); }} className="text-destructive">
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                      {leads.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No leads yet. Add your first lead to get started.</TableCell>
                        </TableRow>
                      )}
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
                      <Avatar className="h-16 w-16 border-2 border-background shadow-sm">
                        <AvatarFallback className="text-xl bg-primary/10 text-primary">{selectedLead.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold tracking-tight">{selectedLead.name}</h3>
                        <p className="text-muted-foreground text-sm font-medium">{selectedLead.company}</p>
                        <div className="flex items-center gap-2 mt-2">
                           <Badge variant={selectedLead.status === 'Interested' ? 'default' : 'secondary'}>
                              {selectedLead.status}
                           </Badge>
                           {selectedLead.outcome === "Meeting Booked" && (
                             <Badge variant="outline" className="border-green-500 text-green-600 bg-green-500/10">Meeting Booked</Badge>
                           )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                         <Button size="sm"><Phone className="mr-2 h-4 w-4" /> Call</Button>
                         <Button size="sm" variant="outline"><MessageSquare className="mr-2 h-4 w-4" /> SMS</Button>
                         <Button size="sm" variant="ghost" onClick={() => { setIsLeadDetailsOpen(false); handleEditLead(selectedLead); }}>
                           <Settings className="mr-2 h-4 w-4" /> Edit
                         </Button>
                      </div>
                    </div>
                  </div>

                  <Tabs defaultValue="overview" className="flex-1 flex flex-col">
                    <div className="px-6 border-b bg-muted/5">
                      <TabsList className="w-full justify-start h-12 bg-transparent p-0 gap-6">
                        <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full">Overview</TabsTrigger>
                        <TabsTrigger value="activity" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full">Activity & Logs</TabsTrigger>
                        <TabsTrigger value="schedule" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-full">Schedule</TabsTrigger>
                      </TabsList>
                    </div>

                    <ScrollArea className="flex-1">
                       <div className="p-6">
                          <TabsContent value="overview" className="mt-0 space-y-6">
                             <div className="grid grid-cols-2 gap-6">
                               <div className="space-y-1">
                                 <Label className="text-xs text-muted-foreground uppercase tracking-wider">Email</Label>
                                 <div className="flex items-center gap-2 font-medium">
                                   <Mail className="h-4 w-4 text-muted-foreground" />
                                   {selectedLead.email || "N/A"}
                                 </div>
                               </div>
                               <div className="space-y-1">
                                 <Label className="text-xs text-muted-foreground uppercase tracking-wider">Phone</Label>
                                 <div className="flex items-center gap-2 font-medium">
                                   <Phone className="h-4 w-4 text-muted-foreground" />
                                   {selectedLead.phone}
                                 </div>
                               </div>
                               <div className="space-y-1">
                                 <Label className="text-xs text-muted-foreground uppercase tracking-wider">Last Contact</Label>
                                 <div className="flex items-center gap-2 font-medium">
                                   <History className="h-4 w-4 text-muted-foreground" />
                                   {formatTimeAgo(selectedLead.lastContact)}
                                 </div>
                               </div>
                               <div className="space-y-1">
                                 <Label className="text-xs text-muted-foreground uppercase tracking-wider">Pipeline Stage</Label>
                                 <div className="flex items-center gap-2 font-medium">
                                   <BarChart className="h-4 w-4 text-muted-foreground" />
                                   {selectedLead.outcome}
                                 </div>
                               </div>
                               <div className="space-y-1">
                                 <Label className="text-xs text-muted-foreground uppercase tracking-wider">Campaign</Label>
                                 <div className="flex items-center gap-2 font-medium">
                                   <Megaphone className="h-4 w-4 text-muted-foreground" />
                                   {selectedLead.campaignName || "Not assigned"}
                                 </div>
                               </div>
                               <div className="space-y-1">
                                 <Label className="text-xs text-muted-foreground uppercase tracking-wider">Company</Label>
                                 <div className="flex items-center gap-2 font-medium">
                                   <Building className="h-4 w-4 text-muted-foreground" />
                                   {selectedLead.company || "N/A"}
                                 </div>
                               </div>
                             </div>

                             <div className="space-y-2">
                                <Label className="flex items-center gap-2"><FileText className="h-4 w-4" /> Notes</Label>
                                <div className="bg-muted/50 p-4 rounded-md text-sm leading-relaxed border">
                                  {selectedLead.notes || "No notes available."}
                                </div>
                             </div>
                          </TabsContent>

                          <TabsContent value="activity" className="mt-0 space-y-6">
                             <div className="flex items-center justify-between mb-4">
                               <h4 className="font-semibold">Interaction History</h4>
                               <Button size="sm" variant="outline" onClick={() => setIsLogActivityOpen(true)}>
                                 <Plus className="h-3 w-3 mr-1" /> Log Activity
                               </Button>
                             </div>
                             <div className="space-y-6 relative pl-6 border-l-2 border-muted">
                               {(selectedLead.history || []).map((item, i) => (
                                 <div key={i} className="relative">
                                    <div className="absolute -left-[31px] top-0 h-8 w-8 rounded-full bg-background border-2 border-muted flex items-center justify-center">
                                       {item.type === 'call' ? <Phone className="h-4 w-4 text-primary" /> : 
                                        item.type === 'email' ? <Mail className="h-4 w-4 text-blue-500" /> : 
                                        <FileText className="h-4 w-4 text-orange-500" />}
                                    </div>
                                    <div className="bg-card border rounded-lg p-4 shadow-sm">
                                      <div className="flex justify-between items-start mb-1">
                                        <div className="font-medium capitalize">{item.type} Log</div>
                                        <div className="text-xs text-muted-foreground">{new Date(item.date).toLocaleString()}</div>
                                      </div>
                                      <p className="text-sm text-muted-foreground mb-2">{item.note}</p>
                                      {item.type === 'call' && (
                                        <div className="flex items-center gap-3 mt-3 pt-3 border-t">
                                           <Badge variant="outline" className="text-xs">{item.outcome}</Badge>
                                           <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> {item.duration}</span>
                                           <Button size="sm" variant="ghost" className="h-6 ml-auto"><Play className="h-3 w-3 mr-1" /> Listen</Button>
                                        </div>
                                      )}
                                    </div>
                                 </div>
                               ))}
                               {(!selectedLead.history || selectedLead.history.length === 0) && (
                                  <div className="text-sm text-muted-foreground italic pl-2">No history recorded yet.</div>
                               )}
                             </div>
                          </TabsContent>

                          <TabsContent value="schedule" className="mt-0 space-y-6">
                             <div className="flex items-center justify-between mb-4">
                               <h4 className="font-semibold">Upcoming Appointments</h4>
                               <Button size="sm" variant="outline" onClick={() => selectedLead && handleScheduleMeeting(selectedLead)}><Plus className="h-3 w-3 mr-1" /> Schedule New</Button>
                             </div>
                             
                             {appointments.filter(apt => apt.leadId === selectedLead._id).map((apt) => (
                               <Card key={apt._id} className="mb-4">
                                 <CardContent className="p-4 flex items-center gap-4">
                                   <div className="h-12 w-12 rounded-lg bg-primary/10 flex flex-col items-center justify-center text-primary font-bold leading-none">
                                     <span className="text-xs uppercase">{new Date(apt.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                                     <span className="text-lg">{new Date(apt.date).getDate()}</span>
                                   </div>
                                   <div className="flex-1">
                                     <h5 className="font-medium">{apt.title}</h5>
                                     <div className="text-sm text-muted-foreground flex items-center gap-2">
                                       <Clock className="h-3 w-3" /> {apt.time} • {apt.type}
                                     </div>
                                   </div>
                                   <DropdownMenu>
                                     <DropdownMenuTrigger asChild>
                                       <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                                     </DropdownMenuTrigger>
                                     <DropdownMenuContent align="end">
                                       <DropdownMenuItem onClick={() => handleEditAppointment(apt)}>
                                         <Pencil className="mr-2 h-4 w-4" /> Edit
                                       </DropdownMenuItem>
                                       <DropdownMenuSeparator />
                                       <DropdownMenuItem onClick={() => setDeleteConfirm({ type: "appointment", id: apt._id, name: apt.title })} className="text-destructive">
                                         <Trash2 className="mr-2 h-4 w-4" /> Delete
                                       </DropdownMenuItem>
                                     </DropdownMenuContent>
                                   </DropdownMenu>
                                 </CardContent>
                               </Card>
                             ))}
                             
                             {appointments.filter(apt => apt.leadId === selectedLead._id).length === 0 && (
                               <div className="text-center py-8 border-2 border-dashed rounded-lg">
                                  <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                                  <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
                                  <Button variant="link" className="mt-2" onClick={() => selectedLead && handleScheduleMeeting(selectedLead)}>Schedule a Meeting</Button>
                               </div>
                             )}
                          </TabsContent>
                       </div>
                    </ScrollArea>
                  </Tabs>
                </>
              )}
            </SheetContent>
          </Sheet>

          {/* Edit Lead Dialog */}
          <Dialog open={isEditLeadOpen} onOpenChange={setIsEditLeadOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Lead</DialogTitle>
                <DialogDescription>
                  Update the lead information.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpdateLead} className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Full Name <span className="text-destructive">*</span></Label>
                    <Input id="edit-name" placeholder="John Doe" value={editLead.name} onChange={e => setEditLead({...editLead, name: e.target.value})} className={leadErrors.name ? "border-destructive" : ""} />
                    {leadErrors.name && <p className="text-xs text-destructive">{leadErrors.name}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-company">Company</Label>
                    <Input id="edit-company" placeholder="Acme Inc" value={editLead.company} onChange={e => setEditLead({...editLead, company: e.target.value})} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input id="edit-email" type="email" placeholder="john@example.com" value={editLead.email} onChange={e => setEditLead({...editLead, email: e.target.value})} className={leadErrors.email ? "border-destructive" : ""} />
                  {leadErrors.email && <p className="text-xs text-destructive">{leadErrors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Phone Number <span className="text-destructive">*</span></Label>
                  <Input id="edit-phone" placeholder="+1 (555) 000-0000" value={editLead.phone} onChange={e => setEditLead({...editLead, phone: e.target.value})} className={leadErrors.phone ? "border-destructive" : ""} />
                  {leadErrors.phone && <p className="text-xs text-destructive">{leadErrors.phone}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select value={editLead.status} onValueChange={(value: typeof editLead.status) => setEditLead({...editLead, status: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="New">New</SelectItem>
                      <SelectItem value="Interested">Interested</SelectItem>
                      <SelectItem value="Follow Up">Follow Up</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                      <SelectItem value="Unqualified">Unqualified</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-notes">Notes</Label>
                  <Textarea id="edit-notes" placeholder="Any specific details..." value={editLead.notes} onChange={e => setEditLead({...editLead, notes: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-campaign">Associated Campaign</Label>
                  <Select value={editLead.campaignId} onValueChange={(value) => setEditLead({...editLead, campaignId: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a campaign (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Campaign</SelectItem>
                      {campaigns.map(c => (
                        <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsEditLeadOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Changes
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Edit Campaign Dialog */}
          <Dialog open={isEditCampaignOpen} onOpenChange={setIsEditCampaignOpen}>
            <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col p-0 gap-0">
              <DialogHeader className="px-6 py-4 border-b">
                <DialogTitle>Edit Campaign</DialogTitle>
                <DialogDescription>
                  Update your campaign settings and configuration.
                </DialogDescription>
              </DialogHeader>
              
              <div className="flex-1 overflow-y-auto">
                <Tabs value={campaignTab} onValueChange={setCampaignTab} className="w-full">
                  <div className="px-6 pt-4">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="basics">Basics</TabsTrigger>
                      <TabsTrigger value="knowledge">AI Knowledge</TabsTrigger>
                      <TabsTrigger value="config">Configuration</TabsTrigger>
                    </TabsList>
                  </div>
                  
                  <div className="p-6">
                    <TabsContent value="basics" className="mt-0 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-camp-name">Campaign Name <span className="text-destructive">*</span></Label>
                        <Input id="edit-camp-name" placeholder="e.g., Summer Outreach 2024" value={editCampaignForm.name} onChange={(e) => setEditCampaignForm({...editCampaignForm, name: e.target.value})} className={campaignErrors.name ? "border-destructive" : ""} />
                        {campaignErrors.name && <p className="text-xs text-destructive">{campaignErrors.name}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-camp-goal">Campaign Goal <span className="text-destructive">*</span></Label>
                        <Select value={editCampaignForm.goal} onValueChange={(value: "sales" | "support" | "survey" | "appointment") => setEditCampaignForm({...editCampaignForm, goal: value})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a goal" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sales">Sales / Cold Call</SelectItem>
                            <SelectItem value="support">Customer Support</SelectItem>
                            <SelectItem value="survey">Survey / Feedback</SelectItem>
                            <SelectItem value="appointment">Appointment Setting</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-camp-status">Status</Label>
                        <Select value={editCampaignForm.status} onValueChange={(value: "Active" | "Paused" | "Draft") => setEditCampaignForm({...editCampaignForm, status: value})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Draft">Draft</SelectItem>
                            <SelectItem value="Active">Active</SelectItem>
                            <SelectItem value="Paused">Paused</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-camp-script">Initial Script / Opening <span className="text-destructive">*</span></Label>
                        <Textarea id="edit-camp-script" placeholder="Hi, this is Alex from NIJVOX. I'm calling about..." className={`h-32 ${campaignErrors.script ? "border-destructive" : ""}`} value={editCampaignForm.script} onChange={(e) => setEditCampaignForm({...editCampaignForm, script: e.target.value})} />
                        {campaignErrors.script && <p className="text-xs text-destructive">{campaignErrors.script}</p>}
                      </div>
                    </TabsContent>

                    <TabsContent value="knowledge" className="mt-0 space-y-6">
                      <div className="space-y-4">
                        <div className="bg-muted/30 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:bg-muted/50 transition-colors cursor-pointer relative">
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.doc,.docx,.txt,image/*"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={(e) => handleFileUpload(e, true)}
                            disabled={isUploading}
                          />
                          {isUploading ? (
                            <Loader2 className="mx-auto h-10 w-10 text-muted-foreground mb-4 animate-spin" />
                          ) : (
                            <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
                          )}
                          <h3 className="font-semibold text-lg">{isUploading ? "Uploading..." : "Upload Training Documents"}</h3>
                          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                            Click or drag PDF, DOCX, TXT, or images here to train the AI.
                          </p>
                          <Button variant="outline" className="mt-4" disabled={isUploading}>Select Files</Button>
                        </div>

                        {editCampaignForm.knowledgeBaseFiles.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-base">Uploaded Knowledge Base ({editCampaignForm.knowledgeBaseFiles.length} files)</Label>
                            <div className="space-y-2">
                              {editCampaignForm.knowledgeBaseFiles.map((file) => (
                                <div key={file.id} className="flex items-center justify-between p-3 border rounded-md bg-card">
                                  <div className="flex items-center gap-3">
                                    {getFileIcon(file.type)}
                                    <div>
                                      <div className="font-medium">{file.name}</div>
                                      <div className="text-xs text-muted-foreground">{formatFileSize(file.size)}</div>
                                    </div>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleRemoveFile(file.id, file.url, true)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label htmlFor="edit-kb-text">Additional Context (Text)</Label>
                          <Textarea id="edit-kb-text" placeholder="Paste FAQs, objection handling scripts, or specific details here..." className="h-32" value={editCampaignForm.additionalContext} onChange={(e) => setEditCampaignForm({...editCampaignForm, additionalContext: e.target.value})} />
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="config" className="mt-0 space-y-4">
                      <div className="space-y-2">
                        <Label>AI Voice <span className="text-destructive">*</span></Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div 
                            className={`border rounded-md p-4 cursor-pointer hover:border-primary transition-colors ${editCampaignForm.voice === "Rachel (American)" ? "bg-primary/5 border-primary" : ""}`}
                            onClick={() => setEditCampaignForm({...editCampaignForm, voice: "Rachel (American)"})}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Mic className={`h-4 w-4 ${editCampaignForm.voice === "Rachel (American)" ? "text-primary" : ""}`} />
                              <span className="font-medium">Rachel (American)</span>
                            </div>
                            <div className="text-xs text-muted-foreground">Professional, warm, clear. Best for sales.</div>
                          </div>
                          <div 
                            className={`border rounded-md p-4 cursor-pointer hover:border-primary transition-colors ${editCampaignForm.voice === "Drew (British)" ? "bg-primary/5 border-primary" : ""}`}
                            onClick={() => setEditCampaignForm({...editCampaignForm, voice: "Drew (British)"})}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Mic className={`h-4 w-4 ${editCampaignForm.voice === "Drew (British)" ? "text-primary" : ""}`} />
                              <span className="font-medium">Drew (British)</span>
                            </div>
                            <div className="text-xs text-muted-foreground">Sophisticated, calm. Best for support.</div>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Calling Hours <span className="text-destructive">*</span></Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Start Time</Label>
                            <Input type="time" value={editCampaignForm.callingHours.start} onChange={(e) => setEditCampaignForm({...editCampaignForm, callingHours: {...editCampaignForm.callingHours, start: e.target.value}})} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">End Time</Label>
                            <Input type="time" value={editCampaignForm.callingHours.end} onChange={(e) => setEditCampaignForm({...editCampaignForm, callingHours: {...editCampaignForm.callingHours, end: e.target.value}})} />
                          </div>
                        </div>
                        {campaignErrors.callingHours && <p className="text-xs text-destructive">{campaignErrors.callingHours}</p>}
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </div>

              <DialogFooter className="px-6 py-4 border-t mt-auto">
                <Button variant="outline" onClick={() => setIsEditCampaignOpen(false)}>Cancel</Button>
                <Button onClick={handleUpdateCampaign} disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Calendar View */}
          {activeTab === "calendar" && !isAdmin && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
                <div className="flex items-center gap-2">
                   <Button variant="outline" size="sm" onClick={goToPreviousMonth}><ChevronLeft className="h-4 w-4" /></Button>
                   <Button variant="outline" size="sm" onClick={goToToday}>Today</Button>
                   <span className="text-sm font-medium w-40 text-center">{formatMonthYear()}</span>
                   <Button variant="outline" size="sm" onClick={goToNextMonth}><ChevronRight className="h-4 w-4" /></Button>
                   
                   <Button className="ml-4" onClick={() => {
                     setAppointmentForm({ leadId: "", leadName: "", title: "", date: new Date().toISOString().split('T')[0], time: "09:00", type: "Zoom", notes: "" });
                     setIsAddAppointmentOpen(true);
                   }}><Plus className="mr-2 h-4 w-4" /> New Appointment</Button>
                </div>
              </div>
              
              <div className="border rounded-md shadow-sm bg-card">
                <div className="grid grid-cols-7 border-b bg-muted/40">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <div key={day} className="p-3 text-center text-sm font-medium text-muted-foreground">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 auto-rows-[120px]">
                  {getCalendarDays().map((dayInfo, index) => {
                    const dayApts = appointments.filter(apt => apt.date === dayInfo.date);
                    const todayHighlight = isToday(dayInfo.date);
                    
                    return (
                      <div 
                        key={index} 
                        className={`border-b border-r p-2 relative group hover:bg-muted/5 transition-colors ${!dayInfo.isCurrentMonth ? "bg-muted/10 text-muted-foreground/50" : ""} ${todayHighlight ? "bg-primary/5" : ""}`}
                      >
                        <div className="flex justify-between items-start">
                          <span className={`text-sm font-medium ${todayHighlight ? "bg-primary text-primary-foreground h-6 w-6 rounded-full flex items-center justify-center" : ""}`}>
                            {dayInfo.day}
                          </span>
                          {todayHighlight && <span className="text-[10px] text-primary font-medium">Today</span>}
                        </div>
                        
                        <div className="mt-1 space-y-1 overflow-hidden max-h-[80px]">
                          {dayApts.slice(0, 3).map(apt => (
                            <div 
                              key={apt._id} 
                              className="text-[10px] truncate px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-medium cursor-pointer hover:bg-primary/20"
                              onClick={() => handleEditAppointment(apt)}
                            >
                              {apt.time} {apt.title}
                            </div>
                          ))}
                          {dayApts.length > 3 && (
                            <div className="text-[10px] text-muted-foreground">+{dayApts.length - 3} more</div>
                          )}
                        </div>
                        
                        {dayInfo.isCurrentMonth && (
                          <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-6 w-6"
                              onClick={() => {
                                setAppointmentForm({ leadId: "", leadName: "", title: "", date: dayInfo.date, time: "09:00", type: "Zoom", notes: "" });
                                setIsAddAppointmentOpen(true);
                              }}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Upcoming Appointments List */}
              <Card>
                <CardHeader>
                  <CardTitle>Upcoming Appointments</CardTitle>
                </CardHeader>
                <CardContent>
                  {appointments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No appointments scheduled</p>
                      <Button variant="outline" className="mt-4" onClick={() => {
                        setAppointmentForm({ leadId: "", leadName: "", title: "", date: new Date().toISOString().split('T')[0], time: "09:00", type: "Zoom", notes: "" });
                        setIsAddAppointmentOpen(true);
                      }}>
                        <Plus className="mr-2 h-4 w-4" /> Schedule Appointment
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {appointments
                        .sort((a, b) => new Date(a.date + ' ' + a.time).getTime() - new Date(b.date + ' ' + b.time).getTime())
                        .slice(0, 10)
                        .map(apt => (
                          <div key={apt._id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <CalendarDays className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <div className="font-medium">{apt.title}</div>
                                <div className="text-sm text-muted-foreground">
                                  {new Date(apt.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {apt.time} - {apt.leadName}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{apt.type}</Badge>
                              <Button variant="ghost" size="icon" onClick={() => handleEditAppointment(apt)}>
                                <Edit3 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => confirmDeleteAppointment(apt)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Settings View */}
          {activeTab === "settings" && (
            <div className="max-w-4xl mx-auto space-y-8">
               <div>
                 <h1 className="text-3xl font-bold tracking-tight mb-2">Settings</h1>
                 <p className="text-muted-foreground">Manage your subscription, preferences, and account.</p>
               </div>

               <div className="grid gap-8">
                  {/* Subscription Card */}
                  <Card>
                     <CardHeader>
                       <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Subscription & Usage</CardTitle>
                       <CardDescription>You are currently on the <span className="font-semibold text-foreground">{user.subscription?.plan || "Free"} Plan</span>.</CardDescription>
                     </CardHeader>
                     <CardContent className="space-y-6">
                        <div className="space-y-2">
                           <div className="flex justify-between text-sm">
                             <span>Monthly Call Credits</span>
                             <span className="font-medium">{user.subscription?.creditsUsed || 0} / {user.subscription?.monthlyCallCredits || 0} used</span>
                           </div>
                           <Progress value={user.subscription?.monthlyCallCredits ? ((user.subscription?.creditsUsed || 0) / user.subscription.monthlyCallCredits) * 100 : 0} className="h-2" />
                           <p className="text-xs text-muted-foreground">Plan renews on {user.subscription?.renewalDate ? new Date(user.subscription.renewalDate).toLocaleDateString() : "N/A"}.</p>
                        </div>
                        
                        <div className="grid sm:grid-cols-3 gap-4">
                           <div className="bg-muted/50 p-3 rounded-lg text-center">
                              <div className="text-2xl font-bold">{user.subscription?.plan || "Free"}</div>
                              <div className="text-xs text-muted-foreground">Current Tier</div>
                           </div>
                           <div className="bg-muted/50 p-3 rounded-lg text-center">
                              <div className="text-2xl font-bold">${user.subscription?.plan === "Enterprise" ? "499" : user.subscription?.plan === "Pro" ? "199" : "49"}</div>
                              <div className="text-xs text-muted-foreground">Per Month</div>
                           </div>
                           <div className="bg-muted/50 p-3 rounded-lg text-center">
                              <div className="text-2xl font-bold">{user.subscription?.status || "Active"}</div>
                              <div className="text-xs text-muted-foreground">Status</div>
                           </div>
                        </div>

                        <div className="flex gap-4">
                           <Button>Upgrade Plan</Button>
                           <Button variant="outline" className="text-destructive hover:text-destructive hover:bg-destructive/10">Cancel Subscription</Button>
                        </div>
                     </CardContent>
                  </Card>

                  {/* Calling Preferences */}
                  <Card>
                     <CardHeader>
                       <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5 text-primary" /> Calling Preferences</CardTitle>
                       <CardDescription>Configure constraints for your AI agents.</CardDescription>
                     </CardHeader>
                     <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                           <div className="space-y-0.5">
                              <Label className="text-base">Daily Call Limit</Label>
                              <p className="text-sm text-muted-foreground">Maximum number of outbound calls per day.</p>
                           </div>
                           <div className="flex items-center gap-2">
                              <Input 
                                type="number" 
                                value={callLimit} 
                                onChange={(e) => setCallLimit(parseInt(e.target.value) || 0)} 
                                className="w-24 text-right" 
                              />
                           </div>
                        </div>
                        
                        <div className="flex items-center justify-between">
                           <div className="space-y-0.5">
                              <Label className="text-base">Do Not Disturb (DND)</Label>
                              <p className="text-sm text-muted-foreground">Pause all outgoing calls immediately.</p>
                           </div>
                           <Switch checked={dndEnabled} onCheckedChange={setDndEnabled} />
                        </div>

                        <div className="flex items-center justify-between">
                           <div className="space-y-0.5">
                              <Label className="text-base">Local Presence Dialing</Label>
                              <p className="text-sm text-muted-foreground">Match caller ID area code to lead's location.</p>
                           </div>
                           <Switch checked={localPresence} onCheckedChange={setLocalPresence} />
                        </div>

                        <div className="flex justify-end pt-4">
                           <Button onClick={handleSaveSettings} disabled={isSaving}>
                             {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                             Save Settings
                           </Button>
                        </div>
                     </CardContent>
                  </Card>
               </div>
            </div>
          )}

          {/* Profile View */}
          {activeTab === "profile" && (
            <div className="max-w-2xl mx-auto space-y-8">
               <div>
                 <h1 className="text-3xl font-bold tracking-tight mb-2">My Profile</h1>
                 <p className="text-muted-foreground">Manage your personal information and security.</p>
               </div>

               <Card>
                  <CardHeader>
                    <CardTitle>Personal Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                     <div className="flex items-center gap-6">
                        <Avatar className="h-20 w-20">
                          <AvatarFallback className="text-2xl">{user.firstName?.[0]}{user.lastName?.[0]}</AvatarFallback>
                        </Avatar>
                        <Button variant="outline">Change Avatar</Button>
                     </div>

                     <div className="grid gap-4">
                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-2">
                              <Label>First Name</Label>
                              <Input value={profileForm.firstName} onChange={(e) => setProfileForm({...profileForm, firstName: e.target.value})} />
                           </div>
                           <div className="space-y-2">
                              <Label>Last Name</Label>
                              <Input value={profileForm.lastName} onChange={(e) => setProfileForm({...profileForm, lastName: e.target.value})} />
                           </div>
                        </div>
                        <div className="space-y-2">
                           <Label>Email Address</Label>
                           <Input value={profileForm.email} onChange={(e) => setProfileForm({...profileForm, email: e.target.value})} disabled />
                        </div>
                        <div className="space-y-2">
                           <Label>Phone Number</Label>
                           <Input value={profileForm.phone} onChange={(e) => setProfileForm({...profileForm, phone: e.target.value})} placeholder="+1 (555) 000-0000" />
                        </div>
                        <div className="space-y-2">
                           <Label>Company Name</Label>
                           <Input value={profileForm.companyName} onChange={(e) => setProfileForm({...profileForm, companyName: e.target.value})} placeholder="Your Company" />
                        </div>
                     </div>
                     <div className="flex justify-end">
                        <Button onClick={handleSaveProfile} disabled={isSaving}>
                          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Save Changes
                        </Button>
                     </div>
                  </CardContent>
               </Card>

               <Card>
                  <CardHeader>
                    <CardTitle>Security</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                     <div className="space-y-2">
                        <Label>Current Password</Label>
                        <Input type="password" value={passwordForm.current} onChange={(e) => setPasswordForm({...passwordForm, current: e.target.value})} />
                     </div>
                     <div className="space-y-2">
                        <Label>New Password</Label>
                        <Input type="password" value={passwordForm.new} onChange={(e) => setPasswordForm({...passwordForm, new: e.target.value})} />
                     </div>
                     <div className="space-y-2">
                        <Label>Confirm New Password</Label>
                        <Input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({...passwordForm, confirm: e.target.value})} />
                     </div>
                     <div className="flex justify-end pt-2">
                        <Button variant="outline" onClick={handleChangePassword} disabled={isSaving || !passwordForm.current || !passwordForm.new}>
                          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Update Password
                        </Button>
                     </div>
                  </CardContent>
               </Card>
            </div>
          )}

          {activeTab === "sms" && !isAdmin && (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-4">
               <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                 <MessageSquare className="h-8 w-8 text-muted-foreground" />
               </div>
               <h2 className="text-2xl font-bold">Coming Soon</h2>
               <p className="text-muted-foreground max-w-md">
                 This module is currently under development. Check back later for bulk SMS features.
               </p>
            </div>
          )}
        </div>
      </main>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog 
        open={deleteConfirm.type !== null} 
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirm({ type: null, id: "", name: "" });
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm.type === "lead" && (
                <>This will permanently delete the lead "<strong>{deleteConfirm.name}</strong>" and all associated data. This action cannot be undone.</>
              )}
              {deleteConfirm.type === "campaign" && (
                <>This will permanently delete the campaign "<strong>{deleteConfirm.name}</strong>" and all associated data. This action cannot be undone.</>
              )}
              {deleteConfirm.type === "appointment" && (
                <>This will permanently delete the appointment "<strong>{deleteConfirm.name}</strong>". This action cannot be undone.</>
              )}
              {deleteConfirm.type === "user" && (
                <>This will permanently delete the user "<strong>{deleteConfirm.name}</strong>" and all their data. This action cannot be undone.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirm({ type: null, id: "", name: "" })}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirm.type === "lead") handleDeleteLead(deleteConfirm.id);
                if (deleteConfirm.type === "campaign") handleDeleteCampaign(deleteConfirm.id);
                if (deleteConfirm.type === "appointment") handleDeleteAppointment(deleteConfirm.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Appointment Dialog */}
      <Dialog open={isAddAppointmentOpen} onOpenChange={(open) => {
        setIsAddAppointmentOpen(open);
        if (!open) {
          setScheduleFromLead(null);
          setAppointmentForm({ leadId: "", leadName: "", title: "", date: "", time: "09:00", type: "Zoom", notes: "" });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Appointment</DialogTitle>
            <DialogDescription>
              {scheduleFromLead ? `Schedule a meeting with ${scheduleFromLead.name}` : "Create a new appointment"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Lead <span className="text-destructive">*</span></Label>
              <Select value={appointmentForm.leadId} onValueChange={(value) => {
                const lead = leads.find(l => l._id === value);
                setAppointmentForm({
                  ...appointmentForm, 
                  leadId: value, 
                  leadName: lead?.name || "",
                  title: lead ? `Meeting with ${lead.name}` : appointmentForm.title
                });
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a lead" />
                </SelectTrigger>
                <SelectContent>
                  {leads.map(lead => (
                    <SelectItem key={lead._id} value={lead._id}>{lead.name} - {lead.company || "No company"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input placeholder="Meeting title" value={appointmentForm.title} onChange={(e) => setAppointmentForm({...appointmentForm, title: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={appointmentForm.date} onChange={(e) => setAppointmentForm({...appointmentForm, date: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Time <span className="text-destructive">*</span></Label>
                <Input type="time" value={appointmentForm.time} onChange={(e) => setAppointmentForm({...appointmentForm, time: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Meeting Type</Label>
              <Select value={appointmentForm.type} onValueChange={(value) => setAppointmentForm({...appointmentForm, type: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Zoom">Zoom</SelectItem>
                  <SelectItem value="Google Meet">Google Meet</SelectItem>
                  <SelectItem value="Phone Call">Phone Call</SelectItem>
                  <SelectItem value="In Person">In Person</SelectItem>
                  <SelectItem value="Teams">Microsoft Teams</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Add any notes or agenda..." value={appointmentForm.notes} onChange={(e) => setAppointmentForm({...appointmentForm, notes: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddAppointmentOpen(false)}>Cancel</Button>
            <Button onClick={handleAddAppointment} disabled={isSaving || !appointmentForm.leadId || !appointmentForm.title || !appointmentForm.date}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Appointment Dialog */}
      <Dialog open={isEditAppointmentOpen} onOpenChange={setIsEditAppointmentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Appointment</DialogTitle>
            <DialogDescription>
              Update appointment details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Lead</Label>
              <Input value={appointmentForm.leadName} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input placeholder="Meeting title" value={appointmentForm.title} onChange={(e) => setAppointmentForm({...appointmentForm, title: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={appointmentForm.date} onChange={(e) => setAppointmentForm({...appointmentForm, date: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Time <span className="text-destructive">*</span></Label>
                <Input type="time" value={appointmentForm.time} onChange={(e) => setAppointmentForm({...appointmentForm, time: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Meeting Type</Label>
              <Select value={appointmentForm.type} onValueChange={(value) => setAppointmentForm({...appointmentForm, type: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Zoom">Zoom</SelectItem>
                  <SelectItem value="Google Meet">Google Meet</SelectItem>
                  <SelectItem value="Phone Call">Phone Call</SelectItem>
                  <SelectItem value="In Person">In Person</SelectItem>
                  <SelectItem value="Teams">Microsoft Teams</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Add any notes or agenda..." value={appointmentForm.notes} onChange={(e) => setAppointmentForm({...appointmentForm, notes: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditAppointmentOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateAppointment} disabled={isSaving || !appointmentForm.title || !appointmentForm.date}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Activity Dialog */}
      <Dialog open={isLogActivityOpen} onOpenChange={(open) => {
        setIsLogActivityOpen(open);
        if (!open) {
          setActivityLog({ type: "call", note: "", outcome: "No Answer", duration: "0:00" });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Activity</DialogTitle>
            <DialogDescription>
              {selectedLead ? `Record an interaction with ${selectedLead.name}` : "Record an interaction"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Activity Type</Label>
              <Select value={activityLog.type} onValueChange={(value: "call" | "email" | "note") => setActivityLog({...activityLog, type: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Phone Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {activityLog.type === "call" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Call Outcome</Label>
                  <Select value={activityLog.outcome} onValueChange={(value) => setActivityLog({...activityLog, outcome: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Answered">Answered</SelectItem>
                      <SelectItem value="No Answer">No Answer</SelectItem>
                      <SelectItem value="Voicemail">Voicemail</SelectItem>
                      <SelectItem value="Busy">Busy</SelectItem>
                      <SelectItem value="Wrong Number">Wrong Number</SelectItem>
                      <SelectItem value="Callback Requested">Callback Requested</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Duration</Label>
                  <Input placeholder="e.g., 5:30" value={activityLog.duration} onChange={(e) => setActivityLog({...activityLog, duration: e.target.value})} />
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Notes <span className="text-destructive">*</span></Label>
              <Textarea 
                placeholder={activityLog.type === "call" ? "What was discussed during the call?" : activityLog.type === "email" ? "Summary of the email sent/received..." : "Add your notes here..."} 
                value={activityLog.note} 
                onChange={(e) => setActivityLog({...activityLog, note: e.target.value})}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLogActivityOpen(false)}>Cancel</Button>
            <Button onClick={handleLogActivity} disabled={isSaving || !activityLog.note.trim()}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Log Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Call/SMS Confirmation Dialog */}
      <AlertDialog open={!!callConfirm} onOpenChange={() => setCallConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {callConfirm?.type === "call" ? "Initiate Call" : "Send SMS"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {callConfirm?.type === "call" 
                ? `Are you sure you want to call ${leads.find(l => l._id === callConfirm?.leadId)?.name}?`
                : `Are you sure you want to send an SMS to ${leads.find(l => l._id === callConfirm?.leadId)?.name}?`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                const lead = leads.find(l => l._id === callConfirm?.leadId);
                if (lead) {
                  toast({
                    title: callConfirm?.type === "call" ? "Call Initiated" : "SMS Sent",
                    description: `${callConfirm?.type === "call" ? "Calling" : "Message sent to"} ${lead.name}`
                  });
                  // Log activity
                  const newHistory = {
                    type: callConfirm?.type === "call" ? "call" : "sms" as "call" | "email" | "note",
                    date: new Date(),
                    note: callConfirm?.type === "call" ? "Outbound call" : "SMS message sent",
                    outcome: "Sent",
                    duration: "0:00"
                  };
                  setLeads(leads.map(l => 
                    l._id === lead._id 
                      ? { ...l, history: [...(l.history || []), newHistory], lastContact: new Date() }
                      : l
                  ));
                }
                setCallConfirm(null);
              }}
            >
              {callConfirm?.type === "call" ? "Call Now" : "Send SMS"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
