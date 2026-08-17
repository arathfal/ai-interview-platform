import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSetAtom } from "jotai";
import { authAtom, saveToken } from "@/stores/authAtom";
import { authApi } from "@/services/auth";
import { organizationsApi, OrganizationSummary } from "@/services/organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export default function SignupPage() {
  const navigate = useNavigate();
  const setAuth = useSetAtom(authAtom);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [organizationId, setOrganizationId] = useState<string>("");
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setOrgError("Failed to load organizations. Please try again.");
      })
      .finally(() => {
        if (active) setOrgsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!organizationId) {
      setOrgError("Please select an organization.");
      return;
    }
    setOrgError(null);

    setLoading(true);
    try {
      const res = await authApi.signup({
        email,
        password,
        role,
        organization_id: Number(organizationId),
      });
      const token = res.data.token;
      saveToken(token);
      setAuth({ token });
      navigate("/assessments");
    } catch (err) {
      const backendMessage = (err as { response?: { data?: { errors?: Array<{ message?: string }> } } })
        ?.response?.data?.errors?.[0]?.message;
      setError(backendMessage ?? "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const orgsEmpty = !orgsLoading && organizations.length === 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">AI Interview</h1>
          <p className="text-sm text-muted-foreground mt-1">Create an account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="organization">Organization</Label>
            <Select
              value={organizationId}
              onValueChange={(v) => {
                setOrganizationId(v);
                if (orgError) setOrgError(null);
              }}
              disabled={orgsLoading || orgsEmpty}
            >
              <SelectTrigger id="organization" aria-invalid={orgError ? true : undefined}>
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
            {orgError ? (
              <p className="text-sm text-destructive" role="alert">
                {orgError}
              </p>
            ) : orgsEmpty ? (
              <p className="text-sm text-destructive" role="alert">
                No organizations available. Please contact your assessor.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Role</Label>
            <RadioGroup
              value={role}
              onValueChange={(v) => setRole(v as "admin" | "user")}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="user" id="role-user" />
                <Label htmlFor="role-user" className="font-normal cursor-pointer">User</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="admin" id="role-admin" />
                <Label htmlFor="role-admin" className="font-normal cursor-pointer">Admin</Label>
              </div>
            </RadioGroup>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading || orgsLoading || orgsEmpty}>
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