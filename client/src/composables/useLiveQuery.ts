import { inject, onBeforeUnmount, onMounted, ref, shallowRef, watch, type InjectionKey, type Ref } from "vue";

export const upgradesRefreshKey: InjectionKey<Ref<number>> = Symbol("upgrades-refresh");

/** Request-scoped data only. Cancel old requests and discard out-of-order responses. */
export function useLiveQuery<T>(fetcher: (signal: AbortSignal) => Promise<T>) {
  const data = shallowRef<T | null>(null);
  const loading = ref(false);
  const error = ref("");
  const refreshing = ref(false);
  let controller: AbortController | undefined;
  let version = 0;
  const run = async (background: boolean) => {
    if (background && (loading.value || refreshing.value)) return false;
    controller?.abort();
    const current = ++version;
    controller = new AbortController();
    if (background) refreshing.value = true;
    else {
      loading.value = true;
      refreshing.value = false;
      error.value = "";
      data.value = null;
    }
    try {
      const result = await fetcher(controller.signal);
      if (version === current) {
        data.value = result;
        error.value = "";
        return true;
      }
    } catch (reason) {
      if (!background && version === current && !controller.signal.aborted)
        error.value = reason instanceof Error ? reason.message : "Falha na consulta ao IXC.";
    } finally {
      if (version === current) {
        loading.value = false;
        refreshing.value = false;
      }
    }
    return false;
  };
  const reload = () => run(false);
  const refreshInBackground = () => run(true);
  const refresh = inject(upgradesRefreshKey, ref(0));
  watch(refresh, reload);
  onMounted(reload);
  onBeforeUnmount(() => {
    version++;
    controller?.abort();
  });
  return { data, loading, refreshing, error, reload, refreshInBackground };
}
