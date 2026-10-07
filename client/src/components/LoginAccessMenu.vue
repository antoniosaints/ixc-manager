<script setup lang="ts">
import { toast } from "../notifications/toast";
import { computed, useId, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ArrowUpRight, ChevronDown, LoaderCircle } from "lucide-vue-next";
import { useAuthStore } from "../stores/auth";
import { supportApi } from "../supportApi";
import { upgradesApi } from "../upgradesApi";
import { copyPasswordAndAccess, equipmentAccessOptions, type EquipmentAccessOption } from "../equipmentAccess";
const props = withDefaults(
  defineProps<{ module?: "upgrades" | "support"; contractId: string; loginId: number; ip: string | null; passwordAvailable: boolean }>(),
  { module: "upgrades" }
);
const auth = useAuthStore();
const open = ref(false),
  preparing = ref(false),
  copying = ref(false),
  message = ref("");
const busy = computed(() => preparing.value || copying.value);
const preparedIp = ref("");
const trigger = ref<HTMLButtonElement>(),
  menu = ref<HTMLDivElement>();
const position = ref({ top: "0px", left: "0px" });
const instanceId = useId();
const menuId = computed(() => `${instanceId}-login-access-${props.contractId}-${props.loginId}`);
const disabledReason = computed(() =>
  !auth.can(`${props.module}.credentials.view`)
    ? "Seu perfil não permite copiar a senha do roteador."
    : !props.ip
      ? "IP não informado ou inválido."
      : !props.passwordAvailable
        ? "Senha do roteador 1 não informada no IXC."
        : ""
);
let controller: AbortController | undefined;
let prepared: { url: string; password: string } | undefined;
let expiry: ReturnType<typeof setTimeout> | undefined;
let version = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
function closeMenu(focus = false) {
  open.value = false;
  version++;
  controller?.abort();
  clearTimeout(expiry);
  if (prepared) prepared.password = "";
  prepared = undefined;
  preparedIp.value = "";
  preparing.value = false;
  if (focus) trigger.value?.focus();
}
function outside(event: Event) {
  if (!menu.value?.contains(event.target as Node) && !trigger.value?.contains(event.target as Node)) closeMenu();
}
function escape(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeMenu(true);
  }
}
function dismissScroll(event: Event) {
  if (!menu.value?.contains(event.target as Node)) closeMenu();
}
watch(open, (value) => {
  if (value) {
    document.addEventListener("click", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", dismissScroll);
    window.addEventListener("scroll", dismissScroll, true);
  } else removeListeners();
});
function removeListeners() {
  document.removeEventListener("click", outside);
  document.removeEventListener("keydown", escape);
  window.removeEventListener("resize", dismissScroll);
  window.removeEventListener("scroll", dismissScroll, true);
}
async function toggle() {
  if (open.value) {
    closeMenu(true);
    return;
  }
  const rect = trigger.value!.getBoundingClientRect();
  const width = Math.min(224, window.innerWidth - 16);
  const height = Math.min(286, window.innerHeight - 16);
  position.value = {
    left: `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`,
    top: `${Math.max(8, Math.min(rect.bottom + height + 4 <= window.innerHeight - 8 ? rect.bottom + 4 : rect.top - height - 4, window.innerHeight - height - 8))}px`,
  };
  open.value = true;
  message.value = "";
  clearTimeout(timer);
  preparing.value = true;
  controller = new AbortController();
  const current = ++version;
  try {
    const result = await (props.module === "support" ? supportApi : upgradesApi).loginAccess(
      props.contractId,
      props.loginId,
      "https",
      7000,
      controller.signal
    );
    if (current !== version || !open.value) {
      result.password = "";
      return;
    }
    prepared = result;
    preparedIp.value = new URL(result.url).hostname;
    expiry = setTimeout(() => closeMenu(true), 120_000);
    preparing.value = false;
    await nextTick();
    menu.value?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
  } catch (error) {
    if (current === version && !controller.signal.aborted) {
      closeMenu(true);
      message.value = error instanceof Error ? error.message : "Não foi possível preparar o acesso.";
    }
  }
}

function moveFocus(event: KeyboardEvent) {
  const buttons = [...(menu.value?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  } else if (event.key === "Tab") closeMenu(true);
}
function cancel() {
  closeMenu();
  removeListeners();
  clearTimeout(timer);
  copying.value = false;
  message.value = "";
}
watch(
  () => [
    props.contractId,
    props.loginId,
    props.ip,
    props.passwordAvailable,
    auth.can(`${props.module}.credentials.view`),
    auth.can(`${props.module}.equipment.access`),
  ],
  cancel
);
watch(message, (value) => {
  if (!value) return;
  toast.show({
    title: "Falha no acesso ao equipamento",
    message: value,
    type: "error",
    key: "equipment-access-feedback",
  });
});
onBeforeUnmount(cancel);
async function access(option: EquipmentAccessOption) {
  if (busy.value || !prepared || disabledReason.value || !auth.can(`${props.module}.equipment.access`)) return;
  const snapshot = { ...prepared };
  closeMenu(true);
  controller = new AbortController();
  const signal = controller.signal;
  const current = ++version;
  copying.value = true;
  message.value = "";
  try {
    const url = new URL(snapshot.url);
    url.protocol = `${option.protocol}:`;
    url.port = String(option.port);
    await copyPasswordAndAccess(
      async () => ({ url: url.href, password: snapshot.password }),
      (password) => navigator.clipboard.writeText(password),
      {
        closed: false,
        close: () => {},
        navigate: (target) => {
          window.open(target, "_blank", "noopener,noreferrer");
        },
      },
      signal
    );
  } catch (error) {
    if (current === version && !signal.aborted)
      message.value = error instanceof Error ? error.message : "Não foi possível acessar o equipamento.";
  } finally {
    snapshot.password = "";
    if (current === version) {
      copying.value = false;
      timer = setTimeout(() => {
        message.value = "";
      }, 6000);
    }
  }
}
</script>
<template>
  <div class="inline-flex flex-col items-end">
    <button
      ref="trigger"
      type="button"
      :disabled="busy || Boolean(disabledReason)"
      :title="disabledReason || 'Copiar senha do roteador 1 e acessar equipamento'"
      :aria-label="`Acessar equipamento do login #${loginId}`"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="menuId"
      class="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
      @click="toggle"
      @keydown.down.prevent="!open && toggle()"
    >
      <LoaderCircle v-if="busy" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" focusable="false" /><ArrowUpRight
        v-else
        class="h-3.5 w-3.5"
        aria-hidden="true"
        focusable="false"
      />{{ busy ? "Preparando…" : "Acessar" }}<ChevronDown class="h-3 w-3" aria-hidden="true" focusable="false" />
    </button>
    <p v-if="message" role="alert" class="mt-1 max-w-56 text-left text-[11px] font-normal text-slate-500">
      {{ message }}
    </p>
    <Teleport to="body">
      <div
        v-if="open"
        :data-module="props.module"
        :id="menuId"
        ref="menu"
        :style="position"
        class="fixed z-[100] max-h-[calc(100vh-16px)] w-56 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        @keydown="moveFocus"
      >
        <p class="px-2 py-1 text-[10px] text-slate-500">Copia a senha do roteador 1 antes de abrir.</p>
        <p class="mb-1 break-all px-2 font-mono text-[11px] text-slate-500">{{ preparedIp || ip }}</p>
        <p v-if="preparing" role="status" class="px-2 py-1 text-[11px] text-slate-500">Consultando IP e senha…</p>
        <div role="menu" :aria-label="`Acesso ao equipamento do login #${loginId}`">
          <button
            v-for="option in equipmentAccessOptions"
            :key="`${option.protocol}-${option.port}`"
            type="button"
            role="menuitem"
            :disabled="busy"
            class="access-menu-item flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs font-semibold text-violet-700 disabled:opacity-50"
            @click="access(option)"
          >
            {{ option.protocol.toUpperCase() }}/{{ option.port }}<ArrowUpRight class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.access-menu-item:hover,
.access-menu-item:focus {
  background-color: var(--appearance-upgrades-tint);
  color: var(--appearance-upgrades-text);
}
.access-menu-item:focus-visible {
  outline: 1px solid var(--appearance-upgrades);
  outline-offset: -1px;
}
</style>
