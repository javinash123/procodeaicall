import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";

export default function Auth() {
  const [location, setLocation] = useLocation();
  const isLogin = location === "/login";

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 px-4">
      <div className="absolute top-8 left-8">
        <Link href="/">
          <a className="flex items-center text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
          </a>
        </Link>
      </div>

      <Card className="w-full max-w-md border-primary/10 shadow-xl shadow-primary/5">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Phone className="h-6 w-6" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Welcome to AI Agent</CardTitle>
          <CardDescription>
            Sign in to your account or create a new one to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={isLogin ? "login" : "register"} className="w-full" onValueChange={(val) => setLocation(val === "login" ? "/login" : "/register")}>
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setLocation("/dashboard"); }}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="name@example.com" required />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="password">Password</Label>
                    <a href="#" className="text-xs text-primary hover:underline">Forgot password?</a>
                  </div>
                  <Input id="password" type="password" required />
                </div>
                <Button type="submit" className="w-full h-10">Sign In</Button>
              </form>
            </TabsContent>
            
            <TabsContent value="register">
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setLocation("/dashboard"); }}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first-name">First name</Label>
                    <Input id="first-name" placeholder="John" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last-name">Last name</Label>
                    <Input id="last-name" placeholder="Doe" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input id="reg-email" type="email" placeholder="name@example.com" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input id="reg-password" type="password" required />
                </div>
                <Button type="submit" className="w-full h-10">Create Account</Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="justify-center border-t p-6 text-sm text-muted-foreground">
          By clicking continue, you agree to our <a href="#" className="underline hover:text-primary ml-1">Terms of Service</a>
        </CardFooter>
      </Card>
    </div>
  );
}
