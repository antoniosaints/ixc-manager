import { defineStore } from "pinia";
import { api, type Customer, type RetentionSummary } from "../api";
import { queryErrorMessage } from "../queryErrorMessage";
import { markRaw } from "vue";
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
    snapshotId: "",
    listQueriedAt: "",
    listReuseUntil: "",
    listController: null as AbortController | null,
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
        this.summaryError = queryErrorMessage(error, "Não foi possível atualizar os indicadores.");
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
      this.listController?.abort();
      const controller = markRaw(new AbortController());
      this.listController = controller;
      const query = new URLSearchParams(filters);
      if (refreshSummary) this.snapshotId = "";
      if (this.snapshotId && Date.parse(this.listReuseUntil) > Date.now()) query.set("snapshotId", this.snapshotId);
      else query.delete("snapshotId");
      this.loading = true;
      this.error = "";
      const indicators = refreshSummary ? this.loadSummary() : Promise.resolve();
      try {
        const customers = await api.customers(query, controller.signal);
        if (version !== this.requestVersion) return;
        this.customers = customers.items;
        this.total = customers.total;
        this.snapshotId = customers.snapshotId ?? "";
        this.listQueriedAt = customers.queriedAt ?? "";
        this.listReuseUntil = customers.reuseUntil ?? "";
      } catch (error) {
        if (version === this.requestVersion) this.error = queryErrorMessage(error, "Não foi possível carregar os clientes.");
      } finally {
        if (version === this.requestVersion) {
          this.loading = false;
          this.listController = null;
        }
        await indicators;
      }
    },
  },
});
