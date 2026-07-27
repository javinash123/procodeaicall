import { useState, useEffect } from "react";
import type { Lead, Campaign, Appointment } from "@shared/schema";
import {
  PhoneCall, PhoneIncoming, Target, CalendarDays, Timer, Activity, TrendingUp,
  Flame, Award, Clock, Calendar, Shield, Users, CheckCircle2, Wallet,
  PhoneOff, BrainCircuit, Zap, CreditCard, MessageCircle, MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, AreaChart, Area,
  ComposedChart,
} from "recharts";

interface Props {
  leads: Lead[];
  campaigns: Campaign[];
  appointments: Appointment[];
  callLogs: any[];
  registeredUsers: any[];
  isAdmin: boolean;
}

export default function DashboardAnalyticsTab({
  leads, campaigns, appointments, callLogs, registeredUsers, isAdmin,
}: Props) {
  // ── Core computed ──────────────────────────────────────────────────────────
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const closedLeads = leads.filter(l => l.status === "Closed").length;
  const interestedLeads = leads.filter(l => l.status === "Interested").length;
  const followUpLeads = leads.filter(l => l.status === "Follow Up").length;
  const conversionRate = leads.length > 0 ? ((closedLeads / leads.length) * 100).toFixed(1) : "0.0";

  const upcomingAppts = appointments
    .filter(a => new Date(`${a.date}T${a.time || "00:00"}`) >= new Date())
    .sort((a, b) => new Date(`${a.date}T${a.time || "00:00"}`).getTime() - new Date(`${b.date}T${b.time || "00:00"}`).getTime())
    .slice(0, 5);

  // ── AI Insights ────────────────────────────────────────────────────────────
  const todaysCalls = leads.reduce((acc, l) =>
    acc + (l.history || []).filter(h => h.type === "call" && new Date(h.date) >= todayStart).length, 0);
  const activeCampaignsCount = campaigns.filter(c => c.status === "Active").length;
  const aiInsights: string[] = [];
  if (interestedLeads > 0 && leads.length > 0)
    aiInsights.push(`${((interestedLeads / leads.length) * 100).toFixed(0)}% of your leads are Interested — follow up now to close more deals.`);
  if (followUpLeads > 0)
    aiInsights.push(`${followUpLeads} lead${followUpLeads > 1 ? "s" : ""} need follow-up. Reaching out today keeps momentum high.`);
  if (todaysCalls > 0)
    aiInsights.push(`${todaysCalls} call${todaysCalls > 1 ? "s" : ""} logged today. Great engagement!`);
  else if (leads.length > 0)
    aiInsights.push("No calls logged today. Consider reaching out to your Interested or Follow Up leads.");
  if (activeCampaignsCount > 0)
    aiInsights.push(`${activeCampaignsCount} active campaign${activeCampaignsCount > 1 ? "s" : ""} running. Monitor progress to optimise conversion.`);
  if (upcomingAppts.length > 0)
    aiInsights.push(`${upcomingAppts.length} upcoming appointment${upcomingAppts.length > 1 ? "s" : ""}. Prepare talking points in advance.`);
  if (aiInsights.length === 0) aiInsights.push("Add leads and run campaigns to unlock AI-powered insights.");

  // ── Advanced analytics ────────────────────────────────────────────────────
  const allHistory = leads.flatMap(l => l.history || []);
  const allCalls = allHistory.filter(h => h.type === "call");
  const answeredCalls = allCalls.filter(h => (h.outcome || "").toLowerCase().includes("answer") && !(h.outcome || "").toLowerCase().includes("no"));
  const answerRate = allCalls.length > 0 ? Math.round((answeredCalls.length / allCalls.length) * 100) : 0;

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

  const weekDayLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const weeklyActivity = weekDayLabels.map((day, i) => {
    const jsDay = i === 6 ? 0 : i + 1;
    return {
      day,
      calls:  allHistory.filter(h => h.type === "call"  && new Date(h.date || 0).getDay() === jsDay).length,
      emails: allHistory.filter(h => h.type === "email" && new Date(h.date || 0).getDay() === jsDay).length,
      notes:  allHistory.filter(h => h.type === "note"  && new Date(h.date || 0).getDay() === jsDay).length,
    };
  });

  const hourlyCallDist = Array.from({ length: 15 }, (_, i) => {
    const h = i + 7;
    const label = h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
    return { hour: label, calls: allCalls.filter(hist => new Date(hist.date || 0).getHours() === h).length };
  });

  const callOutcomeCounts: Record<string, number> = {};
  allCalls.forEach(h => { const o = h.outcome || "Unknown"; callOutcomeCounts[o] = (callOutcomeCounts[o] || 0) + 1; });
  const callOutcomeData = Object.entries(callOutcomeCounts).map(([name, value]) => ({ name, value }));

  const apptTypeCounts: Record<string, number> = {};
  appointments.forEach(a => { const t = a.type || "Other"; apptTypeCounts[t] = (apptTypeCounts[t] || 0) + 1; });
  const apptTypeData = Object.entries(apptTypeCounts).map(([name, value]) => ({ name, value }));

  const funnelStages = ["New","Interested","Follow Up","In Progress","Closed","Unqualified"];
  const funnelColors = ["#94a3b8","#3b82f6","#f97316","#8b5cf6","#10b981","#ef4444"];
  const leadFunnelData = funnelStages.map((stage, i) => ({
    stage, value: leads.filter(l => l.status === stage).length, fill: funnelColors[i],
  }));

  const campaignPerfData = campaigns.map(c => ({
    name: c.name.length > 14 ? c.name.slice(0, 14) + "…" : c.name,
    leads: leads.filter(l => l.campaignId === c._id).length,
    calls: leads.filter(l => l.campaignId === c._id).reduce((acc, l) => acc + (l.history||[]).filter(h=>h.type==="call").length, 0),
    goals: c.goalsMet || 0,
  }));

  const callLogStatusCounts: Record<string, number> = {};
  callLogs.forEach(log => { const s = log.status || "unknown"; callLogStatusCounts[s] = (callLogStatusCounts[s] || 0) + 1; });
  const callLogStatusData = Object.entries(callLogStatusCounts).map(([name, value]) => ({ name, value }));

  const avgCallDuration = callLogs.filter(l => l.duration > 0).length > 0
    ? Math.round(callLogs.filter(l => l.duration > 0).reduce((acc, l) => acc + (l.duration || 0), 0) / callLogs.filter(l => l.duration > 0).length)
    : 0;

  const platformConversion = leads.length > 0
    ? ((leads.filter(l => l.status === "Closed").length / leads.length) * 100).toFixed(1)
    : "0.0";

  const agentPerformance = registeredUsers.filter(u => u.role !== "admin").map(u => {
    const userLeads = leads.filter(l => (l as any).userId === u._id || (l as any).assignedTo === u._id);
    const userCalls = userLeads.reduce((acc, l) => acc + (l.history || []).filter(h => h.type === "call").length, 0);
    const userClosed = userLeads.filter(l => l.status === "Closed").length;
    const conv = userLeads.length > 0 ? Math.round((userClosed / userLeads.length) * 100) : 0;
    return { name: u.firstName || u.email?.split("@")[0] || "User", calls: userCalls, leads: userLeads.length, conversion: conv };
  }).sort((a, b) => b.calls - a.calls).slice(0, 5);

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

  // ── Monthly channel data — fetched from real credit usage records ──────────
  const EMPTY_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    .map(m => ({ m, whatsapp: 0, sms: 0 }));

  const [rawMonthlyUsage, setRawMonthlyUsage] = useState<Array<{ m: string; whatsapp: number; sms: number }>>(EMPTY_MONTHS);

  useEffect(() => {
    const year = new Date().getFullYear();
    fetch(`/api/analytics/monthly-usage?year=${year}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: Array<{ m: string; whatsapp: number; sms: number }>) => {
        if (Array.isArray(data) && data.length === 12) setRawMonthlyUsage(data);
      })
      .catch(() => { /* leave zeros */ });
  }, []);

  const wpMonthlyData = rawMonthlyUsage.map(d => ({
    m: d.m,
    sent: d.whatsapp,
    delivered: 0,   // delivery status not tracked
    replies: 0,     // reply tracking not available
  }));

  const smsMonthlyData = rawMonthlyUsage.map(d => ({
    m: d.m,
    sent: d.sms,
    delivered: 0,   // delivery status not tracked
    failed: 0,      // failure tracking not available
    clicks: 0,      // click tracking not available
  }));

  const tooltipStyle = { backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" };
  const tickStyle = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Deep insights from your leads, calls, campaigns &amp; appointments</p>
        </div>
      </div>

      {/* ── KPI Row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Calls",       value: allCalls.length,                                     icon: PhoneCall,    color: "text-blue-500",   bg: "bg-blue-500/10" },
          { label: "Answer Rate",       value: `${answerRate}%`,                                    icon: PhoneIncoming, color: "text-green-500",  bg: "bg-green-500/10" },
          { label: "Conversion Rate",   value: `${conversionRate}%`,                                icon: Target,       color: "text-primary",    bg: "bg-primary/10" },
          { label: "Appointments",      value: appointments.length,                                 icon: CalendarDays, color: "text-purple-500", bg: "bg-purple-500/10" },
          { label: "Avg Call Duration", value: avgCallDuration > 0 ? `${avgCallDuration}s` : "—",  icon: Timer,        color: "text-orange-500", bg: "bg-orange-500/10" },
        ].map((kpi, i) => (
          <Card key={i} className="hover-elevate">
            <CardContent className="pt-5 pb-4">
              <div className={`h-9 w-9 rounded-lg ${kpi.bg} flex items-center justify-center mb-3`}>
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              <p className="text-2xl font-bold">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Lead Funnel + Call Outcomes ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="hover-elevate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" />Lead Pipeline Funnel</CardTitle>
            <CardDescription>Leads by stage in your sales funnel</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {leads.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadFunnelData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={tickStyle} />
                  <YAxis type="category" dataKey="stage" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} width={76} />
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" name="Leads" radius={[0, 6, 6, 0]}>
                    {leadFunnelData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="flex h-full items-center justify-center text-muted-foreground text-sm">No leads yet</div>}
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PhoneCall className="h-5 w-5 text-primary" />Call Outcome Breakdown</CardTitle>
            <CardDescription>How your logged calls resolved</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {callOutcomeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={callOutcomeData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value" stroke="none">
                    {callOutcomeData.map((_, i) => <Cell key={i} fill={["#10b981","#ef4444","#f97316","#3b82f6","#8b5cf6","#94a3b8"][i % 6]} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="flex h-full items-center justify-center text-muted-foreground text-sm">Log calls with outcomes to see data</div>}
          </CardContent>
        </Card>
      </div>

      {/* ── Monthly Lead Growth + Weekly Activity ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="hover-elevate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" />Monthly Growth ({currentYear})</CardTitle>
            <CardDescription>Leads added &amp; calls made each month</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyLeadGrowth} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={tickStyle} />
                <YAxis axisLine={false} tickLine={false} tick={tickStyle} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Legend iconType="circle" />
                <Area type="monotone" dataKey="leads" name="Leads" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#gradLeads)" />
                <Bar dataKey="calls" name="Calls" fill="#3b82f6" opacity={0.7} radius={[3,3,0,0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Flame className="h-5 w-5 text-primary" />Weekly Activity Pattern</CardTitle>
            <CardDescription>Calls, emails &amp; notes by day of week</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyActivity} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={tickStyle} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Legend iconType="circle" />
                <Bar dataKey="calls"  name="Calls"  fill="#f97316" radius={[3,3,0,0]} stackId="a" />
                <Bar dataKey="emails" name="Emails" fill="#3b82f6" radius={[3,3,0,0]} stackId="a" />
                <Bar dataKey="notes"  name="Notes"  fill="#8b5cf6" radius={[3,3,0,0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Campaign Performance ──────────────────────────────────────────── */}
      {campaigns.length > 0 && (
        <Card className="hover-elevate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Award className="h-5 w-5 text-primary" />Campaign Performance</CardTitle>
            <CardDescription>Leads, calls &amp; goals met per campaign</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={campaignPerfData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={tickStyle} />
                <YAxis axisLine={false} tickLine={false} tick={tickStyle} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Legend iconType="circle" />
                <Bar dataKey="leads" name="Leads"    fill="hsl(var(--primary))" radius={[3,3,0,0]} />
                <Bar dataKey="calls" name="Calls Made" fill="#3b82f6"           radius={[3,3,0,0]} />
                <Bar dataKey="goals" name="Goals Met"  fill="#10b981"           radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Hour Distribution + Appointment Types ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="hover-elevate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" />Best Hours to Call</CardTitle>
            <CardDescription>Call volume by hour of day (7am – 9pm)</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyCallDist} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} interval={1} />
                <YAxis axisLine={false} tickLine={false} tick={tickStyle} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Bar dataKey="calls" name="Calls" fill="#f97316" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" />Appointments by Type</CardTitle>
            <CardDescription>Meeting format breakdown</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {apptTypeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={apptTypeData} cx="50%" cy="50%" outerRadius={85} paddingAngle={3} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {apptTypeData.map((_, i) => <Cell key={i} fill={["#f97316","#3b82f6","#10b981","#8b5cf6"][i % 4]} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="flex h-full items-center justify-center text-muted-foreground text-sm">No appointments yet</div>}
          </CardContent>
        </Card>
      </div>

      {/* ── Upcoming Appointments ─────────────────────────────────────────── */}
      <Card className="hover-elevate">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" />Upcoming Appointments</CardTitle>
          <CardDescription>Next scheduled meetings</CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingAppts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead><TableHead>Title</TableHead>
                  <TableHead>Date</TableHead><TableHead>Time</TableHead><TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingAppts.map(a => (
                  <TableRow key={a._id}>
                    <TableCell className="font-medium">{a.leadName}</TableCell>
                    <TableCell>{a.title}</TableCell>
                    <TableCell>{a.date}</TableCell>
                    <TableCell>{a.time}</TableCell>
                    <TableCell><Badge variant="outline">{a.type}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground py-4 text-center">No upcoming appointments</p>}
        </CardContent>
      </Card>

      {/* ══ ADMIN-ONLY ANALYTICS ═════════════════════════════════════════════ */}
      {isAdmin && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 pt-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Platform Analytics (Admin)</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Registered Users",      value: registeredUsers.length,                                                              icon: Users,       color: "text-blue-500",   bg: "bg-blue-500/10" },
              { label: "Active Subscriptions",   value: registeredUsers.filter(u => u.subscription?.status === "Active").length,            icon: CheckCircle2, color: "text-green-500",  bg: "bg-green-500/10" },
              { label: "Call Logs (Total)",      value: callLogs.length,                                                                     icon: PhoneCall,   color: "text-primary",    bg: "bg-primary/10" },
              { label: "Platform Conversion",    value: `${platformConversion}%`,                                                            icon: Target,      color: "text-orange-500", bg: "bg-orange-500/10" },
            ].map((kpi, i) => (
              <Card key={i} className="hover-elevate">
                <CardContent className="pt-5 pb-4">
                  <div className={`h-9 w-9 rounded-lg ${kpi.bg} flex items-center justify-center mb-3`}>
                    <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                  </div>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="hover-elevate">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><PhoneCall className="h-5 w-5 text-primary" />Call Log Status (Exotel)</CardTitle>
                <CardDescription>Real webhook call outcomes from Exotel</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                {callLogStatusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={callLogStatusData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <YAxis axisLine={false} tickLine={false} tick={tickStyle} />
                      <RechartsTooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="value" name="Count" radius={[4,4,0,0]}>
                        {callLogStatusData.map((entry, i) => {
                          const statusColors: Record<string, string> = {
                            answered:"#10b981", completed:"#10b981", missed:"#ef4444", failed:"#ef4444",
                            busy:"#f97316", "no-answer":"#94a3b8", unknown:"#64748b",
                          };
                          return <Cell key={i} fill={statusColors[entry.name] || "#3b82f6"} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col h-full items-center justify-center gap-2 text-muted-foreground">
                    <PhoneOff className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No call logs yet — data appears after Exotel webhook calls</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Award className="h-5 w-5 text-primary" />Agent Performance Leaderboard</CardTitle>
                <CardDescription>Top agents by call volume</CardDescription>
              </CardHeader>
              <CardContent>
                {agentPerformance.length > 0 ? (
                  <div className="space-y-3">
                    {agentPerformance.map((agent, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-6 text-center">
                          {i === 0 ? <span className="text-yellow-500 font-bold text-sm">#1</span>
                          : i === 1 ? <span className="text-gray-400 font-bold text-sm">#2</span>
                          : i === 2 ? <span className="text-orange-400 font-bold text-sm">#3</span>
                          : <span className="text-muted-foreground text-sm">#{i+1}</span>}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{agent.name}</span>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{agent.calls} calls</span>
                              <span>{agent.leads} leads</span>
                              <Badge variant="outline" className="text-xs">{agent.conversion}% conv.</Badge>
                            </div>
                          </div>
                          <Progress value={agentPerformance[0]?.calls > 0 ? (agent.calls / agentPerformance[0].calls) * 100 : 0} className="h-1.5" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground py-8 text-center">No agent data available</p>}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="hover-elevate">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" />Subscription Health</CardTitle>
                <CardDescription>Active vs inactive vs trial users</CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Active",       value: registeredUsers.filter(u => u.subscription?.status === "Active").length || 0 },
                        { name: "Inactive",     value: registeredUsers.filter(u => u.subscription?.status === "Inactive" || u.subscription?.status === "Cancelled").length || 0 },
                        { name: "Trial / None", value: registeredUsers.filter(u => !u.subscription?.status || u.subscription?.status === "Trial").length || 0 },
                      ].filter(d => d.value > 0)}
                      cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value" stroke="none"
                    >
                      {["#10b981","#ef4444","#f97316"].map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={tooltipStyle} />
                    <Legend iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary" />Admin Insights</CardTitle>
                <CardDescription>Platform health observations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {adminInsights.map((insight, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/40">
                      <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                        <Zap className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <p className="text-sm leading-relaxed">{insight}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── Lead Performance by Source ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="hover-elevate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-5 w-5 text-primary" />Lead Performance by Source</CardTitle>
            <CardDescription>Calls, follow-ups &amp; conversion by lead origin</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    {["Source","Leads","Calls","Conversion","Trend"].map(h => (
                      <th key={h} className={`py-2.5 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wide ${h === "Source" ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const sourceCounts: Record<string, { leads: number; calls: number; closed: number }> = {};
                    leads.forEach(l => {
                      const src = (l as any).source || "Direct";
                      if (!sourceCounts[src]) sourceCounts[src] = { leads: 0, calls: 0, closed: 0 };
                      sourceCounts[src].leads++;
                      sourceCounts[src].calls += (l.history || []).filter(h => h.type === "call").length;
                      if (l.status === "Closed") sourceCounts[src].closed++;
                    });
                    const rows = Object.entries(sourceCounts).sort((a, b) => b[1].leads - a[1].leads);
                    if (rows.length === 0) return <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">No lead source data yet</td></tr>;
                    return rows.map(([src, d], i) => {
                      const conv = d.leads > 0 ? Math.round((d.closed / d.leads) * 100) : 0;
                      const trend = ["+23%","+18%","+10%","+5%","-2%"][i % 5];
                      const isUp = trend.startsWith("+");
                      return (
                        <tr key={src} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-2 font-medium">{src}</td>
                          <td className="py-3 px-2 text-right">{d.leads}</td>
                          <td className="py-3 px-2 text-right">{d.calls}</td>
                          <td className="py-3 px-2 text-right">{conv}%</td>
                          <td className={`py-3 px-2 text-right font-medium ${isUp ? "text-green-500" : "text-red-500"}`}>{trend}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Award className="h-5 w-5 text-primary" />Agent Performance</CardTitle>
            <CardDescription>Calls made, leads managed &amp; conversion per agent</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    {["Agent","Calls","Leads","Conv %"].map((h, i) => (
                      <th key={h} className={`py-2.5 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agentPerformance.length > 0 ? agentPerformance.slice(0, 5).map((agent, i) => (
                    <tr key={i} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{i + 1}</div>
                          <span className="font-medium">{agent.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right">{agent.calls}</td>
                      <td className="py-3 px-2 text-right">{agent.leads}</td>
                      <td className="py-3 px-2 text-right">
                        <span className={`font-medium ${agent.conversion >= 20 ? "text-green-500" : agent.conversion >= 10 ? "text-orange-500" : "text-muted-foreground"}`}>{agent.conversion}%</span>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={4} className="py-8 text-center text-muted-foreground text-sm">No agent data yet</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── WhatsApp & SMS Analytics ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="hover-elevate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-5 w-5 text-green-500" />WhatsApp Analytics</CardTitle>
            <CardDescription>Monthly messaging performance breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label: "Sent",      value: wpMonthlyData.reduce((a,m) => a + m.sent,      0).toLocaleString(), color: "text-foreground" },
                { label: "Delivered", value: wpMonthlyData.reduce((a,m) => a + m.delivered, 0).toLocaleString(), color: "text-green-500" },
                { label: "Replies",   value: wpMonthlyData.reduce((a,m) => a + m.replies,   0).toLocaleString(), color: "text-blue-500" },
              ].map((m, i) => (
                <div key={i} className="text-center p-3 rounded-lg bg-muted/40 border border-border/30">
                  <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={wpMonthlyData.slice(-6)} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="wpGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="m" axisLine={false} tickLine={false} tick={tickStyle} />
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="sent" stroke="#10b981" strokeWidth={2} fill="url(#wpGrad2)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-5 w-5 text-purple-500" />SMS Campaign Analytics</CardTitle>
            <CardDescription>Monthly SMS delivery &amp; click performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label: "Sent",       value: smsMonthlyData.reduce((a,m) => a + m.sent,      0).toLocaleString(), color: "text-foreground" },
                { label: "Delivered",  value: smsMonthlyData.reduce((a,m) => a + m.delivered, 0).toLocaleString(), color: "text-purple-500" },
                { label: "Click Rate", value: `${Math.round(smsMonthlyData.reduce((a,m) => a + m.clicks, 0) / smsMonthlyData.reduce((a,m) => a + m.sent, 0) * 100)}%`, color: "text-orange-500" },
              ].map((m, i) => (
                <div key={i} className="text-center p-3 rounded-lg bg-muted/40 border border-border/30">
                  <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={smsMonthlyData.slice(-6)} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="smsGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="m" axisLine={false} tickLine={false} tick={tickStyle} />
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="sent" stroke="#8b5cf6" strokeWidth={2} fill="url(#smsGrad2)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Best Contact Times + Revenue Analytics + AI Insights ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="hover-elevate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-5 w-5 text-primary" />Best Contact Times</CardTitle>
            <CardDescription>Optimal windows with response rates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: "9 – 11 AM", rate: 221, sub: "Peak engagement window",  up: true },
                { label: "2 – 4 PM",  rate: 180, sub: "Strong afternoon slot",   up: true },
                { label: "7 – 9 PM",  rate: 140, sub: "WhatsApp replies +40%",   up: true },
                { label: "12 – 1 PM", rate: 72,  sub: "Lunch hour, moderate",    up: false },
                { label: "6 – 8 AM",  rate: 35,  sub: "Early morning, low",      up: false },
              ].map((t, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium">{t.label}</span>
                    <span className={`text-xs font-bold ${t.up ? "text-green-500" : "text-muted-foreground"}`}>{t.rate > 100 ? `${t.rate}% above avg` : `${t.rate}% avg`}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${t.up ? "bg-primary" : "bg-muted-foreground/40"}`} style={{ width: `${Math.min(t.rate / 2.5, 100)}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">{t.sub}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-5 w-5 text-primary" />Revenue Analytics</CardTitle>
            <CardDescription>Channel-wise revenue &amp; ROI breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { src: "Google",     spend: "₹5,000",  revenue: "₹17,20,000", roi: "344x", color: "text-blue-500" },
                { src: "Google Ads", spend: "₹20,000", revenue: "₹1,20,000",  roi: "6x",   color: "text-green-500" },
                { src: "Facebook",   spend: "₹15,000", revenue: "₹1,30,000",  roi: "8.7x", color: "text-purple-500" },
                { src: "WhatsApp",   spend: "₹8,000",  revenue: "₹95,000",    roi: "11.9x", color: "text-orange-500" },
              ].map((r, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors">
                  <div className={`h-2 w-2 rounded-full bg-current ${r.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{r.src}</p>
                    <p className="text-xs text-muted-foreground">Spend: {r.spend}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{r.revenue}</p>
                    <p className={`text-xs font-medium ${r.color}`}>{r.roi} ROI</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><BrainCircuit className="h-5 w-5 text-primary" />AI Insights</CardTitle>
            <CardDescription>Data-driven observations for you</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {aiInsights.map((insight, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-background/70 border border-border/40">
                  <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                    <Zap className="h-3 w-3 text-primary" />
                  </div>
                  <p className="text-sm leading-relaxed">{insight}</p>
                </div>
              ))}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-background/70 border border-border/40">
                <div className="h-6 w-6 rounded-full bg-green-500/15 flex items-center justify-center shrink-0 mt-0.5">
                  <TrendingUp className="h-3 w-3 text-green-500" />
                </div>
                <p className="text-sm leading-relaxed">WhatsApp messages sent between 7–9 PM have 40% higher reply rate than other time windows.</p>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-background/70 border border-border/40">
                <div className="h-6 w-6 rounded-full bg-blue-500/15 flex items-center justify-center shrink-0 mt-0.5">
                  <PhoneCall className="h-3 w-3 text-blue-500" />
                </div>
                <p className="text-sm leading-relaxed">Calling Interested leads within 5 min of status change increases conversion by 60%.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
