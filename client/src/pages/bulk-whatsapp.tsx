import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, MessageCircle, Calendar as CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { campaignsApi, leadsApi } from "@/lib/api";
import type { Campaign, Lead } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function BulkWhatsapp() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

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
  }, []);

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         lead.phone.includes(searchTerm);
    const matchesCampaign = campaignFilter === "all" || lead.campaignId === campaignFilter;
    
    let matchesDate = true;
    if (dateRange.start || dateRange.end) {
      const contactDate = lead.lastContact ? new Date(lead.lastContact) : new Date(lead.createdAt);
      if (dateRange.start && contactDate < new Date(dateRange.start)) matchesDate = false;
      if (dateRange.end && contactDate > new Date(dateRange.end)) matchesDate = false;
    }

    return matchesSearch && matchesCampaign && matchesDate;
  });

  if (!user) return null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <MessageCircle className="h-8 w-8 text-primary" />
          Bulk WhatsApp
        </h1>
        <p className="text-muted-foreground">View-only list of WhatsApp communications and lead status.</p>
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

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>WhatsApp History</CardTitle>
          <CardDescription>{filteredLeads.length} leads found</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border h-[600px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr>
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
                    <td colSpan={5} className="p-12 text-center text-muted-foreground">
                      No WhatsApp records found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
