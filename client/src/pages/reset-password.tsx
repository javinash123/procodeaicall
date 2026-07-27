import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, ArrowLeft, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ variant: "destructive", title: "Passwords don't match", description: "Please make sure both passwords are the same." });
      return;
    }
    if (password.length < 6) {
      toast({ variant: "destructive", title: "Password too short", description: "Password must be at least 6 characters." });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Something went wrong");
      setDone(true);
      setTimeout(() => setLocation("/login"), 3000);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Reset failed", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20 px-4">
        <Card className="w-full max-w-md border-primary/10 shadow-xl shadow-primary/5">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 border border-destructive/30">
                <AlertCircle className="h-7 w-7 text-destructive" />
              </div>
            </div>
            <p className="font-semibold text-lg">Invalid Reset Link</p>
            <p className="text-sm text-muted-foreground">
              This password reset link is invalid or has already been used.
            </p>
            <Link href="/forgot-password">
              <Button className="w-full">Request a new link</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 px-4">
      <div className="absolute top-8 left-8">
        <Link href="/login" className="flex items-center text-muted-foreground hover:text-foreground transition-colors text-sm">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
        </Link>
      </div>

      <Card className="w-full max-w-md border-primary/10 shadow-xl shadow-primary/5">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Phone className="h-6 w-6" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tighter">Set New Password</CardTitle>
          <CardDescription>Choose a strong password for your account.</CardDescription>
        </CardHeader>

        <CardContent>
          {done ? (
            <div className="text-center space-y-4 py-4">
              <div className="flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 border border-green-500/30">
                  <CheckCircle2 className="h-7 w-7 text-green-500" />
                </div>
              </div>
              <p className="font-semibold">Password updated!</p>
              <p className="text-sm text-muted-foreground">
                Your password has been reset. Redirecting you to login…
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full">Go to Login now</Button>
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm New Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="Repeat your new password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" className="w-full h-10" disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating password...</>
                ) : (
                  "Reset Password"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
