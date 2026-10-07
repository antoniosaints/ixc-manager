import { beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
vi.mock("../../client/src/api", () => ({ api: { summary: vi.fn(), customers: vi.fn() } }));
import { api } from "../../client/src/api";
import { useRetentionStore } from "../../client/src/stores/retention";

beforeEach(() => {
  vi.resetAllMocks();
  setActivePinia(createPinia());
  vi.mocked(api.summary).mockResolvedValue({ activeCustomers: 12, warnings: [] } as any);
  vi.mocked(api.customers).mockResolvedValue({ items: [], total: 10 });
});
it("não repete o resumo ao filtrar ou paginar e só atualiza quando solicitado", async () => {
  const store = useRetentionStore();
  await store.loadDashboard(new URLSearchParams(), true);
  await store.loadDashboard(new URLSearchParams("page=2"));
  await store.loadDashboard(new URLSearchParams("blocked=true"));
  expect(api.summary).toHaveBeenCalledTimes(1);
  expect(api.customers).toHaveBeenCalledTimes(3);
  await store.loadSummary();
  expect(api.summary).toHaveBeenCalledTimes(2);
  expect(api.customers).toHaveBeenCalledTimes(3);
});
it("a falha nos indicadores não impede o carregamento da lista", async () => {
  vi.mocked(api.summary).mockRejectedValue(new Error("Indicadores indisponíveis"));
  const store = useRetentionStore();
  await store.loadDashboard(new URLSearchParams(), true);
  expect(store.total).toBe(10);
  expect(store.error).toBe("");
  expect(store.summaryError).toBe("Indicadores indisponíveis");
  expect(store.loading).toBe(false);
});
it("a falha na lista não impede mostrar os indicadores", async () => {
  vi.mocked(api.customers).mockRejectedValue(new Error("Lista indisponível"));
  const store = useRetentionStore();
  await store.loadDashboard(new URLSearchParams(), true);
  expect(store.summary.activeCustomers).toBe(12);
  expect(store.error).toBe("Lista indisponível");
  expect(store.summaryError).toBe("");
});
it("ignora uma resposta de filtro antigo que chega depois do filtro atual", async () => {
  let release!: (value: { items: []; total: number }) => void;
  vi.mocked(api.customers).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const store = useRetentionStore(),
    previous = store.loadDashboard(new URLSearchParams("search=antigo"));
  await store.loadDashboard(new URLSearchParams("search=atual"));
  release({ items: [], total: 99 });
  await previous;
  expect(store.total).toBe(10);
  expect(store.loading).toBe(false);
});
it("repete uma atualização pedida durante outra para não perder mudanças de atenção", async () => {
  let release!: (value: any) => void;
  vi.mocked(api.summary).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  vi.mocked(api.summary).mockResolvedValueOnce({ critical: 2, warnings: [] } as any);
  const store = useRetentionStore(),
    first = store.loadSummary();
  await store.loadSummary();
  expect(api.summary).toHaveBeenCalledTimes(1);
  release({ critical: 1, warnings: [] });
  await first;
  expect(api.summary).toHaveBeenCalledTimes(2);
  expect(store.summary.critical).toBe(2);
  expect(store.summaryLoading).toBe(false);
});
