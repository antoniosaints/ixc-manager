import { inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useAuthStore } from "../stores/auth";
import { activeRecordDialogTarget, recordDialogPortal } from "./recordDialog";
import type { PonState } from "../ponApi";
import { apiWebSocketUrl } from "../http";

export interface OfflineEvent {
  id: number;
  boxId: number;
}
export interface ConnectionUpdate extends OfflineEvent {
  active: string | null;
  online: string | null;
  port: number | null;
  ip: string | null;
}
export type ConnectionScope =
  | { scope: "pon-box"; boxId: number }
  | { scope: "pon"; oltId: number; pon: string }
  | { scope: "login-list"; loginIds: number[] }
  | { scope: "customer"; module: "support"; customerId: number; loginIds: number[] }
  | { scope: "login"; module: "support" | "upgrades"; contractId: number; loginId: number }
  | { scope: "box-login"; boxId: number; loginId: number };
export function applyConnectionUpdate<T extends { id: number | null }>(login: T, update: ConnectionUpdate) {
  if (login.id !== update.id) return login;
  return {
    ...login,
    ip: update.ip,
    status: update.online === "S" ? ("online" as const) : ("offline" as const),
    active: update.active === "S" ? true : update.active === "N" ? false : null,
  };
}
/** Status observation stays in memory and stops when the view is closed/hidden. */
export function useNetworkMonitor(options: {
  boxIds?: () => number[];
  scope?: () => ConnectionScope | null;
  dialogTarget?: () => string | undefined;
  enabled?: () => boolean;
  refresh?: () => Promise<boolean>;
  offline?: (events: OfflineEvent[], total: number) => void;
  connections?: (updates: ConnectionUpdate[]) => void;
  pon?: (update: PonState) => void;
}) {
  const auth = useAuthStore();
  const ownerDialog = inject(recordDialogPortal, null);
  const focused = () =>
    options.dialogTarget
      ? !!options.dialogTarget() && activeRecordDialogTarget.value === options.dialogTarget()
      : activeRecordDialogTarget.value === (ownerDialog ?? "body");
  const state = ref("connecting"),
    checkedAt = ref<string | null>(null),
    message = ref("");
  let socket: WebSocket | undefined, retry: ReturnType<typeof setTimeout> | undefined, deadline: ReturnType<typeof setTimeout> | undefined;
  let mounted = false,
    stopped = false,
    attempts = 0,
    generation = 0,
    refreshing = false,
    needsRefresh = false;
  const subscription = () => {
    if (options.scope) return options.scope();
    const ids = [...new Set(options.boxIds?.() ?? [])]
      .filter(Number.isSafeInteger)
      .filter((id) => id > 0)
      .slice(0, 25)
      .sort((a, b) => a - b);
    return ids.length ? { boxIds: ids } : null;
  };
  const permitted = () => {
    const scope = subscription();
    if (!scope) return false;
    const permissions =
      "scope" in scope && (scope.scope === "pon" || scope.scope === "pon-box")
        ? ["network.pon.view"]
        : "scope" in scope && scope.scope === "login-list"
          ? ["network.logins.list"]
          : "boxIds" in scope || scope.scope === "box-login"
            ? ["network.boxes.view", "network.logins.view"]
            : scope.scope === "customer"
              ? ["support.customer.view", "support.logins.view"]
              : [`${scope.module}.contract.view`, `${scope.module}.logins.view`];
    return permissions.every((permission) => auth.can(permission));
  };
  function stop() {
    generation++;
    clearTimeout(retry);
    clearTimeout(deadline);
    retry = undefined;
    const old = socket;
    socket = undefined;
    old?.close();
  }
  function connect() {
    stop();
    if (!mounted || stopped) return;
    const scope = subscription();
    if (!scope || !permitted() || !focused() || options.enabled?.() === false) {
      state.value = "disabled";
      return;
    }
    if (document.hidden) {
      state.value = "paused";
      return;
    }
    const token = localStorage.getItem("retencao-cas.auth-token");
    if (!token) {
      state.value = "forbidden";
      message.value = "Entre novamente para acompanhar as conexões.";
      return;
    }
    state.value = attempts ? "reconnecting" : "connecting";
    message.value = "";
    const version = generation;
    const ws = new WebSocket(apiWebSocketUrl());
    socket = ws;
    const armDeadline = () => {
      clearTimeout(deadline);
      deadline = setTimeout(() => {
        if (socket === ws) ws.close();
      }, 35_000);
    };
    armDeadline();
    ws.onopen = () => {
      if (version === generation) ws.send(JSON.stringify({ type: "auth", token, ...scope }));
    };
    ws.onmessage = async (event) => {
      if (version !== generation) return;
      armDeadline();
      let update;
      try {
        update = JSON.parse(event.data);
      } catch {
        ws.close();
        return;
      }
      if (update.type === "unavailable") {
        state.value = "unavailable";
        message.value = update.message;
        return;
      }
      if (update.type === "pon-state") {
        state.value = "connected";
        checkedAt.value = update.checkedAt;
        message.value = "";
        attempts = 0;
        options.pon?.(update);
        return;
      }
      if (update.type !== "state") return;
      state.value = "connected";
      checkedAt.value = update.checkedAt;
      message.value = "";
      attempts = 0;
      // Reconnect baselines may have missed changes while disconnected.
      needsRefresh ||= !!update.changed || !wsHasBaseline;
      wsHasBaseline = true;
      if (Array.isArray(update.connections)) options.connections?.(update.connections);
      if (Array.isArray(update.offline) && update.offlineCount > 0) options.offline?.(update.offline, update.offlineCount);
      if (!needsRefresh || refreshing) return;
      refreshing = true;
      needsRefresh = false;
      try {
        const updated = options.refresh ? await options.refresh() : true;
        if (version === generation && !updated) {
          needsRefresh = true;
          state.value = "stale";
          message.value = "A lista ainda não foi atualizada. Tentando novamente na próxima verificação.";
        }
      } catch {
        if (version === generation) {
          needsRefresh = true;
          state.value = "stale";
          message.value = "A lista ainda não foi atualizada. Tentando novamente na próxima verificação.";
        }
      } finally {
        refreshing = false;
      }
    };
    let wsHasBaseline = false;
    ws.onclose = (event) => {
      if (version !== generation) return;
      socket = undefined;
      clearTimeout(deadline);
      if ([4400, 4401, 4403].includes(event.code)) {
        state.value = "forbidden";
        message.value = event.code === 4403 ? "Sem permissão para acompanhar a rede." : "Entre novamente para acompanhar as conexões.";
        return;
      }
      state.value = "reconnecting";
      message.value = "Conexão interrompida. Reconectando automaticamente.";
      retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)));
    };
    ws.onerror = () => {
      /* Close/deadline handlers own reconnection; no competing retry loops. */
    };
  }
  const visibility = () => connect();
  // Status/IP patches replace records but do not change the subscription.
  // Compare a stable value so those patches cannot reconnect on each snapshot.
  watch(() => JSON.stringify([auth.user?.id, permitted(), focused(), options.enabled?.(), subscription()]), connect);
  onMounted(() => {
    mounted = true;
    document.addEventListener("visibilitychange", visibility);
    connect();
  });
  onBeforeUnmount(() => {
    stopped = true;
    mounted = false;
    stop();
    document.removeEventListener("visibilitychange", visibility);
  });
  return { state, checkedAt, message, reconnect: connect };
}
