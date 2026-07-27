import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPlanSchema, type Plan, type Feature, insertFeatureSchema } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Loader2, List, Edit2, Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

export default function AdminPlans() {
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isFeaturesOpen, setIsFeaturesOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  
  // Search, Filter, Pagination states
  const [search, setSearch] = useState("");
  const [filterDuration, setFilterDuration] = useState("all");
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  const { data: plansResponse, isLoading: plansLoading } = useQuery<{ plans: Plan[] }>({ 
    queryKey: ["/api/plans"] 
  });
  const { data: featuresResponse, isLoading: featuresLoading } = useQuery<{ features: Feature[] }>({ 
    queryKey: ["/api/features"] 
  });

  const plans = plansResponse?.plans || [];
  const features = featuresResponse?.features || [];

  // Derived data
  const filteredPlans = useMemo(() => {
    return plans.filter(plan => {
      const matchesSearch = plan.name.toLowerCase().includes(search.toLowerCase());
      const matchesDuration = filterDuration === "all" || plan.duration === filterDuration;
      return matchesSearch && matchesDuration;
    });
  }, [plans, search, filterDuration]);

  const totalPages = Math.ceil(filteredPlans.length / itemsPerPage);
  const paginatedPlans = filteredPlans.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const createPlanMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/plans", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      toast({ title: "Success", description: "Plan created successfully" });
      setIsAddOpen(false);
      form.reset();
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/plans/${editingPlan?._id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      toast({ title: "Success", description: "Plan updated successfully" });
      setIsEditOpen(false);
      setEditingPlan(null);
      editForm.reset();
    },
  });

  const createFeatureMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/features", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/features"] });
      toast({ title: "Success", description: "Feature created successfully" });
      featureForm.reset();
    },
  });

  const deleteFeatureMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/features/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/features"] });
      toast({ title: "Deleted", description: "Feature deleted successfully" });
    },
  });

  const form = useForm({
    resolver: zodResolver(insertPlanSchema),
    defaultValues: {
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
    },
  });

  const editForm = useForm({
    resolver: zodResolver(insertPlanSchema),
    defaultValues: {
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
    },
  });

  const featureForm = useForm({
    resolver: zodResolver(insertFeatureSchema),
    defaultValues: {
      key: "",
      name: "",
    },
  });

  // Limitations tag-input state
  const [newLimInput, setNewLimInput] = useState("");
  const [editLimInput, setEditLimInput] = useState("");
  const newLimRef = useRef<HTMLInputElement>(null);
  const editLimRef = useRef<HTMLInputElement>(null);

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
      features: plan.features || [],
      limitations: plan.limitations || [],
      description: plan.description || "",
      isActive: plan.isActive,
      selfBranding: plan.selfBranding ?? false,
    });
    setIsEditOpen(true);
  };

  if (plansLoading || featuresLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Subscription Plans</h1>
          <p className="text-muted-foreground">Manage your pricing plans and features</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isFeaturesOpen} onOpenChange={setIsFeaturesOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <List className="h-4 w-4 mr-2" /> Manage Features
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Manage Features</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <Form {...featureForm}>
                  <form
                    onSubmit={featureForm.handleSubmit((data) => createFeatureMutation.mutate(data))}
                    className="space-y-3"
                  >
                    <FormField
                      control={featureForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Feature Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., Bulk SMS"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e);
                                featureForm.setValue(
                                  "key",
                                  e.target.value
                                    .toLowerCase()
                                    .replace(/\s+/g, "_")
                                    .replace(/[^a-z0-9_]/g, "")
                                );
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={featureForm.control}
                      name="key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Feature Key <span className="text-xs text-muted-foreground">(auto-generated)</span></FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., bulk_sms" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={createFeatureMutation.isPending}>
                      {createFeatureMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Plus className="h-4 w-4 mr-2" /> Add Feature
                    </Button>
                  </form>
                </Form>

                <div className="space-y-2">
                  <h3 className="font-semibold">Existing Features</h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {Array.isArray(features) && features.length > 0 ? (
                      features.map((feature) => (
                        <div key={feature._id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border bg-muted/30">
                          <div>
                            <p className="text-sm font-medium">{feature.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{feature.key}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                            onClick={() => {
                              if (confirm(`Delete feature "${feature.name}"?`)) {
                                deleteFeatureMutation.mutate(feature._id);
                              }
                            }}
                            disabled={deleteFeatureMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No features created yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Add Plan
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Subscription Plan</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => createPlanMutation.mutate(data))} className="space-y-4 py-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Plan Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Enterprise" {...field} />
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
                            <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
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
                          <FormLabel>Duration</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select duration" />
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
                    name="credits"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Credits</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="callingRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Calling Rate (₹/min)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
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
                            <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
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
                          <FormLabel>WhatsApp Rate (₹/msg)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="extraCreditPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Extra Credit Price (₹/credit)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="0 = disabled" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">Price users pay per extra credit. 0 = purchases disabled.</p>
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
                            <Input type="number" placeholder="0 = unlimited" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">Max credits per transaction. 0 = unlimited.</p>
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
                        <FormLabel>Plan Description (HTML supported)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Enter plan details..." className="min-h-[100px]" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-3">
                    <Label>Select Features</Label>
                    <div className="grid grid-cols-2 gap-3 p-4 border rounded-md max-h-[200px] overflow-y-auto">
                      {Array.isArray(features) && features.length > 0 ? (
                        features.map((feature) => (
                          <div key={feature._id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`feature-${feature._id}`}
                              checked={(form.watch("features") || []).includes(feature.name)}
                              onCheckedChange={(checked) => {
                                const current = (form.getValues("features") || []) as string[];
                                if (checked) {
                                  form.setValue("features", [...current, feature.name]);
                                } else {
                                  form.setValue("features", current.filter((f: string) => f !== feature.name));
                                }
                              }}
                            />
                            <label htmlFor={`feature-${feature._id}`} className="text-sm cursor-pointer">{feature.name}</label>
                          </div>
                        ))
                      ) : (
                        <p className="col-span-2 text-sm text-muted-foreground text-center py-2">
                          No features available. Please add features first.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label>Limitations</Label>
                    <div className="flex gap-2">
                      <Input
                        ref={newLimRef}
                        placeholder="Add a limitation and press Enter"
                        value={newLimInput}
                        onChange={(e) => setNewLimInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const val = newLimInput.trim();
                            if (!val) return;
                            const current = (form.getValues("limitations") || []) as string[];
                            if (!current.includes(val)) {
                              form.setValue("limitations", [...current, val]);
                            }
                            setNewLimInput("");
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const val = newLimInput.trim();
                          if (!val) return;
                          const current = (form.getValues("limitations") || []) as string[];
                          if (!current.includes(val)) {
                            form.setValue("limitations", [...current, val]);
                          }
                          setNewLimInput("");
                          newLimRef.current?.focus();
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(form.watch("limitations") || []).map((lim, idx) => (
                        <Badge key={idx} variant="secondary" className="gap-1 pr-1">
                          {lim}
                          <button
                            type="button"
                            className="ml-1 rounded-full hover:bg-muted"
                            onClick={() => {
                              const current = (form.getValues("limitations") || []) as string[];
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
                    name="selfBranding"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Self Branding</FormLabel>
                        </div>
                        <FormControl>
                          <Select onValueChange={(val) => field.onChange(val === "yes")} value={field.value ? "yes" : "no"}>
                            <SelectTrigger className="w-[100px]">
                              <SelectValue placeholder="Select" />
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
                  <Button type="submit" className="w-full mt-4" disabled={createPlanMutation.isPending}>
                    {createPlanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Plan
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Subscription Plan</DialogTitle>
              </DialogHeader>
              <Form {...editForm}>
                <form onSubmit={editForm.handleSubmit((data) => updatePlanMutation.mutate(data))} className="space-y-4 py-4">
                  <FormField
                    control={editForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Plan Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Enterprise" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Price (₹)</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="duration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Duration</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select duration" />
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
                    control={editForm.control}
                    name="credits"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Credits</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={editForm.control}
                      name="callingRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Calling Rate (₹/min)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="smsRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SMS Rate (₹/msg)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="whatsappRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>WhatsApp Rate (₹/msg)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="extraCreditPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Extra Credit Price (₹/credit)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="0 = disabled" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">Price users pay per extra credit. 0 = purchases disabled.</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="maxCreditPurchase"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Credits Per Purchase</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="0 = unlimited" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">Max credits per transaction. 0 = unlimited.</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={editForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Plan Description (HTML supported)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Enter plan details..." className="min-h-[100px]" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-3">
                    <Label>Select Features</Label>
                    <div className="grid grid-cols-2 gap-3 p-4 border rounded-md max-h-[200px] overflow-y-auto">
                      {Array.isArray(features) && features.length > 0 ? (
                        features.map((feature) => (
                          <div key={feature._id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`edit-feature-${feature._id}`}
                              checked={(editForm.watch("features") || []).includes(feature.name)}
                              onCheckedChange={(checked) => {
                                const current = (editForm.getValues("features") || []) as string[];
                                if (checked) {
                                  editForm.setValue("features", [...current, feature.name]);
                                } else {
                                  editForm.setValue("features", current.filter((f: string) => f !== feature.name));
                                }
                              }}
                            />
                            <label htmlFor={`edit-feature-${feature._id}`} className="text-sm cursor-pointer">{feature.name}</label>
                          </div>
                        ))
                      ) : (
                        <p className="col-span-2 text-sm text-muted-foreground text-center py-2">
                          No features available.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label>Limitations</Label>
                    <div className="flex gap-2">
                      <Input
                        ref={editLimRef}
                        placeholder="Add a limitation and press Enter"
                        value={editLimInput}
                        onChange={(e) => setEditLimInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const val = editLimInput.trim();
                            if (!val) return;
                            const current = (editForm.getValues("limitations") || []) as string[];
                            if (!current.includes(val)) {
                              editForm.setValue("limitations", [...current, val]);
                            }
                            setEditLimInput("");
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const val = editLimInput.trim();
                          if (!val) return;
                          const current = (editForm.getValues("limitations") || []) as string[];
                          if (!current.includes(val)) {
                            editForm.setValue("limitations", [...current, val]);
                          }
                          setEditLimInput("");
                          editLimRef.current?.focus();
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(editForm.watch("limitations") || []).map((lim, idx) => (
                        <Badge key={idx} variant="secondary" className="gap-1 pr-1">
                          {lim}
                          <button
                            type="button"
                            className="ml-1 rounded-full hover:bg-muted"
                            onClick={() => {
                              const current = (editForm.getValues("limitations") || []) as string[];
                              editForm.setValue("limitations", current.filter((_, i) => i !== idx));
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <FormField
                    control={editForm.control}
                    name="selfBranding"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Self Branding</FormLabel>
                        </div>
                        <FormControl>
                          <Select onValueChange={(val) => field.onChange(val === "yes")} value={field.value ? "yes" : "no"}>
                            <SelectTrigger className="w-[100px]">
                              <SelectValue placeholder="Select" />
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
                  <Button type="submit" className="w-full mt-4" disabled={updatePlanMutation.isPending}>
                    {updatePlanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Update Plan
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search plans..." 
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={filterDuration} onValueChange={(val) => { setFilterDuration(val); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by duration" />
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

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Plan Name</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>Rates (Call/SMS/WA)</TableHead>
                <TableHead>Credit Purchase</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.isArray(paginatedPlans) && paginatedPlans.length > 0 ? (
                paginatedPlans.map((plan) => (
                  <TableRow key={plan._id}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell>₹{plan.price}</TableCell>
                    <TableCell className="capitalize">{plan.duration}</TableCell>
                    <TableCell>{plan.credits.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="text-xs space-y-0.5">
                        <div>Call: ₹{plan.callingRate}/min</div>
                        <div>SMS: ₹{plan.smsRate}/msg</div>
                        <div>WA: ₹{plan.whatsappRate}/msg</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs space-y-0.5">
                        {(plan as any).extraCreditPrice > 0 ? (
                          <>
                            <div>₹{(plan as any).extraCreditPrice}/credit</div>
                            <div className="text-muted-foreground">Max: {(plan as any).maxCreditPurchase > 0 ? (plan as any).maxCreditPurchase : "∞"}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Disabled</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleEdit(plan)}
                        >
                          <Edit2 className="h-4 w-4 text-primary" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="text-destructive"
                          onClick={async () => {
                            if (confirm("Are you sure you want to delete this plan?")) {
                              await apiRequest("DELETE", `/api/plans/${plan._id}`);
                              queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
                              toast({ title: "Deleted", description: "Plan deleted successfully" });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No plans found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
