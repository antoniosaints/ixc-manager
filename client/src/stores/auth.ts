import { defineStore } from "pinia";
import { api, type AuthUser } from "../api";

const tokenKey = "retencao-cas.auth-token";
export const useAuthStore = defineStore("auth", {
  state: () => ({ user: null as AuthUser | null, initialized: false }),
  getters: {
    can:
      (state) =>
      (permission: string): boolean =>
        state.user?.role === "ADMIN" || (state.user?.permissions?.includes(permission) ?? false),
    isAdmin: (state) => state.user?.role === "ADMIN",
    canViewDashboard(): boolean {
      return this.can("churn.dashboard");
    },
    canMarkAttention(): boolean {
      return this.can("churn.attention.manage");
    },
    canViewCustomerDetails(): boolean {
      return this.can("churn.customer.view");
    },
    canViewWorkQueues(): boolean {
      return this.can("churn.attention.view") || this.can("churn.resolved.view");
    },
    home(): string {
      if (this.can("churn.dashboard")) return "/";
      if (this.can("churn.analytics")) return "/analytics";
      if (this.can("churn.attention.view")) return "/attention";
      if (this.can("churn.resolved.view")) return "/resolved";
      if (this.can("upgrades.opportunities.view")) return "/upgrades";
      if (this.can("upgrades.plans.view")) return "/upgrades/plans";
      if (this.can("support.customers.view")) return "/support";
      if (this.can("network.boxes.view")) return "/network";
      if (this.can("network.logins.list")) return "/network/logins";
      if (this.can("network.onus.view")) return "/network/onus";
      if (this.can("finance.dashboard.view")) return "/finance";
      if (this.can("collections.customers.view")) return "/collections";
      if (this.can("churn.processes.view")) return "/sync";
      return "/no-access";
    },
  },
  actions: {
    async refresh() {
      try {
        this.user = await api.me();
      } catch {
        this.user = null;
        localStorage.removeItem(tokenKey);
      }
    },
    async initialize() {
      if (this.initialized) return;
      const token = localStorage.getItem(tokenKey);
      if (token) {
        try {
          this.user = await api.me();
        } catch {
          localStorage.removeItem(tokenKey);
        }
      }
      this.initialized = true;
    },
    setSession(session: { token: string; user: AuthUser }) {
      localStorage.setItem(tokenKey, session.token);
      this.user = session.user;
      this.initialized = true;
    },
    async signOut() {
      try {
        await api.logout();
      } catch {
        /* The local token must still be removed. */
      }
      localStorage.removeItem(tokenKey);
      this.user = null;
      this.initialized = true;
    },
  },
});
