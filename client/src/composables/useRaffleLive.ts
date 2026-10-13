import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import { apiWebSocketUrl } from "../http";
import type { RafflePresentation } from "../rafflesApi";

export function useRaffleLive<T extends RafflePresentation>(id: Ref<string>, state: Ref<T | null>, publicLink = false) {
  const connected = ref(false),
    unavailable = ref(false),
    message = ref("");
  let socket: WebSocket | null = null,
    retry: ReturnType<typeof setTimeout> | null = null,
    attempts = 0,
    generation = 0,
    disposed = false;
  function stop() {
    generation++;
    if (retry) clearTimeout(retry);
    retry = null;
    socket?.close();
    socket = null;
    connected.value = false;
  }
  function open() {
    if (disposed || !id.value || unavailable.value) return;
    const current = generation;
    const path = publicLink ? `/api/raffles/public/${encodeURIComponent(id.value)}/live` : "/api/raffles/live";
    const ws = new WebSocket(apiWebSocketUrl(path));
    socket = ws;
    ws.onopen = () => {
      if (current !== generation) return;
      if (!publicLink) ws.send(JSON.stringify({ id: id.value, token: localStorage.getItem("retencao-cas.auth-token") ?? "" }));
    };
    ws.onmessage = (event) => {
      if (current !== generation) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "heartbeat") {
          connected.value = true;
          message.value = "";
          return;
        }
        if (data.type === "unavailable") {
          unavailable.value = true;
          connected.value = false;
          message.value = "Este link foi desativado ou seu acesso foi revogado.";
          return;
        }
        if (data.type === "error") {
          connected.value = false;
          message.value = data.message;
          return;
        }
        if (data.type === "state" && data.raffle && (!state.value || data.raffle.revision >= state.value.revision)) {
          state.value = data.raffle;
          connected.value = true;
          attempts = 0;
          message.value = "";
        }
      } catch {
        connected.value = false;
        message.value = "Não foi possível atualizar a transmissão.";
      }
    };
    ws.onclose = (event) => {
      if (current !== generation || disposed) return;
      connected.value = false;
      if (event.code === 1008) {
        unavailable.value = true;
        message.value = "Link indisponível ou acesso revogado.";
        return;
      }
      message.value = "Reconectando à transmissão…";
      retry = setTimeout(open, Math.min(15000, 1000 * 2 ** attempts++));
    };
    ws.onerror = () => {
      connected.value = false;
    };
  }
  watch(
    id,
    () => {
      stop();
      unavailable.value = false;
      message.value = "";
      attempts = 0;
      open();
    },
    { immediate: true }
  );
  onBeforeUnmount(() => {
    disposed = true;
    stop();
  });
  return { connected, unavailable, message };
}
