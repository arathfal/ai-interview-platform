import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSetAtom } from "jotai";
import { authAtom, saveToken } from "@/stores/authAtom";
import { authApi } from "@/services/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const DEV_TENANT_SCHEME = import.meta.env.VITE_DEV_TENANT_SCHEME ?? "";

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useSetAtom(authAtom);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // F-03: tenant is an explicit user decision at login — never implicit.
  const [tenant, setTenant] = useState(DEV_TENANT_SCHEME);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // F-03 AC#5: never send the request without a tenant scheme.
    if (!tenant.trim()) {
      setTenantError("Tenant is required.");
      return;
    }
    setTenantError(null);

    setLoading(true);
    try {
      const res = await authApi.login({ email, password }, tenant.trim());
      const token = res.data.token;
      saveToken(token);
      setAuth({ token });
      navigate("/assessments");
    } catch (err) {
      // F-03 AC#8: surface the backend error (unknown scheme, required header)
      // instead of a misleading generic credential message.
      const backendMessage = (err as { response?: { data?: { errors?: Array<{ message?: string }> } } })
        ?.response?.data?.errors?.[0]?.message;
      setError(backendMessage ?? "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">AI Interview</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tenant">Tenant</Label>
            <Input
              id="tenant"
              type="text"
              autoComplete="organization"
              placeholder="e.g. test-corp"
              value={tenant}
              onChange={(e) => {
                setTenant(e.target.value);
                if (tenantError) setTenantError(null);
              }}
              aria-invalid={tenantError ? true : undefined}
            />
            {/* F-03 AC#5: inline tenant error replaces the helper info (error ?? info). */}
            {tenantError ? (
              <p className="text-sm text-destructive" role="alert">
                {tenantError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Organization scheme — provided by your assessor.
              </p>
            )}
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
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Sign in
          </Button>
        </form>

      </div>
    </div>
  );
}