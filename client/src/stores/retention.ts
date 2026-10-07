import { defineStore } from "pinia";
import { api, type Customer } from "../api";
export const useRetentionStore = defineStore("retention", {
  state: () => ({ summary: {} as Record<string, number>, customers: [] as Customer[], total: 0, loading: false, error: "" }),
  actions: {
    async loadDashboard(filters = new URLSearchParams()) {
      this.loading = true;
      this.error = "";
      try {
        const [summary, customers] = await Promise.all([api.summary(), api.customers(filters)]);
        this.summary = summary;
        this.customers = customers.items;
        this.total = customers.total;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Falha ao carregar dados";
      } finally {
        this.loading = false;
      }
    },
  },
});
