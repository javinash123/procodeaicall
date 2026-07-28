import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPlanSchema, type Plan } from "@shared/schema";
import { SYSTEM_FEATURES } from "@shared/features";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import {
  Plus, Trash2, Loader2, Edit2, Search,
  ChevronLeft, ChevronRight, X, Users, Megaphone,
  Calendar, MessageCircle, MessageSquare, History, BarChart2,
  CheckCircle2, LucideIcon,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useState, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

// Map SYSTEM_FEATURES icon name → Lucide component
const ICON_MAP: Record<string, LucideIcon> = {
  Users, Megaphone, Calendar, MessageCircle, MessageSquare, History, BarChart2,
};

// ─── PlanFormFields ────────────────────────────────────────────────────────────
// Shared between create and edit so both dialogs always stay in sync.
function PlanFormFields({
  form,
  limInput,
  setLimInput,
  limRef,
}: {
  form: ReturnType<typeof useForm<any>>;
  limInput: string;
  setLimInput: (v: string) => void;
  limRef: React.RefObject<HTMLInputElement | null>;
}) {
  const addLimitation = () => {
    const val = limInput.trim();
    if (!val) return;
    const current: string[] = form.getValues("limitations") || [];
    if (!current.includes(val)) form.setValue("limitations", [...current, val]);
    setLimInput("");
    limRef.current?.focus();
  };

  return (
    <Tabs defaultValue="basic" className="w-full">
      <TabsList className="grid w-full grid-cols-4 mb-4">
        <TabsTrigger value="basic">Basic Info</TabsTrigger>
        <TabsTrigger value="features">Features</TabsTrigger>
        <TabsTrigger value="credits">Credits & Rates</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      {/* ── Tab 1: Basic Info ── */}
      <TabsContent value="basic" className="space-y-4 mt-0">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Plan Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Professional, Enterprise" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price (₹)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="duration"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Billing Period</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="lifetime">Lifetime</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Plan Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe what this plan offers…"
                  className="min-h-[80px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </TabsContent>

      {/* ── Tab 2: Features ── */}
      <TabsContent value="features" className="mt-0">
        <div className="space-y-2 mb-3">
          <Label>Included Features</Label>
          <p className="text-xs text-muted-foreground">
            Select which platform features users on this plan can access.
          </p>
        </div>
        <div className="space-y-2">
          {SYSTEM_FEATURES.map((feature) => {
            const Icon = ICON_MAP[feature.icon] ?? CheckCircle2;
            const selected: string[] = form.watch("features") || [];
            const isChecked = selected.includes(feature.key);
            return (
              <label
                key={feature.key}
                htmlFor={`feat-${feature.key}`}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isChecked
                    ? "border-primary/60 bg-primary/5"
                    : "border-border bg-muted/20 hover:bg-muted/40"
                }`}
              >
                <Checkbox
                  id={`feat-${feature.key}`}
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    const current: string[] = form.getValues("features") || [];
                    form.setValue(
                      "features",
                      checked
                        ? [...current, feature.key]
                        : current.filter((k) => k !== feature.key)
                    );
                  }}
                  className="mt-0.5"
                />
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${isChecked ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <p className={`text-sm font-medium leading-tight ${isChecked ? "text-primary" : ""}`}>
                      {feature.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {(form.watch("features") || []).length} of {SYSTEM_FEATURES.length} features selected
        </p>
      </TabsContent>

      {/* ── Tab 3: Credits & Rates ── */}
      <TabsContent value="credits" className="space-y-4 mt-0">
        <FormField
          control={form.control}
          name="credits"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Monthly Credits Included</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                Credits used for AI calls, SMS, and WhatsApp messages.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-3 gap-3">
          <FormField
            control={form.control}
            name="callingRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Call Rate (₹/min)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="smsRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SMS Rate (₹/msg)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="whatsappRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>WA Rate (₹/msg)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="extraCreditPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Extra Credit Price (₹/credit)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="0 = disabled"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">0 = top-up purchases disabled.</p>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="maxCreditPurchase"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Credits Per Purchase</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0 = unlimited"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">0 = no limit per transaction.</p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </TabsContent>

      {/* ── Tab 4: Settings ── */}
      <TabsContent value="settings" className="space-y-4 mt-0">
        <div className="space-y-3">
          <Label>Limitations / Restrictions</Label>
          <p className="text-xs text-muted-foreground">
            Add notes shown to users on the pricing page (e.g. "Up to 5 users", "No API access").
          </p>
          <div className="flex gap-2">
            <Input
              ref={limRef}
              placeholder='Type a limitation and press Enter (e.g. "Up to 3 users")'
              value={limInput}
              onChange={(e) => setLimInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addLimitation(); }
              }}
            />
            <Button type="button" variant="outline" onClick={addLimitation}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 min-h-[32px]">
            {(form.watch("limitations") || []).map((lim: string, idx: number) => (
              <Badge key={idx} variant="secondary" className="gap-1 pr-1">
                {lim}
                <button
                  type="button"
                  className="ml-1 rounded-full hover:bg-muted"
                  onClick={() => {
                    const current: string[] = form.getValues("limitations") || [];
                    form.setValue("limitations", current.filter((_, i) => i !== idx));
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Plan Active</FormLabel>
                <p className="text-xs text-muted-foreground">
                  Inactive plans are hidden from the pricing page and cannot be subscribed to.
                </p>
              </div>
              <FormControl>
                <Select onValueChange={(v) => field.onChange(v === "yes")} value={field.value ? "yes" : "no"}>
                  <SelectTrigger className="w-[90px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Active</SelectItem>
                    <SelectItem value="no">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="selfBranding"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>White-Label / Self Branding</FormLabel>
                <p className="text-xs text-muted-foreground">
                  Allow users on this plan to use their own branding.
                </p>
              </div>
              <FormControl>
                <Select onValueChange={(v) => field.onChange(v === "yes")} value={field.value ? "yes" : "no"}>
                  <SelectTrigger className="w-[90px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
            </FormItem>
          )}
        />
      </TabsContent>
    </Tabs>
  );
}

// ─── Default form values ───────────────────────────────────────────────────────
const DEFAULT_VALUES = {
  name: "",
  price: 0,
  duration: "monthly" as const,
  credits: 0,
  callingRate: 0,
  smsRate: 0,
  whatsappRate: 0,
  extraCreditPrice: 0,
  maxCreditPurchase: 0,
  features: [] as string[],
  limitations: [] as string[],
  description: "",
  isActive: true,
  selfBranding: false,
};

// ─── Main component ────────────────────────────────────────────────────────────
export default function AdminPlans() {
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [search, setSearch] = useState("");
  const [filterDuration, setFilterDuration] = useState("all");
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  // Limitation tag-input state (separate for add/edit dialogs)
  const [newLimInput, setNewLimInput] = useState("");
  const [editLimInput, setEditLimInput] = useState("");
  const newLimRef = useRef<HTMLInputElement>(null);
  const editLimRef = useRef<HTMLInputElement>(null);

  const { data: plansResponse, isLoading } = useQuery<{ plans: Plan[] }>({
    queryKey: ["/api/plans"],
  });
  const plans = plansResponse?.plans || [];

  const filteredPlans = useMemo(() => plans.filter((plan) => {
    const matchesSearch = plan.name.toLowerCase().includes(search.toLowerCase());
    const matchesDuration = filterDuration === "all" || plan.duration === filterDuration;
    return matchesSearch && matchesDuration;
  }), [plans, search, filterDuration]);

  const totalPages = Math.ceil(filteredPlans.length / itemsPerPage);
  const paginatedPlans = filteredPlans.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  // ── Forms ──────────────────────────────────────────────────────────────────
  const form = useForm({ resolver: zodResolver(insertPlanSchema), defaultValues: DEFAULT_VALUES });
  const editForm = useForm({ resolver: zodResolver(insertPlanSchema), defaultValues: DEFAULT_VALUES });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createPlanMutation = useMutation({
    mutationFn: async (data: any) => (await apiRequest("POST", "/api/plans", data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      toast({ title: "Plan created" });
      setIsAddOpen(false);
      form.reset(DEFAULT_VALUES);
      setNewLimInput("");
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const updatePlanMutation = useMutation({
    mutationFn: async (data: any) =>
      (await apiRequest("PATCH", `/api/plans/${editingPlan?._id}`, data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      toast({ title: "Plan updated" });
      setIsEditOpen(false);
      setEditingPlan(null);
      editForm.reset(DEFAULT_VALUES);
      setEditLimInput("");
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/plans/${id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      toast({ title: "Plan deleted" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleEdit = (plan: Plan) => {
    setEditingPlan(plan);
    editForm.reset({
      name: plan.name,
      price: plan.price,
      duration: plan.duration as any,
      credits: plan.credits,
      callingRate: plan.callingRate || 0,
      smsRate: plan.smsRate || 0,
      whatsappRate: plan.whatsappRate || 0,
      extraCreditPrice: (plan as any).extraCreditPrice || 0,
      maxCreditPurchase: (plan as any).maxCreditPurchase || 0,
      features: (plan.features || []).filter((k: string) =>
        SYSTEM_FEATURES.some((f) => f.key === k)
      ),
      limitations: plan.limitations || [],
      description: plan.description || "",
      isActive: plan.isActive ?? true,
      selfBranding: plan.selfBranding ?? false,
    });
    setEditLimInput("");
    setIsEditOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Subscription Plans</h1>
          <p className="text-muted-foreground">
            Create and manage plans — features are defined by the system and selected per plan.
          </p>
        </div>
        <Button onClick={() => { form.reset(DEFAULT_VALUES); setNewLimInput(""); setIsAddOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> New Plan
        </Button>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search plans…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={filterDuration} onValueChange={(v) => { setFilterDuration(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All durations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Durations</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
            <SelectItem value="lifetime">Lifetime</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Plans table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Plan</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>Features Included</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedPlans.length > 0 ? (
                paginatedPlans.map((plan) => {
                  const planFeatureKeys: string[] = plan.features || [];
                  const planFeatureDefs = SYSTEM_FEATURES.filter((f) =>
                    planFeatureKeys.includes(f.key)
                  );
                  return (
                    <TableRow key={plan._id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{plan.name}</p>
                          {plan.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {plan.description.replace(/<[^>]*>/g, "")}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">₹{plan.price}</TableCell>
                      <TableCell className="capitalize">{plan.duration}</TableCell>
                      <TableCell>{plan.credits.toLocaleString()}</TableCell>
                      <TableCell>
                        {planFeatureDefs.length === 0 ? (
                          <span className="text-xs text-muted-foreground">None</span>
                        ) : planFeatureDefs.length === SYSTEM_FEATURES.length ? (
                          <Badge variant="default" className="text-xs">All features</Badge>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {planFeatureDefs.map((f) => (
                              <Badge key={f.key} variant="secondary" className="text-xs">
                                {f.label}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={plan.isActive ? "default" : "outline"} className="text-xs">
                          {plan.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(plan)}>
                            <Edit2 className="h-4 w-4 text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            disabled={deletePlanMutation.isPending}
                            onClick={() => {
                              if (confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) {
                                deletePlanMutation.mutate(plan._id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    {search || filterDuration !== "all"
                      ? "No plans match your filters."
                      : "No plans yet. Click \"New Plan\" to create one."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* ── Create Plan Dialog ── */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Plan</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => createPlanMutation.mutate(data))}
              className="space-y-4 py-2"
            >
              <PlanFormFields
                form={form}
                limInput={newLimInput}
                setLimInput={setNewLimInput}
                limRef={newLimRef}
              />
              <Button type="submit" className="w-full" disabled={createPlanMutation.isPending}>
                {createPlanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Plan
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Plan Dialog ── */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Plan — {editingPlan?.name}</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit((data) => updatePlanMutation.mutate(data))}
              className="space-y-4 py-2"
            >
              <PlanFormFields
                form={editForm}
                limInput={editLimInput}
                setLimInput={setEditLimInput}
                limRef={editLimRef}
              />
              <Button type="submit" className="w-full" disabled={updatePlanMutation.isPending}>
                {updatePlanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
