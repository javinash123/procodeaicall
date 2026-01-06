import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Clock, Info, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function Notifications() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    // Mock notifications for now as requested
    setNotifications([
      { id: 1, title: "New Lead Assigned", message: "A new lead 'John Doe' has been assigned to you.", time: "5 mins ago", type: "info" },
      { id: 2, title: "Campaign Started", message: "Your 'Summer Sale' campaign is now active.", time: "2 hours ago", type: "success" },
      { id: 3, title: "Low Credits", message: "Your credit balance is below 100. Please top up.", time: "1 day ago", type: "warning" },
      { id: 4, title: "Meeting Reminder", message: "Upcoming meeting with Sarah Smith in 30 minutes.", time: "30 mins ago", type: "info" }
    ]);
  }, []);

  const goToOverview = () => {
    setLocation("/dashboard");
  };

  const removeNotification = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl relative">
      <Button 
        variant="ghost" 
        size="icon" 
        className="absolute right-6 top-6"
        onClick={goToOverview}
      >
        <X className="h-6 w-6" />
      </Button>

      <div className="flex items-center gap-2 mb-8">
        <Bell className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">Notifications</h1>
      </div>

      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="space-y-4">
          {notifications.map((n) => (
            <Card key={n.id} className="hover-elevate transition-all border-l-4 border-l-primary relative group">
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute right-2 top-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeNotification(n.id)}
              >
                <X className="h-4 w-4" />
              </Button>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between pr-8">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {n.title}
                    {n.type === 'warning' && <Info className="h-4 w-4 text-destructive" />}
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {n.time}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{n.message}</p>
              </CardContent>
            </Card>
          ))}
          {notifications.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No notifications yet.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
