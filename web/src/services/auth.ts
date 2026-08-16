import api from "./api";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
}

export const authApi = {
  // F-03: login is tenant-explicit — the scheme is sent as X-Tenant-Scheme
  // so the backend never falls back to a random organization.
  login: (data: LoginPayload, tenantScheme: string) =>
    api.post<LoginResponse>("/auth/login", data, {
      headers: { "X-Tenant-Scheme": tenantScheme },
    }),

  signup: (data: { email: string; password: string; role: "admin" | "user" }) =>
    api.post<LoginResponse>("/signup", data),
};