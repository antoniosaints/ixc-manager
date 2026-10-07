import { reactive } from "vue";

export const toastPositions = ["top-right", "top-center", "top-left", "bottom-right", "bottom-center", "bottom-left"] as const;
export type ToastPosition = (typeof toastPositions)[number];
export type ToastType = "success" | "error" | "warning" | "info";
export interface ToastAction {
  label: string;
  onClick: () => void | Promise<unknown>;
  dismiss?: boolean;
}
export interface ToastOptions {
  title: string;
  message?: string;
  type?: ToastType;
  position?: ToastPosition;
  duration?: number;
  key?: string;
  actions?: ToastAction[];
}
export interface ToastItem extends ToastOptions {
  id: number;
  type: ToastType;
  position: ToastPosition;
  duration: number;
  busy: boolean;
  busyAction: number | null;
  confirmation: boolean;
}
export function createToastManager() {
  const items = reactive<ToastItem[]>([]);
  const settings = reactive<{ position: ToastPosition; duration: number }>({ position: "top-right", duration: 5000 });
  const timers = new Map<number, { handle?: ReturnType<typeof setTimeout>; started: number; remaining: number; pauses: Set<string> }>();
  const confirmations = new Map<number, (confirmed: boolean) => void>();
  let nextId = 0;
  let hidden = false;
  function dismiss(id: number) {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0 || items[index]!.busy) return;
    clearTimeout(timers.get(id)?.handle);
    timers.delete(id);
    const resolve = confirmations.get(id);
    confirmations.delete(id);
    items.splice(index, 1);
    resolve?.(false);
  }
  function start(id: number) {
    const timer = timers.get(id);
    if (!timer || timer.pauses.size || !timer.remaining) return;
    timer.started = Date.now();
    timer.handle = setTimeout(() => dismiss(id), timer.remaining);
  }
  function pause(id: number, reason: string) {
    const timer = timers.get(id);
    if (!timer || timer.pauses.has(reason)) return;
    if (!timer.pauses.size && timer.handle) {
      clearTimeout(timer.handle);
      timer.handle = undefined;
      timer.remaining = Math.max(1, timer.remaining - (Date.now() - timer.started));
    }
    timer.pauses.add(reason);
  }
  function resume(id: number, reason: string) {
    const timer = timers.get(id);
    if (!timer?.pauses.delete(reason) || timer.pauses.size) return;
    start(id);
  }
  function visibility(value: boolean) {
    hidden = value;
    for (const item of items) {
      if (value) pause(item.id, "hidden");
      else resume(item.id, "hidden");
    }
  }
  function show(options: ToastOptions) {
    // Replace repeated notices rather than stacking polling/copy feedback.
    const existing = options.key ? items.find((item) => item.key === options.key) : undefined;
    if (existing?.busy) return existing.id;
    if (existing) dismiss(existing.id);
    const type = options.type ?? "info";
    const id = ++nextId;
    const duration = Math.max(
      0,
      options.duration ?? (options.actions?.length ? 0 : type === "error" ? Math.max(settings.duration, 8000) : settings.duration)
    );
    items.push({
      ...options,
      id,
      type,
      position: options.position ?? settings.position,
      duration,
      busy: false,
      busyAction: null,
      confirmation: false,
    });
    timers.set(id, { started: Date.now(), remaining: duration, pauses: new Set(hidden ? ["hidden"] : []) });
    start(id);
    // Actionable notices remain until answered. Ordinary notices are bounded.
    const passive = items.filter((item) => !item.actions?.length && !item.busy);
    while (passive.length > 4) dismiss(passive.shift()!.id);
    return id;
  }
  async function act(id: number, index: number) {
    const item = items.find((item) => item.id === id);
    const action = item?.actions?.[index];
    if (!item || !action || item.busy) return;
    pause(id, "action");
    item.busy = true;
    item.busyAction = index;
    try {
      await action.onClick();
      item.busy = false;
      item.busyAction = null;
      if (action.dismiss !== false) dismiss(id);
      else resume(id, "action");
    } catch {
      item.busy = false;
      item.busyAction = null;
      item.type = "error";
      item.title = "Não foi possível concluir a ação";
      item.message = "Tente novamente ou feche este aviso.";
      // Preserve the action for retry and keep the notice visible.
      clearTimeout(timers.get(id)?.handle);
    }
  }
  function confirm(options: Omit<ToastOptions, "actions" | "duration"> & { confirmLabel?: string; cancelLabel?: string }) {
    if (options.key && items.some((item) => item.key === options.key && item.busy)) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const id = show({
        ...options,
        type: options.type ?? "warning",
        duration: 0,
        actions: [
          {
            label: options.confirmLabel ?? "Confirmar",
            onClick: () => {
              confirmations.delete(id);
              resolve(true);
            },
          },
          {
            label: options.cancelLabel ?? "Cancelar",
            onClick: () => {
              confirmations.delete(id);
              resolve(false);
            },
          },
        ],
      });
      items.find((item) => item.id === id)!.confirmation = true;
      confirmations.set(id, resolve);
    });
  }
  function cancelConfirmations() {
    for (const id of [...confirmations.keys()]) dismiss(id);
  }
  function clear() {
    for (const item of [...items]) dismiss(item.id);
  }
  function configure(options: Partial<typeof settings>) {
    if (options.position && toastPositions.includes(options.position)) settings.position = options.position;
    if (options.duration !== undefined && Number.isFinite(options.duration))
      settings.duration = Math.min(30000, Math.max(1000, options.duration));
  }
  return {
    items,
    settings,
    show,
    dismiss,
    act,
    pause,
    resume,
    visibility,
    confirm,
    cancelConfirmations,
    clear,
    configure,
    success: (title: string, message?: string) => show({ title, message, type: "success", key: `success:${title}` }),
    error: (title: string, message?: string) => show({ title, message, type: "error", key: `error:${title}` }),
    info: (title: string, message?: string) => show({ title, message, type: "info", key: `info:${title}` }),
  };
}
export const toast = createToastManager();

export function configureToast(options: Partial<typeof toast.settings>) {
  toast.configure(options);
  try {
    localStorage.setItem("retencao-cas.notifications", JSON.stringify(toast.settings));
  } catch {
    /* Keep the preference in memory when storage is unavailable. */
  }
}
export function restoreToastPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem("retencao-cas.notifications") ?? "null");
    if (value && typeof value === "object") toast.configure(value);
  } catch {
    /* Invalid or unavailable browser storage falls back to defaults. */
  }
}
