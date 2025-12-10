import { useState } from "react";
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
  Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import dashboardImage from "@assets/generated_images/futuristic_dashboard_interface_mockup_glowing_in_orange..png";

// Mock Data
const stats = [
  { label: "Total Calls", value: "1,248", change: "+12.5%", icon: PhoneCall },
  { label: "Leads Converted", value: "86", change: "+4.2%", icon: CheckCircle2 },
  { label: "Avg. Duration", value: "2m 14s", change: "-1.1%", icon: Clock },
  { label: "Pipeline Value", value: "$42,500", change: "+18.2%", icon: ArrowUpRight },
];

const leads = [
  { id: 1, name: "Sarah Miller", company: "TechFlow Inc.", status: "Interested", lastContact: "2 mins ago", outcome: "Meeting Booked" },
  { id: 2, name: "James Wilson", company: "LogiStick", status: "Follow Up", lastContact: "15 mins ago", outcome: "Voicemail" },
  { id: 3, name: "Elena Rodriguez", company: "Creative Sol", status: "Closed", lastContact: "1 hour ago", outcome: "Sale Closed" },
  { id: 4, name: "Michael Chang", company: "NextGen Corp", status: "Unqualified", lastContact: "3 hours ago", outcome: "Not Interested" },
  { id: 5, name: "David Kim", company: "Stark Ind", status: "In Progress", lastContact: "5 hours ago", outcome: "Call Scheduled" },
];

const campaigns = [
  { id: 1, name: "Q4 Outreach", status: "Active", progress: 68, calls: 450, goals: 12 },
  { id: 2, name: "Webinar Follow-up", status: "Paused", progress: 32, calls: 120, goals: 5 },
  { id: 3, name: "Cold Leads Reactivation", status: "Draft", progress: 0, calls: 0, goals: 0 },
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [, setLocation] = useLocation();
  const { theme } = useTheme();

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
          <span className="text-xl font-bold tracking-tight">AI Agent</span>
        </div>

        <div className="space-y-1 flex-1">
          <SidebarItem icon={LayoutDashboard} label="Overview" id="overview" />
          <SidebarItem icon={Users} label="CRM / Leads" id="crm" />
          {/* <SidebarItem icon={Phone} label="Campaigns" id="campaigns" /> */}
          <SidebarItem icon={MessageSquare} label="Bulk SMS" id="sms" />
          <SidebarItem icon={Settings} label="Settings" id="settings" />
        </div>

        <div className="mt-auto pt-4 border-t">
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src="" />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-medium truncate">John Doe</div>
              <div className="text-xs text-muted-foreground truncate">john@company.com</div>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={() => setLocation("/")}>
            <LogOut className="mr-2 h-4 w-4" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b flex items-center justify-between px-6 bg-background/50 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-4 w-full max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search leads, campaigns..." className="pl-9 bg-muted/20 border-none focus-visible:ring-1" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* <Button variant="outline" size="sm" className="hidden sm:flex">
              <Plus className="mr-2 h-4 w-4" /> New Campaign
            </Button> */}
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
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
                <div className="flex gap-2">
                   <Badge variant="outline" className="px-3 py-1">Last 7 Days</Badge>
                </div>
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

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Activity */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Recent Calls</CardTitle>
                    <CardDescription>Real-time log of AI interactions.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Lead</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Outcome</TableHead>
                          <TableHead className="text-right">Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {leads.map((lead) => (
                          <TableRow key={lead.id}>
                            <TableCell className="font-medium">{lead.name}</TableCell>
                            <TableCell>
                              <Badge variant={lead.status === 'Interested' ? 'default' : 'secondary'} className={lead.status === 'Interested' ? 'bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/25 border-none' : ''}>
                                {lead.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{lead.outcome}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{lead.lastContact}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Quick Actions / Upsell */}
                <Card className="bg-primary text-primary-foreground overflow-hidden relative">
                  <div className="absolute inset-0 z-0 opacity-20">
                     <img src={dashboardImage} alt="bg" className="w-full h-full object-cover" />
                  </div>
                  <CardHeader className="relative z-10">
                    <CardTitle>Upgrade to Pro</CardTitle>
                    <CardDescription className="text-primary-foreground/80">Unlock unlimited minutes and custom voice cloning.</CardDescription>
                  </CardHeader>
                  <CardContent className="relative z-10 pt-4">
                    <Button variant="secondary" className="w-full shadow-lg">View Plans</Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === "campaigns" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
                <Button><Plus className="mr-2 h-4 w-4" /> Create Campaign</Button>
              </div>
              <div className="grid gap-6">
                 {campaigns.map(camp => (
                   <Card key={camp.id}>
                     <CardHeader className="flex flex-row items-center justify-between pb-2">
                       <div className="space-y-1">
                         <CardTitle className="text-xl">{camp.name}</CardTitle>
                         <CardDescription>Target: Small Business Owners • Script: Standard Demo</CardDescription>
                       </div>
                       <Badge variant={camp.status === 'Active' ? 'default' : 'secondary'}>{camp.status}</Badge>
                     </CardHeader>
                     <CardContent>
                       <div className="space-y-2">
                         <div className="flex justify-between text-sm">
                           <span>Progress</span>
                           <span className="font-medium">{camp.progress}%</span>
                         </div>
                         <div className="h-2 rounded-full bg-muted overflow-hidden">
                           <div className="h-full bg-primary transition-all" style={{ width: `${camp.progress}%` }} />
                         </div>
                         <div className="flex gap-4 text-sm text-muted-foreground mt-4">
                           <div className="flex items-center gap-1"><Phone className="h-4 w-4" /> {camp.calls} Calls Made</div>
                           <div className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> {camp.goals} Goals Met</div>
                         </div>
                       </div>
                     </CardContent>
                     <CardFooter className="border-t pt-4 flex gap-2">
                        <Button variant="outline" size="sm"><Play className="mr-2 h-4 w-4" /> Resume</Button>
                        <Button variant="ghost" size="sm">Edit Config</Button>
                     </CardFooter>
                   </Card>
                 ))}
              </div>
            </div>
          )}

          {activeTab === "crm" && (
             <div className="space-y-6">
               <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">Lead CRM</h1>
                <div className="flex gap-2">
                  <Button variant="outline">Import CSV</Button>
                  <Button><Plus className="mr-2 h-4 w-4" /> Add Lead</Button>
                </div>
              </div>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Interaction</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...leads, ...leads].map((lead, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{lead.name}</TableCell>
                          <TableCell>{lead.company}</TableCell>
                          <TableCell>
                             <Badge variant="outline">{lead.status}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{lead.lastContact}</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>View Details</DropdownMenuItem>
                                <DropdownMenuItem>Call Now</DropdownMenuItem>
                                <DropdownMenuItem>Send SMS</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
             </div>
          )}

          {(activeTab === "sms" || activeTab === "settings") && (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-4">
               <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                 {activeTab === "sms" ? <MessageSquare className="h-8 w-8 text-muted-foreground" /> : <Settings className="h-8 w-8 text-muted-foreground" />}
               </div>
               <h2 className="text-2xl font-bold">Coming Soon</h2>
               <p className="text-muted-foreground max-w-md">
                 This module is currently under development. Check back later for {activeTab === "sms" ? "bulk SMS features" : "advanced settings"}.
               </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
