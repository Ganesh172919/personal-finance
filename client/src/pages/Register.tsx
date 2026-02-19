import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ApiError, apiClient } from "@/lib/apiClient";
import { useToast } from "@/hooks/useToast";
import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { getSearchParam, sanitizeNextPath } from "@/lib/url";

const POST_AUTH_REDIRECT_KEY = "finwise.post_auth_redirect";

const phoneRegex = /^[+]?[0-9]{10,15}$/;
const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim().length === 0 ? undefined : value;

const registerSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  email: z.string().email({ message: "Please enter a valid email" }),
  phoneNumber: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().regex(phoneRegex, { message: "Invalid phone number" }).optional()
  ),
  referralCode: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{6,16}$/, { message: "Referral code must be 6-16 alphanumeric characters" })
      .optional()
  ),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .max(128, { message: "Password is too long" })
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
      message: "Password must include upper, lower, and numeric characters",
    }),
});

export default function Register() {
  const { toast } = useToast();
  const [location, navigate] = useLocation();

  useEffect(() => {
    const next = sanitizeNextPath(getSearchParam(location, "next"));
    if (!next) return;
    try {
      sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, next);
    } catch {
      // ignore
    }
  }, [location]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
  });

  useEffect(() => {
    const ref = getSearchParam(location, "ref");
    if (!ref) return;
    setValue("referralCode", ref.trim().toUpperCase());
  }, [location, setValue]);

  const onSubmit = async (data: z.infer<typeof registerSchema>) => {
    try {
      const response = await apiClient<{ message?: string; dev_otp?: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      });

      if (response?.dev_otp) {
        sessionStorage.setItem("devOtpForVerification", response.dev_otp);
      }
      toast({
        title: "Registration Successful",
        description: response?.dev_otp
          ? `Dev mode OTP: ${response.dev_otp}`
          : "We've sent a 6-digit verification code to your email.",
      });

      // Store the email in sessionStorage and navigate to VerifyEmail
      sessionStorage.setItem("emailForVerification", data.email);
      navigate("/verify-email");
    } catch (error: unknown) {
      const requestId = error instanceof ApiError ? error.requestId : undefined;
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast({
        title: "Registration Failed",
        description: requestId ? `${message} (Request ID: ${requestId})` : message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Create an Account</CardTitle>
          <CardDescription>
            Enter your information to get started with Personal Finance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" placeholder="Jagadeesh" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="name@example.com" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phoneNumber">Phone Number (Optional)</Label>
              <Input id="phoneNumber" {...register("phoneNumber")} />
              {errors.phoneNumber && <p className="text-xs text-destructive">{errors.phoneNumber.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="referralCode">Referral Code (Optional)</Label>
              <Input id="referralCode" {...register("referralCode")} placeholder="e.g. 8JQ2K7M9PA" />
              {errors.referralCode && <p className="text-xs text-destructive">{errors.referralCode.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...register("password")} />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creating Account..." : "Create Account"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            Already have an account?{" "}
            <Link href="/login" className="underline text-primary">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
