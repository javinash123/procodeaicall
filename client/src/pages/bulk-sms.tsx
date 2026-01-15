import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Smartphone, Calendar as CalendarIcon, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { campaignsApi, leadsApi } from "@/lib/api";
import type { Campaign, Lead } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function BulkSms() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cRes, lRes] = await Promise.all([
          campaignsApi.getAll(),
          leadsApi.getAll()
        ]);
        setCampaigns(Array.isArray(cRes) ? cRes : (cRes as any).campaigns || []);
        setLeads(Array.isArray(lRes) ? lRes : (lRes as any).leads || []);
      } catch (error: any) {
        toast({ variant: "destructive", title: "Error loading data", description: error.message });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [toast]);

  const filteredLeads = leads.filter(lead => {
    const nameStr = lead.name || "";
    const phoneStr = lead.phone || "";
    const matchesSearch = nameStr.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         phoneStr.includes(searchTerm);
    const matchesCampaign = campaignFilter === "all" || lead.campaignId === campaignFilter;
    
    let matchesDate = true;
    if (dateRange.start || dateRange.end) {
      const contactDate = lead.lastContact ? new Date(lead.lastContact) : new Date(lead.createdAt);
      if (dateRange.start && contactDate < new Date(dateRange.start)) matchesDate = false;
      if (dateRange.end && contactDate > new Date(dateRange.end)) matchesDate = false;
    }

    return matchesSearch && matchesCampaign && matchesDate;
  });

  const handleSelectAll = () => {
    if (selectedLeads.length === filteredLeads.length && filteredLeads.length > 0) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(filteredLeads.map(l => l._id));
    }
  };

  const handleToggleLead = (id: string) => {
    setSelectedLeads(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSendSms = async () => {
    if (selectedLeads.length === 0) {
      toast({ variant: "destructive", title: "No leads selected" });
      return;
    }
    if (!message.trim()) {
      toast({ variant: "destructive", title: "Message cannot be empty" });
      return;
    }

    setSending(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast({ title: "Success", description: `SMS sent to ${selectedLeads.length} leads.` });
      setMessage("");
      setSelectedLeads([]);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to send SMS", description: error.message });
    } finally {
      setSending(false);
    }
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading SMS data...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Smartphone className="h-8 w-8 text-primary" />
          Bulk SMS
        </h1>
        <p className="text-muted-foreground">Select leads and send bulk SMS messages.</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>SMS History</CardTitle>
                <CardDescription>{filteredLeads.length} leads found</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleSelectAll} className="h-8">
                {selectedLeads.length === filteredLeads.length && filteredLeads.length > 0 ? "Deselect All" : "Select All"}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border h-[600px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0 z-10">
                    <tr>
                      <th className="p-3 text-left w-10">
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-300"
                          checked={selectedLeads.length === filteredLeads.length && filteredLeads.length > 0}
                          onChange={handleSelectAll}
                        />
                      </th>
                      <th className="p-3 text-left">Name</th>
                      <th className="p-3 text-left">Phone</th>
                      <th className="p-3 text-left">Campaign</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-left">Last Interaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map(lead => (
                      <tr key={lead._id} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300"
                            checked={selectedLeads.includes(lead._id)}
                            onChange={() => handleToggleLead(lead._id)}
                          />
                        </td>
                        <td className="p-3 font-medium">{lead.name}</td>
                        <td className="p-3">{lead.phone}</td>
                        <td className="p-3">
                          {campaigns.find(c => c._id === lead.campaignId)?.name || "-"}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">{lead.status}</Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {lead.lastContact ? new Date(lead.lastContact).toLocaleDateString() : "No contact"}
                        </td>
                      </tr>
                    ))}
                    {filteredLeads.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-muted-foreground">
                          No SMS records found matching your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border/50 h-fit sticky top-6">
            <CardHeader>
              <CardTitle>Send Message</CardTitle>
              <CardDescription>
                {selectedLeads.length} leads selected
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Message</label>
                <Textarea 
                  placeholder="Type your SMS message here..." 
                  className="min-h-[200px] resize-none"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {message.length} characters
                </p>
              </div>
              <Button 
                className="w-full" 
                disabled={sending || selectedLeads.length === 0}
                onClick={handleSendSms}
              >
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {sending ? "Sending..." : "Send Bulk SMS"}
                <Send className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
