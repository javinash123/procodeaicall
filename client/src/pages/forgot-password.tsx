import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, ArrowLeft, Loader2, Mail, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ForgotPassword() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Something went wrong");
      setSubmitted(true);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

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
          <CardTitle className="text-2xl font-bold tracking-tighter">Reset Password</CardTitle>
          <CardDescription>
            Enter your account email and we'll send you a reset link.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {submitted ? (
            <div className="text-center space-y-4 py-4">
              <div className="flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 border border-green-500/30">
                  <CheckCircle2 className="h-7 w-7 text-green-500" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                If an account with <span className="font-medium text-foreground">{email}</span> exists,
                a password reset link has been sent. Please check your inbox (and spam folder).
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full mt-2">Back to Login</Button>
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    className="pl-9"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-10" disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending reset link...</>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground pt-1">
                Remember your password?{" "}
                <Link href="/login" className="text-primary hover:underline">Sign in</Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
