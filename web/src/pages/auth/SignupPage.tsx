import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSetAtom } from "jotai";
import { useForm, Controller } from "react-hook-form";
import { authAtom, saveToken } from "@/stores/authAtom";
import { authApi } from "@/services/auth";
import { organizationsApi, OrganizationSummary } from "@/services/organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Alert } from "@/components/ui/alert";
import { extractApiError } from "@/lib/apiErrors";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Mirrors the backend User validation (URI::MailTo::EMAIL_REGEXP).
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

interface SignupFormValues {
  organizationId: string;
  email: string;
  password: string;
}

export default function SignupPage() {
  const navigate = useNavigate();
  const setAuth = useSetAtom(authAtom);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgLoadError, setOrgLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<SignupFormValues>({
    defaultValues: { organizationId: "", email: "", password: "" },
    mode: "onTouched",
  });

  // F-03 phase 2 AC#6: the organization dropdown is fed by the public
  // GET /organizations listing — a real source of truth, no typing of schemes.
  useEffect(() => {
    let active = true;
    organizationsApi
      .list()
      .then((res) => {
        if (!active) return;
        setOrganizations(res.data.organizations);
      })
      .catch(() => {
        if (!active) return;
        setOrgLoadError("Failed to load organizations. Please try again.");
      })
      .finally(() => {
        if (active) setOrgsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const onSubmit = async (data: SignupFormValues) => {
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.signup({
        email: data.email,
        password: data.password,
        organization_id: Number(data.organizationId),
      });
      const token = res.data.token;
      saveToken(token);
      setAuth({ token });
      navigate("/assessments");
    } catch (err) {
      // F-26: unified error extraction — backend envelope, legacy envelope,
      // or network failure, all normalized to a user-presentable message.
      setError(extractApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const orgsEmpty = !orgsLoading && organizations.length === 0;
  const canSubmit = !orgsLoading && !orgsEmpty;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-2">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">AI Interview</h1>
          <p className="text-sm text-muted-foreground mt-1">Create an account</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="organization">Organization</Label>
            <Controller
              name="organizationId"
              control={control}
              rules={{ required: "Please select an organization." }}
              render={({ field, fieldState }) => (
                <>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={orgsLoading || orgsEmpty}
                  >
                    <SelectTrigger
                      id="organization"
                      aria-invalid={fieldState.error ? true : undefined}
                      className={cn(fieldState.error && "border-destructive focus-visible:ring-destructive/40")}
                    >
                      <SelectValue placeholder={orgsLoading ? "Loading organizations…" : "Select an organization"} />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={String(org.id)}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.error ? (
                    <p className="text-xs text-destructive" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : orgLoadError ? (
                    <p className="text-xs text-destructive" role="alert">
                      {orgLoadError}
                    </p>
                  ) : orgsEmpty ? (
                    <p className="text-xs text-destructive" role="alert">
                      No organizations available. Please contact your assessor.
                    </p>
                  ) : null}
                </>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              aria-invalid={errors.email ? true : undefined}
              className={cn(errors.email && "border-destructive focus-visible:ring-destructive/40")}
              {...register("email", {
                required: "Email is required.",
                pattern: { value: EMAIL_PATTERN, message: "Enter a valid email address." },
              })}
            />
            {errors.email && (
              <p className="text-xs text-destructive" role="alert">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              className={cn(errors.password && "border-destructive focus-visible:ring-destructive/40")}
              {...register("password", {
                required: "Password is required.",
                // Mirror of the backend User validation (8–72 chars, NIST
                // 800-63B). Same message as the model error on the API side.
                minLength: { value: 8, message: "Password must be between 8 and 72 characters." },
                maxLength: { value: 72, message: "Password must be between 8 and 72 characters." },
              })}
            />
            {errors.password && (
              <p className="text-xs text-destructive" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>

          {error && (
            <Alert>
              <p className="text-sm">{error}</p>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={loading || !canSubmit}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Sign up
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}