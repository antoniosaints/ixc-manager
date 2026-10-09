import { computed, ref } from "vue";
import { api } from "../api";

export const churnAnalyticsDimensions = ["cities", "plans", "network-regions", "cancellation-reasons"] as const;
export type ChurnAnalyticsDimension = (typeof churnAnalyticsDimensions)[number];
export interface ChurnAnalyticsRow {
  label: string;
  total?: number;
  highRisk?: number;
}
interface ChartState {
  items: ChurnAnalyticsRow[];
  loading: boolean;
  error: string;
}
type FetchAnalytics = (dimension: ChurnAnalyticsDimension, signal?: AbortSignal) => Promise<{ items: ChurnAnalyticsRow[] }>;

export function useChurnAnalytics(fetchAnalytics: FetchAnalytics = api.analytics) {
  const initialCard = (): ChartState => ({ items: [], loading: true, error: "" });
  const cards = ref<Record<ChurnAnalyticsDimension, ChartState>>({
    cities: initialCard(),
    plans: initialCard(),
    "network-regions": initialCard(),
    "cancellation-reasons": initialCard(),
  });
  const requests = new Map<ChurnAnalyticsDimension, AbortController>();
  let disposed = false;
  const loading = computed(() => churnAnalyticsDimensions.some((key) => cards.value[key].loading));

  async function load(dimension: ChurnAnalyticsDimension) {
    if (disposed) return;
    requests.get(dimension)?.abort();
    const controller = new AbortController();
    requests.set(dimension, controller);
    cards.value[dimension] = { items: [], loading: true, error: "" };
    try {
      const result = await fetchAnalytics(dimension, controller.signal);
      if (!disposed && requests.get(dimension) === controller) cards.value[dimension] = { items: result.items, loading: false, error: "" };
    } catch (error) {
      if (!disposed && requests.get(dimension) === controller)
        cards.value[dimension] = {
          items: [],
          loading: false,
          error: error instanceof Error ? error.message : "Falha ao carregar análise",
        };
    } finally {
      if (requests.get(dimension) === controller) requests.delete(dimension);
    }
  }

  const loadAll = () => Promise.all(churnAnalyticsDimensions.map(load));
  function dispose() {
    disposed = true;
    for (const controller of requests.values()) controller.abort();
    requests.clear();
  }
  return { cards, loading, load, loadAll, dispose };
}
