import { inject, onBeforeUnmount, onMounted, ref, shallowRef, watch, type InjectionKey, type Ref } from "vue";

export const upgradesRefreshKey: InjectionKey<Ref<number>> = Symbol("upgrades-refresh");

/** Request-scoped data only. Cancel old requests and discard out-of-order responses. */
export function useLiveQuery<T>(fetcher: (signal: AbortSignal) => Promise<T>) {
  const data = shallowRef<T | null>(null);
  const loading = ref(false);
  const error = ref("");
  let controller: AbortController | undefined;
  let version = 0;
  const reload = async () => {
    controller?.abort();
    const current = ++version;
    controller = new AbortController();
    loading.value = true;
    error.value = "";
    data.value = null;
    try {
      const result = await fetcher(controller.signal);
      if (version === current) data.value = result;
    } catch (reason) {
      if (version === current && !controller.signal.aborted)
        error.value = reason instanceof Error ? reason.message : "Falha na consulta ao IXC.";
    } finally {
      if (version === current) loading.value = false;
    }
  };
  const refresh = inject(upgradesRefreshKey, ref(0));
  watch(refresh, reload);
  onMounted(reload);
  onBeforeUnmount(() => {
    version++;
    controller?.abort();
  });
  return { data, loading, error, reload };
}
