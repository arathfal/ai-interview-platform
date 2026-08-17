import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSetAtom } from "jotai";
import { authAtom, saveToken } from "@/stores/authAtom";
import { authApi } from "@/services/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Alert } from "@/components/ui/alert";
import { extractApiError } from "@/lib/apiErrors";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useSetAtom(authAtom);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Surface a "session expired" notice after the axios interceptor redirected
  // us here with the auth_expired flag set (F-26 AC#5).
  useEffect(() => {
    const expired = sessionStorage.getItem("auth_expired");
    if (expired) {
      sessionStorage.removeItem("auth_expired");
      setNotice("Your session has expired. Please sign in again.");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    setLoading(true);
    try {
      // F-03 phase 2: clean login — tenant is derived from the account's
      // organization server-side, there is no tenant input anymore.
      const res = await authApi.login({ email, password });
      const token = res.data.token;
      saveToken(token);
      setAuth({ token });
      navigate("/assessments");
    } catch (err) {
      // F-03 AC#9 / F-26: surface the real backend error (e.g. account not
      // assigned to an organization, rate limit, network failure) instead of
      // a misleading generic credential message.
      setError(extractApiError(err).message);
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {notice && (
            <Alert variant="info">
              <p className="text-sm">{notice}</p>
            </Alert>
          )}
          {error && (
            <Alert>
              <p className="text-sm">{error}</p>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Sign in
          </Button>
        </form>

        {/* F-03 phase 2 AC#7: signup is a secondary action — CTA below the button. */}
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}