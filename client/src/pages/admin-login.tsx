import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function AdminLogin() {
  const [, setLocation] = useLocation();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock login - simply redirect to admin dashboard
    setLocation("/admin/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">
       {/* Background elements */}
       <div className="absolute inset-0 z-0 opacity-5">
          <div className="absolute top-0 left-0 w-96 h-96 bg-primary rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
       </div>

      <div className="absolute top-8 left-8 z-20">
        <Link href="/">
          <a className="flex items-center text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Site
          </a>
        </Link>
      </div>

      <Card className="w-full max-w-md border-primary/20 shadow-2xl shadow-primary/5 relative z-10 bg-card/80 backdrop-blur">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20">
              <ShieldAlert className="h-8 w-8" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Admin Access</CardTitle>
          <CardDescription>
            Restricted area. Authorized personnel only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleLogin}>
            <div className="space-y-2">
              <Label htmlFor="email">Admin Email</Label>
              <Input id="email" type="email" placeholder="admin@nijvox.com" required className="bg-background/50" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password">Password</Label>
              </div>
              <Input id="password" type="password" required className="bg-background/50" />
            </div>
            <Button type="submit" className="w-full h-10 font-medium">Authenticate</Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center border-t p-6 text-xs text-muted-foreground">
          System activity is monitored and logged.
        </CardFooter>
      </Card>
    </div>
  );
}
