import { defaultTypography, type Typography } from "./typography";
export interface Palette {
  background: string;
  surface: string;
  muted: string;
  text: string;
  secondary: string;
  border: string;
  primary: string;
  churn: string;
  upgrades: string;
  collections: string;
  network: string;
}
export interface Appearance {
  typography: Typography;
  mode: "light" | "dark" | "system";
  logo: string;
  favicon: string;
  light: Palette;
  dark: Palette;
}
export interface AccessProfile {
  id: number;
  name: string;
  description: string;
  permissions: string[];
  usersCount: number;
}
export interface AccessCatalog {
  catalog: { key: string; group: string; label: string }[];
  defaults: Record<string, string[]>;
  presets: { key: string; name: string; description: string; permissions: string[] }[];
  profiles: AccessProfile[];
}
export const defaultAppearance: Appearance = {
  typography: { ...defaultTypography },
  mode: "light",
  logo: "/cas-logo.png",
  favicon: "/cas-logo.png",
  light: {
    background: "#f8fafc",
    surface: "#ffffff",
    muted: "#f1f5f9",
    text: "#172033",
    secondary: "#64748b",
    border: "#e2e8f0",
    primary: "#2563eb",
    churn: "#0891b2",
    upgrades: "#7c3aed",
    collections: "#c2410c",
    network: "#0284c7",
  },
  dark: {
    background: "#0b1120",
    surface: "#151e30",
    muted: "#202c42",
    text: "#e8edf7",
    secondary: "#a2b0c7",
    border: "#34435b",
    primary: "#60a5fa",
    churn: "#22d3ee",
    upgrades: "#a78bfa",
    collections: "#fb923c",
    network: "#38bdf8",
  },
};
async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const token = localStorage.getItem("retencao-cas.auth-token");
  const response = await fetch(`/api/settings${path}`, {
    method,
    cache: "no-store",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message ?? "Não foi possível acessar as configurações.");
  }
  return response.json();
}
export const settingsApi = {
  appearance: () => request<Appearance>("/appearance"),
  saveAppearance: (value: Appearance) => request<Appearance>("/appearance", "PUT", value),
  access: () => request<AccessCatalog>("/access"),
  saveProfile: (value: { name: string; description: string; permissions: string[] }, id?: number) =>
    request<{ id: number }>(id ? `/profiles/${id}` : "/profiles", id ? "PUT" : "POST", value),
};
