import { defineStore } from "pinia";
import { api, type Customer, type RetentionSummary } from "../api";
export const useRetentionStore = defineStore("retention", {
  state: () => ({
    summary: {} as Partial<RetentionSummary>,
    summaryLoading: false,
    summaryRefreshQueued: false,
    summaryError: "",
    customers: [] as Customer[],
    total: 0,
    loading: false,
    error: "",
    requestVersion: 0,
  }),
  actions: {
    async loadSummary() {
      if (this.summaryLoading) {
        this.summaryRefreshQueued = true;
        return;
      }
      this.summaryLoading = true;
      this.summaryError = "";
      try {
        this.summary = await api.summary();
      } catch (error) {
        this.summaryError = error instanceof Error ? error.message : "Falha ao atualizar indicadores";
      } finally {
        this.summaryLoading = false;
        if (this.summaryRefreshQueued) {
          this.summaryRefreshQueued = false;
          await this.loadSummary();
        }
      }
    },
    async loadDashboard(filters = new URLSearchParams(), refreshSummary = false) {
      const version = ++this.requestVersion;
      this.loading = true;
      this.error = "";
      const indicators = refreshSummary ? this.loadSummary() : Promise.resolve();
      try {
        const customers = await api.customers(filters);
        if (version !== this.requestVersion) return;
        this.customers = customers.items;
        this.total = customers.total;
      } catch (error) {
        if (version === this.requestVersion) this.error = error instanceof Error ? error.message : "Falha ao carregar dados";
      } finally {
        if (version === this.requestVersion) this.loading = false;
        await indicators;
      }
    },
  },
});
