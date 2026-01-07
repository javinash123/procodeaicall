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
import { Plus, Trash2, Loader2, List, MoreVertical, Edit2 } from "lucide-react";
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
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

export default function AdminPlans() {
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isFeaturesOpen, setIsFeaturesOpen] = useState(false);

  const { data: plans, isLoading: plansLoading } = useQuery<Plan[]>({ 
    queryKey: ["/api/plans"] 
  });
  const { data: features, isLoading: featuresLoading } = useQuery<Feature[]>({ 
    queryKey: ["/api/features"] 
  });

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

  const form = useForm({
    resolver: zodResolver(insertPlanSchema),
    defaultValues: {
      name: "",
      price: 0,
      duration: "monthly" as const,
      credits: 0,
      features: [] as string[],
      limitations: [] as string[],
      isActive: true,
    },
  });

  const featureForm = useForm({
    resolver: zodResolver(insertFeatureSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

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
                  <form onSubmit={featureForm.handleSubmit((data) => createFeatureMutation.mutate(data))} className="flex gap-2">
                    <FormField
                      control={featureForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input placeholder="Feature Name (e.g., Bulk SMS)" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" size="icon" disabled={createFeatureMutation.isPending}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </form>
                </Form>

                <div className="space-y-2">
                  <h3 className="font-semibold">Existing Features</h3>
                  <div className="flex flex-wrap gap-2">
                    {Array.isArray(features) && features.length > 0 ? (
                      features.map((feature) => (
                        <Badge key={feature._id} variant="secondary" className="px-3 py-1">
                          {feature.name}
                        </Badge>
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
            <DialogContent className="sm:max-w-[600px]">
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
                          <FormLabel>Price ($)</FormLabel>
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
                        <FormLabel>Call Credits</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-3">
                    <Label>Select Features</Label>
                    <div className="grid grid-cols-2 gap-3 p-4 border rounded-md">
                      {Array.isArray(features) && features.length > 0 ? (
                        features.map((feature) => (
                          <div key={feature._id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`feature-${feature._id}`}
                              checked={form.watch("features").includes(feature.name)}
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
                  <Button type="submit" className="w-full mt-4" disabled={createPlanMutation.isPending}>
                    {createPlanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Plan
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
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
                <TableHead>Features</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.isArray(plans) && plans.length > 0 ? (
                plans.map((plan) => (
                  <TableRow key={plan._id}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell>${plan.price}</TableCell>
                    <TableCell className="capitalize">{plan.duration}</TableCell>
                    <TableCell>{plan.credits.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(plan.features || []).map((f, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] px-1 py-0 h-4">
                            {f}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={async () => {
                            if (confirm(`Are you sure you want to delete the ${plan.name} plan?`)) {
                              await apiRequest("DELETE", `/api/plans/${plan._id}`);
                              queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
                              toast({ title: "Deleted", description: "Plan has been removed" });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    No plans found. Click "Add Plan" to create one.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
