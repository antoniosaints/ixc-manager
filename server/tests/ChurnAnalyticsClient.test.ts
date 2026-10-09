import { expect, it, vi } from "vitest";
vi.mock("../../client/src/api", () => ({ api: { analytics: vi.fn() } }));
import { useChurnAnalytics, type ChurnAnalyticsDimension } from "../../client/src/composables/useChurnAnalytics";

it("mantém os três gráficos disponíveis quando motivos de cancelamento falham e permite repetir só esse card", async () => {
  const fetch = vi.fn(async (dimension: ChurnAnalyticsDimension) => {
    if (dimension === "cancellation-reasons") throw new Error("Consulta indisponível");
    return { items: [{ label: dimension, highRisk: 3 }] };
  });
  const analytics = useChurnAnalytics(fetch);
  await analytics.loadAll();
  expect(analytics.loading.value).toBe(false);
  for (const dimension of ["cities", "plans", "network-regions"] as const) {
    expect(analytics.cards.value[dimension].items).toEqual([{ label: dimension, highRisk: 3 }]);
    expect(analytics.cards.value[dimension].error).toBe("");
  }
  expect(analytics.cards.value["cancellation-reasons"]).toEqual({ items: [], loading: false, error: "Consulta indisponível" });
  fetch.mockResolvedValueOnce({ items: [{ label: "Desistência", total: 2 }] } as any);
  await analytics.load("cancellation-reasons");
  expect(fetch).toHaveBeenCalledTimes(5);
  expect(fetch.mock.calls.at(-1)?.[0]).toBe("cancellation-reasons");
  expect(analytics.cards.value["cancellation-reasons"]).toEqual({
    items: [{ label: "Desistência", total: 2 }],
    loading: false,
    error: "",
  });
  expect(analytics.cards.value.cities.items).toHaveLength(1);
});

it("mostra um gráfico pronto enquanto outro carrega e diferencia lista vazia de falha", async () => {
  let release!: (value: { items: [] }) => void;
  const fetch = vi.fn(async (dimension: ChurnAnalyticsDimension) => {
    if (dimension === "cancellation-reasons")
      return new Promise<{ items: [] }>((resolve) => {
        release = resolve;
      });
    return { items: [] };
  });
  const analytics = useChurnAnalytics(fetch);
  const pending = analytics.load("cancellation-reasons");
  await analytics.load("cities");
  expect(analytics.cards.value.cities).toEqual({ items: [], loading: false, error: "" });
  expect(analytics.cards.value["cancellation-reasons"].loading).toBe(true);
  release({ items: [] });
  await pending;
  expect(analytics.cards.value["cancellation-reasons"].error).toBe("");
});

it("cancela uma consulta substituída e ignora sua resposta atrasada", async () => {
  let release!: (value: { items: { label: string; highRisk: number }[] }) => void;
  const fetch = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    )
    .mockResolvedValue({ items: [{ label: "Atual", highRisk: 1 }] });
  const analytics = useChurnAnalytics(fetch);
  const previous = analytics.load("cities");
  const signal = fetch.mock.calls[0][1] as AbortSignal;
  await analytics.load("cities");
  expect(signal.aborted).toBe(true);
  release({ items: [{ label: "Antigo", highRisk: 99 }] });
  await previous;
  expect(analytics.cards.value.cities.items).toEqual([{ label: "Atual", highRisk: 1 }]);
  expect(analytics.cards.value.cities.loading).toBe(false);
});

it("cancela consultas ao sair da tela sem exibir erro de cancelamento", async () => {
  let reject!: (error: Error) => void;
  const fetch = vi.fn(
    () =>
      new Promise<{ items: [] }>((_, fail) => {
        reject = fail;
      })
  );
  const analytics = useChurnAnalytics(fetch);
  const pending = analytics.load("plans");
  const signal = fetch.mock.calls[0][1] as AbortSignal;
  analytics.dispose();
  expect(signal.aborted).toBe(true);
  reject(new DOMException("Cancelado", "AbortError"));
  await pending;
  expect(analytics.cards.value.plans.error).toBe("");
  await analytics.loadAll();
  expect(fetch).toHaveBeenCalledOnce();
});
