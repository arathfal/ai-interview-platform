import api from "./api";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface SignupPayload {
  email: string;
  password: string;
  organization_id: number;
}

export interface LoginResponse {
  token: string;
}

export const authApi = {
  // F-03 phase 2 (decision evolution A → D): login is tenant-implicit —
  // email + password only. The tenant scheme is derived server-side from the
  // account's organization, so no X-Tenant-Scheme header is sent.
  login: (data: LoginPayload) => api.post<LoginResponse>("/auth/login", data),

  // Signup requires the chosen organization (from the public org listing),
  // so the new account is already assigned to a tenant from day one.
  signup: (data: SignupPayload) => api.post<LoginResponse>("/auth/signup", data),
};