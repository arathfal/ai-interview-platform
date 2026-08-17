import api from "./api";

export interface OrganizationSummary {
  id: number;
  name: string;
  scheme: string;
}

export const organizationsApi = {
  // Public minimal listing (id + name + scheme) for the signup dropdown (F-03 phase 2).
  list: () => api.get<{ organizations: OrganizationSummary[] }>("/organizations"),
};