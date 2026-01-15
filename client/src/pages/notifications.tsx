import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Clock, Info, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

export default function Notifications() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await apiRequest("GET", "/api/notifications");
        const data = await res.json();
        setNotifications(data.notifications || []);
      } catch (error) {
        console.error("Failed to fetch notifications:", error);
      }
    };
    fetchNotifications();
  }, []);

  const goToOverview = () => {
    setLocation("/dashboard");
  };

  const removeNotification = async (id: string) => {
    try {
      await apiRequest("POST", `/api/notifications/${id}/read`);
      setNotifications(prev => prev.filter(n => n._id !== id));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const userNotifications = notifications.filter(n => n.type === "notification" && !n.readBy.includes(user?._id));

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
          {userNotifications.map((n) => (
            <Card key={n._id} className="hover-elevate transition-all border-l-4 border-l-primary relative group">
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute right-2 top-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeNotification(n._id)}
              >
                <X className="h-4 w-4" />
              </Button>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between pr-8">
                  <CardTitle className="text-lg flex items-center gap-2 font-semibold">
                    Notification
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {new Date(n.createdAt).toLocaleDateString()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{n.message}</p>
              </CardContent>
            </Card>
          ))}
          {userNotifications.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No notifications yet.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
