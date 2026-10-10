<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Cable, Radio, RefreshCw, Search, Target, ArrowDownRight, ArrowUpRight } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";
import { networkApi } from "../networkApi";
import { ponApi, type PonPosition, type PonState, type PonEvent } from "../ponApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import { useNetworkMonitor } from "../composables/useNetworkMonitor";
import { useAuthStore } from "../stores/auth";
import SearchableSelect from "../components/SearchableSelect.vue";
import NetworkMonitorStatus from "../components/NetworkMonitorStatus.vue";
import NetworkBoxDialog from "../components/NetworkBoxDialog.vue";
import NetworkLoginDialog from "../components/NetworkLoginDialog.vue";
import { formatIxcDateTime, formatConsulted } from "../upgradesApi";
const auth = useAuthStore(),
  route = useRoute(),
  router = useRouter();
const olt = ref(String(route.query.oltId ?? "")),
  pon = ref(String(route.query.pon ?? ""));
const initialBox = computed(() => Number(route.query.boxId) || undefined);
const mode = ref<"pon" | "cto">(route.query.mode === "cto" || (route.query.mode !== "pon" && initialBox.value) ? "cto" : "pon");
const monitorBox = ref(String(initialBox.value ?? ""));
const options = useLiveQuery((signal) => ponApi.options(Number(olt.value) || undefined, signal, initialBox.value));
const data = ref<PonState | null>(null),
  events = ref<PonEvent[]>([]),
  paused = ref(false);
const box = ref(mode.value === "cto" ? monitorBox.value : ""),
  port = ref(""),
  search = ref(""),
  selected = ref<string | null>(null);
const boxDialog = ref<{ id: number; name: string } | null>(null),
  loginDialog = ref<number | null>(null);
const loginQuery = useLiveQuery((signal) =>
  loginDialog.value ? networkApi.directLogin(loginDialog.value, signal) : Promise.resolve(null)
);
watch(loginDialog, () => {
  void loginQuery.reload();
});
const recent = ref<Record<string, number>>({}),
  now = ref(Date.now());
const test = ref<{
  entryId: string;
  onuId: number;
  pon: string;
  oltId: number;
  loginId: number;
  boxId: number;
  port: number;
  position: number;
  startedAt: number;
  dropAt: string | null;
  returnAt: string | null;
  interrupted: boolean;
} | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onBeforeUnmount(() => clearInterval(timer));
const subscription = computed(() =>
  mode.value === "cto"
    ? monitorBox.value
      ? { scope: "pon-box" as const, boxId: Number(monitorBox.value) }
      : null
    : olt.value && pon.value
      ? { scope: "pon" as const, oltId: Number(olt.value), pon: pon.value }
      : null
);
const monitor = useNetworkMonitor({
  scope: () => subscription.value,
  enabled: () =>
    !paused.value &&
    (mode.value === "cto"
      ? !!options.data.value?.boxes.some((b) => String(b.id) === monitorBox.value)
      : !!options.data.value?.pons.some((p) => p.pon === pon.value)),
  pon: (update) => {
    data.value = update;
    const changes = update.events.map((e) => ({ ...e, checkedAt: update.checkedAt }));
    events.value = [...changes, ...events.value].slice(0, 100);
    for (const e of changes) recent.value[e.entryId] = Date.now();
    const t = test.value;
    if (t && !t.interrupted)
      for (const e of changes)
        if (
          e.entryId === t.entryId &&
          e.pon === t.pon &&
          e.oltId === t.oltId &&
          e.loginId === t.loginId &&
          e.boxId === t.boxId &&
          e.port === t.port &&
          e.position === t.position
        ) {
          if (e.status === "offline" && !t.dropAt) t.dropAt = e.checkedAt;
          if (e.status === "online" && t.dropAt) t.returnAt = e.checkedAt;
        }
  },
});
watch(
  () => monitor.state.value,
  (state) => {
    if (test.value && state !== "connected" && !test.value.returnAt) test.value.interrupted = true;
  }
);
function reset() {
  data.value = null;
  events.value = [];
  recent.value = {};
  selected.value = null;
  box.value = mode.value === "cto" ? monitorBox.value : "";
  port.value = "";
  test.value = null;
}
watch(
  () => options.data.value,
  (value) => {
    if (!value) return;
    if (pon.value && !value.pons.some((p) => p.pon === pon.value)) pon.value = "";
    const preferred = value.pons.filter((p) => p.containsBox);
    if (!pon.value && preferred.length === 1) pon.value = preferred[0]!.pon;
  }
);
watch(olt, () => {
  pon.value = "";
  monitorBox.value = "";
  void options.reload();
});
watch(
  () => JSON.stringify([olt.value, mode.value, subscription.value]),
  () => {
    reset();
    void router.replace({
      query: {
        ...(olt.value ? { oltId: olt.value } : {}),
        mode: mode.value,
        ...(mode.value === "cto" && monitorBox.value ? { boxId: monitorBox.value } : {}),
        ...(mode.value === "pon" && pon.value ? { pon: pon.value } : {}),
      },
    });
  }
);
watch(
  () => route.query,
  async (query) => {
    const nextOlt = String(query.oltId ?? "");
    if (nextOlt !== olt.value) {
      olt.value = nextOlt;
      await nextTick();
    }
    mode.value = query.mode === "cto" || (query.mode !== "pon" && query.boxId) ? "cto" : "pon";
    if (mode.value === "cto") monitorBox.value = String(query.boxId ?? "");
    else pon.value = String(query.pon ?? "");
  }
);
watch(
  () => auth.can("network.pon.view"),
  (allowed) => {
    if (!allowed) {
      reset();
      void router.replace(auth.home);
    }
  }
);
watch(box, () => {
  port.value = "";
  test.value = null;
});
watch(port, () => {
  test.value = null;
});
const rows = computed(() => data.value?.positions ?? []);
const scopeTitle = computed(() => (mode.value === "cto" ? (data.value?.boxName ?? "CTO selecionada") : `PON ${pon.value}`));
const capacity = computed(() =>
  mode.value === "pon" ? 128 : data.value?.capacity && data.value.capacity <= 512 ? data.value.capacity : null
);
const gridSize = computed(() => capacity.value ?? Math.min(512, Math.max(0, ...rows.value.map((p) => p.port ?? 0))));
const slots = computed(() =>
  Array.from({ length: gridSize.value }, (_, i) => ({
    number: i + 1,
    rows: rows.value.filter((p) => (mode.value === "cto" ? p.port : p.position) === i + 1),
  }))
);
const boxes = computed(() =>
  [
    ...new Map(
      rows.value.filter((p) => p.boxId).map((p) => [String(p.boxId), { value: String(p.boxId), label: p.boxName ?? `CTO #${p.boxId}` }])
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label))
);
const ports = computed(() =>
  [...new Set(rows.value.filter((p) => String(p.boxId) === box.value && p.port).map((p) => p.port!))].sort((a, b) => a - b)
);
const target = computed(() => rows.value.filter((p) => String(p.boxId) === box.value && String(p.port) === port.value));
const targetRow = computed(() =>
  target.value.length === 1 &&
  target.value[0]?.position &&
  rows.value.filter((p) => p.position === target.value[0]!.position && p.oltId === target.value[0]!.oltId && p.pon === target.value[0]!.pon)
    .length === 1
    ? target.value[0]
    : null
);
const observed = computed(() => (test.value ? rows.value.find((p) => p.entryId === test.value!.entryId) : null));
const changedTarget = computed(
  () =>
    !!test.value &&
    (!observed.value ||
      observed.value.position !== test.value.position ||
      observed.value.oltId !== test.value.oltId ||
      observed.value.pon !== test.value.pon ||
      observed.value.loginId !== test.value.loginId ||
      observed.value.boxId !== test.value.boxId ||
      observed.value.port !== test.value.port)
);
const testMessage = computed(() =>
  !test.value
    ? ""
    : test.value.interrupted
      ? "O monitor foi interrompido durante o teste. Inicie um novo teste com o login online."
      : changedTarget.value
        ? "O vínculo mudou no IXC. Selecione a porta e inicie um novo teste."
        : test.value.returnAt
          ? "Queda e reconexão registradas."
          : test.value.dropAt
            ? "Queda registrada. Aguardando a reconexão."
            : "Aguardando a queda do login selecionado…"
);
const detail = computed(() => rows.value.find((p) => p.entryId === selected.value));
const detailSlot = computed(() => slots.value.find((s) => s.rows.some((p) => p.entryId === selected.value)));
const conflicts = computed(() => slots.value.filter((s) => s.rows.length > 1));
const unmapped = computed(() =>
  rows.value.filter((p) => (mode.value === "cto" ? !p.port || p.port > gridSize.value : p.position === null))
);
const totals = computed(() => ({
  online: rows.value.filter((p) => p.status === "online").length,
  offline: rows.value.filter((p) => p.status === "offline").length,
  unknown: rows.value.filter((p) => p.status === "unknown").length,
  empty: slots.value.filter((s) => !s.rows.length).length,
}));
function dim(p: PonPosition) {
  return (
    search.value &&
    ![p.login, p.boxName, p.onuId, p.loginId, p.position].some((v) =>
      String(v ?? "")
        .toLowerCase()
        .includes(search.value.toLowerCase())
    )
  );
}
function tileState(s: { rows: PonPosition[] }) {
  return s.rows.length > 1 ? "conflict" : (s.rows[0]?.status ?? "empty");
}
function label(s: { number: number; rows: PonPosition[] }) {
  const p = s.rows[0];
  return `${mode.value === "cto" ? "Porta" : "Posição"} ${s.number}: ${s.rows.length > 1 ? "vínculo duplicado" : p ? `${p.status} · ${p.login ?? "sem login"} · ${p.boxName ?? "sem CTO"} · porta ${p.port ?? "não informada"}` : mode.value === "cto" ? "sem cadastro" : "sem ONU cadastrada"}`;
}
function startTest() {
  const p = targetRow.value;
  if (
    !p?.position ||
    !p.onuId ||
    !p.pon ||
    !p.oltId ||
    !p.loginId ||
    !p.boxId ||
    !p.port ||
    p.warning ||
    p.status !== "online" ||
    monitor.state.value !== "connected"
  )
    return;
  test.value = {
    entryId: p.entryId,
    onuId: p.onuId,
    pon: p.pon,
    oltId: p.oltId,
    loginId: p.loginId,
    boxId: p.boxId,
    port: p.port,
    position: p.position,
    startedAt: Date.now(),
    dropAt: null,
    returnAt: null,
    interrupted: false,
  };
  selected.value = p.entryId;
}
const age = (time: string) => {
  const n = Math.max(0, Math.floor((now.value - new Date(time).getTime()) / 1000));
  return n < 60 ? `${n}s atrás` : `${Math.floor(n / 60)}min atrás`;
};
</script>
<template>
  <div class="compact-view">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em] network-text">Validação de campo</p>
        <h1 class="text-2xl font-extrabold"><Cable class="mr-2 inline h-5 w-5" />Monitor de PON</h1>
        <p class="mt-1 text-xs text-slate-500">Monitore a PON inteira ou todos os logins de uma CTO. O teste de uma porta é opcional.</p>
      </div>
      <NetworkMonitorStatus
        v-if="subscription"
        :state="monitor.state.value"
        :checked-at="monitor.checkedAt.value"
        :message="monitor.message.value"
      />
    </div>
    <section class="panel mb-4 p-4">
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <div class="flex gap-1 rounded-lg border border-slate-200 p-1" role="group" aria-label="Modo de monitoramento">
          <button
            type="button"
            class="button-secondary"
            :aria-pressed="mode === 'pon'"
            :class="mode === 'pon' ? 'network-text bg-blue-50' : ''"
            @click="mode = 'pon'"
          >
            PON inteira
          </button>
          <button
            type="button"
            class="button-secondary"
            :aria-pressed="mode === 'cto'"
            :class="mode === 'cto' ? 'network-text bg-blue-50' : ''"
            @click="mode = 'cto'"
          >
            Por CTO
          </button>
        </div>
        <span class="text-xs text-slate-500">Todas as conexões do escopo são acompanhadas automaticamente.</span>
      </div>
      <div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <SearchableSelect
          v-model="olt"
          label="OLT"
          :options="(options.data.value?.olts ?? []).map((o) => ({ value: String(o.id), label: `${o.name} · #${o.id}` }))"
          :loading="options.loading.value"
          placeholder="Selecione a OLT"
        />
        <SearchableSelect
          v-if="mode === 'pon'"
          v-model="pon"
          label="PON"
          :options="
            (options.data.value?.pons ?? []).map((p) => ({
              value: p.pon,
              label: `${p.pon} · ${p.total} ONUs${p.containsBox ? ' · CTO selecionada' : ''}`,
            }))
          "
          :disabled="!olt"
          :loading="options.loading.value"
          placeholder="Selecione a PON"
        />
        <SearchableSelect
          v-else
          v-model="monitorBox"
          label="CTO monitorada"
          :options="(options.data.value?.boxes ?? []).map((b) => ({ value: String(b.id), label: `${b.name} · #${b.id}` }))"
          :disabled="!olt"
          :loading="options.loading.value"
          placeholder="Selecione a CTO"
        />
        <button class="button-secondary" type="button" :disabled="!subscription" @click="paused = !paused">
          <Radio class="h-4 w-4" />{{ paused ? "Retomar monitor" : "Pausar monitor" }}
        </button>
      </div>
      <p v-if="options.error.value" role="alert" class="mt-3 text-sm text-red-600">
        {{ options.error.value }} <button class="underline" @click="options.reload()">Tentar novamente</button>
      </p>
      <p class="mt-3 text-xs text-slate-500">
        PON inteira: 128 posições de ONU. Por CTO: todas as portas e logins da caixa, inclusive sem ONU vinculada e em PONs diferentes.
        Atualiza a cada 1 s; a detecção depende dos eventos enviados pelo concentrador ao IXC/RADIUS.
      </p>
    </section>
    <div
      v-if="subscription && monitor.state.value !== 'connected'"
      class="panel mb-4 flex flex-wrap items-center justify-between gap-2 p-3"
      role="status"
    >
      <p class="text-sm">
        {{
          paused
            ? "Monitor pausado."
            : monitor.state.value === "paused"
              ? "Monitor pausado enquanto a página está oculta."
              : monitor.state.value === "disabled"
                ? "Monitor pausado enquanto outro registro está aberto."
                : monitor.message.value || "Aguardando a primeira leitura das conexões…"
        }}
        <span v-if="data" class="text-xs text-slate-500">Exibindo a última leitura: {{ formatConsulted(data.checkedAt) }}.</span>
      </p>
      <button v-if="!paused" class="button-secondary" @click="monitor.reconnect()"><RefreshCw class="h-4 w-4" />Reconectar</button>
    </div>
    <template v-if="data">
      <div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <Radio class="h-4 w-4 network-text" /><strong>{{ scopeTitle }}</strong>
        <span class="text-slate-500"
          >{{ mode === "pon" ? "Todas as posições e CTOs desta PON" : "Todos os logins e portas desta CTO" }} · atualização de 1 s</span
        >
      </div>
      <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          v-for="item in [
            { label: 'Online', value: totals.online, tone: 'text-emerald-600' },
            { label: 'Offline', value: totals.offline, tone: 'text-red-600' },
            { label: 'Sem confirmação', value: totals.unknown, tone: 'text-amber-600' },
            { label: mode === 'pon' ? 'Sem ONU cadastrada' : 'Portas sem cadastro', value: totals.empty, tone: 'text-slate-500' },
          ]"
          :key="item.label"
          class="panel px-4 py-3"
        >
          <p class="text-xs text-slate-500">{{ item.label }}</p>
          <p class="mt-1 text-xl font-extrabold" :class="item.tone">{{ item.value }}</p>
        </div>
      </div>
      <details class="panel mb-4 p-4">
        <summary class="cursor-pointer text-sm font-bold">
          <Target class="mr-1 inline h-4 w-4" />Teste de queda de uma porta (opcional)
        </summary>
        <div class="mb-3 mt-3 flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-bold"><Target class="mr-1 inline h-4 w-4" />Validar uma porta da CTO</h2>
          <span class="text-xs text-slate-500">O teste destaca um login; o monitor continua acompanhando todo o escopo.</span>
        </div>
        <div class="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
          <SearchableSelect
            v-model="box"
            label="Caixa de atendimento"
            :options="mode === 'cto' ? boxes.filter((b) => b.value === monitorBox) : boxes"
            placeholder="Selecione a CTO"
          /><label class="text-xs font-semibold text-slate-500"
            >Porta da CTO<select aria-label="Porta da CTO" v-model="port" class="input mt-1 w-full" :disabled="!box">
              <option value="">Selecione</option>
              <option v-for="p in ports" :key="p" :value="String(p)">{{ p }}</option>
            </select></label
          ><button
            class="button-primary network-button"
            :disabled="
              !targetRow ||
              targetRow.status !== 'online' ||
              !targetRow.loginId ||
              !!targetRow.warning ||
              monitor.state.value !== 'connected'
            "
            @click="startTest"
          >
            <Target class="h-4 w-4" />Iniciar teste de queda
          </button>
        </div>
        <p v-if="targetRow" class="mt-3 text-xs">
          <strong>{{ targetRow.login ?? "Sem login" }}</strong> · ONU {{ targetRow.position }} ·
          {{ targetRow.status === "online" ? "Online" : targetRow.status === "offline" ? "Já está offline" : "Sem confirmação" }}
        </p>
        <p v-if="targetRow?.warning" class="mt-2 text-xs text-amber-600">{{ targetRow.warning }}</p>
        <p v-else-if="port && !targetRow" class="mt-3 text-xs text-amber-600">
          Não há um vínculo único entre essa porta e uma posição da PON. Revise os cadastros no IXC.
        </p>
        <div
          v-if="test"
          class="pon-test mt-3 rounded-lg border p-3"
          :class="test.dropAt && !changedTarget && !test.interrupted ? 'pon-test-success' : 'pon-test-waiting'"
          role="status"
        >
          <p class="text-sm font-bold">{{ testMessage }}</p>
          <p class="mt-1 text-xs">
            ONU {{ test.position }} · porta {{ test.port }} <span v-if="test.dropAt">· Queda às {{ formatConsulted(test.dropAt) }}</span
            ><span v-if="test.returnAt"> · Retorno às {{ formatConsulted(test.returnAt) }}</span>
          </p>
          <p v-if="monitor.state.value !== 'connected'" class="mt-1 text-xs">Aguardando o monitor voltar ao vivo para continuar o teste.</p>
          <button class="mt-2 text-xs underline" @click="test = null">Encerrar teste</button>
        </div>
      </details>
      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section class="panel p-4">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 class="font-bold">
              {{ scopeTitle }}
              <span class="ml-1 text-xs font-normal text-slate-500"
                >{{ gridSize }} {{ mode === "cto" ? "portas da CTO" : "posições" }}</span
              >
            </h2>
            <label class="flex items-center gap-2 text-xs text-slate-500"
              ><Search class="h-4 w-4" /><input v-model="search" class="input" placeholder="Login, CTO ou ONU" aria-label="Buscar na grade"
            /></label>
          </div>
          <div class="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
            <span
              v-for="item in [
                { label: 'Online', state: 'online' },
                { label: 'Offline', state: 'offline' },
                { label: 'Sem confirmação', state: 'unknown' },
                { label: 'Sem cadastro', state: 'empty' },
                { label: 'Duplicidade', state: 'conflict' },
              ]"
              :key="item.state"
              class="flex items-center gap-1.5"
              ><span class="pon-legend" :class="`pon-${item.state}`" />{{ item.label }}</span
            >
          </div>
          <p v-if="mode === 'cto' && !capacity" class="pon-warning mb-3 rounded-lg p-2 text-xs">
            Capacidade não informada ou fora do limite de 512 portas. A grade mostra as portas cadastradas; confirme a capacidade no IXC.
          </p>
          <div
            class="pon-grid"
            :class="{ 'pon-grid-cto': mode === 'cto' }"
            :aria-label="mode === 'cto' ? 'Portas da CTO' : '128 posições da PON'"
          >
            <button
              v-for="s in slots"
              :key="s.number"
              type="button"
              class="pon-tile"
              :class="[
                `pon-${tileState(s)}`,
                {
                  'pon-dim': s.rows.length && s.rows.every(dim),
                  'pon-selected': s.rows.some((p) => p.entryId === selected),
                  'pon-observed': s.rows.some((p) => p.entryId === test?.entryId),
                  'pon-changed': s.rows.some((p) => now - (recent[p.entryId] ?? 0) < 6000),
                },
              ]"
              :title="label(s)"
              :aria-label="label(s)"
              :aria-pressed="s.rows.some((p) => p.entryId === selected)"
              @click="selected = s.rows[0]?.entryId ?? null"
            >
              <span class="font-bold">{{ s.number }}</span
              ><span class="pon-tile-indicator">{{
                s.rows.length > 1
                  ? "!"
                  : s.rows[0]?.status === "online"
                    ? "●"
                    : s.rows[0]?.status === "offline"
                      ? "↓"
                      : s.rows.length
                        ? "?"
                        : "–"
              }}</span>
            </button>
          </div>
          <p class="mt-3 text-xs text-slate-500">
            {{
              mode === "cto"
                ? "Clique em uma porta para ver seu login e sua posição na PON."
                : "Clique em uma posição para ver o login e sua porta na CTO."
            }}
            Os eventos recentes piscam por alguns segundos.
          </p>
          <div v-if="conflicts.length || unmapped.length" class="pon-warning mt-3 rounded-lg border p-3 text-xs">
            <p v-if="conflicts.length">
              {{ mode === "cto" ? "Portas" : "Posições" }} com mais de um cadastro: {{ conflicts.map((s) => s.number).join(", ") }}.
              Selecione a posição para conferir.
            </p>
            <p v-if="unmapped.length">
              {{ unmapped.length }} registro(s)
              {{ mode === "cto" ? "sem porta válida na CTO" : "com número de ONU ausente ou fora de 1–128" }}.
              <button v-for="p in unmapped" :key="p.entryId" class="ml-2 underline" @click="selected = p.entryId">
                {{ p.onuId ? `ONU #${p.onuId}` : `Login #${p.loginId}` }}
              </button>
            </p>
          </div>
        </section>
        <aside class="panel p-4">
          <h2 class="mb-3 font-bold">
            {{
              detail
                ? `${mode === "cto" ? "Porta" : "Posição"} ${mode === "cto" ? (detail.port ?? "não identificada") : (detail.position ?? "não identificada")}`
                : "Detalhes da posição"
            }}
          </h2>
          <template v-if="detail"
            ><p class="break-all text-sm font-bold">{{ detail.login ?? "Sem login compatível" }}</p>
            <p class="mt-1 text-xs text-slate-500">
              <span v-if="detail.onuId">ONU #{{ detail.onuId }}</span
              ><span v-else>Sem ONU vinculada</span> <span v-if="detail.loginId">· Login #{{ detail.loginId }}</span>
            </p>
            <span class="pon-pill mt-3" :class="`pon-${detail.status}`">{{
              detail.status === "online" ? "Online" : detail.status === "offline" ? "Offline" : "Sem confirmação"
            }}</span>
            <dl class="mt-4 space-y-3 text-sm">
              <div v-if="detail.pon">
                <dt class="text-xs text-slate-500">OLT / PON / posição ONU</dt>
                <dd class="mt-1">#{{ detail.oltId }} · {{ detail.pon }} · {{ detail.position ?? "Sem posição" }}</dd>
              </div>
              <div>
                <dt class="text-xs text-slate-500">Caixa / porta da CTO</dt>
                <dd class="mt-1 font-semibold">{{ detail.boxName ?? "Não informada" }} · {{ detail.port ?? "Sem porta" }}</dd>
              </div>
              <div>
                <dt class="text-xs text-slate-500">Fonte / IP</dt>
                <dd class="mt-1">{{ detail.source ?? "Não identificada" }} · {{ detail.ip ?? "Sem IP" }}</dd>
              </div>
              <div>
                <dt class="text-xs text-slate-500">Última sessão RADIUS</dt>
                <dd class="mt-1">{{ formatIxcDateTime(detail.sessionStartedAt) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-slate-500">Encerramento da sessão</dt>
                <dd class="mt-1">
                  {{
                    detail.sessionStoppedAt
                      ? formatIxcDateTime(detail.sessionStoppedAt)
                      : detail.sessionStartedAt
                        ? "Sessão aberta"
                        : "Não informado"
                  }}
                </dd>
              </div>
              <div v-if="detail.sessionUpdatedAt">
                <dt class="text-xs text-slate-500">Último accounting RADIUS</dt>
                <dd class="mt-1">{{ formatIxcDateTime(detail.sessionUpdatedAt) }}</dd>
              </div>
              <div v-if="detail.disconnectReason">
                <dt class="text-xs text-slate-500">Motivo registrado</dt>
                <dd>{{ detail.disconnectReason }}</dd>
              </div>
            </dl>
            <p v-if="detail.warning" class="pon-warning mt-3 rounded-lg p-2 text-xs">{{ detail.warning }}</p>
            <div v-if="(detailSlot?.rows.length ?? 0) > 1" class="mt-3">
              <p class="text-xs text-amber-600">Cadastros duplicados nesta posição:</p>
              <button
                v-for="p in detailSlot?.rows ?? []"
                :key="p.entryId"
                class="mt-2 block text-xs underline"
                @click="selected = p.entryId"
              >
                {{ p.onuId ? `ONU #${p.onuId}` : `Login #${p.loginId}` }} · {{ p.login ?? "sem login" }}
              </button>
            </div>
            <div class="mt-4 flex flex-wrap gap-2">
              <button
                v-if="detail.boxId && auth.can('network.boxes.view')"
                class="button-secondary"
                @click="boxDialog = { id: detail.boxId, name: detail.boxName ?? 'CTO' }"
              >
                Ver CTO <ArrowUpRight class="h-3 w-3" /></button
              ><button
                v-if="detail.loginId && auth.can('network.logins.list') && auth.can('network.logins.view')"
                class="button-secondary"
                @click="loginDialog = detail.loginId"
              >
                Ver login <ArrowUpRight class="h-3 w-3" />
              </button></div
          ></template>
          <p v-else class="text-xs text-slate-500">Selecione um quadrado da grade para conferir sua conexão.</p>
        </aside>
      </div>
      <section class="panel mt-4 p-4">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-bold">Quedas e reconexões · {{ scopeTitle }}</h2>
          <button class="text-xs text-slate-500 underline" :disabled="!events.length" @click="events = []">Limpar eventos</button>
        </div>
        <p v-if="!events.length" class="text-xs text-slate-500">
          Aguardando mudanças após a primeira leitura. Registros ficam somente enquanto esta tela estiver aberta.
        </p>
        <ol v-else class="max-h-64 overflow-auto divide-y divide-slate-100">
          <li
            v-for="(e, i) in events"
            :key="`${e.checkedAt}-${e.entryId}-${i}`"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs"
          >
            <ArrowDownRight v-if="e.status === 'offline'" class="h-4 w-4 text-red-600" /><ArrowUpRight
              v-else
              class="h-4 w-4 text-emerald-600"
            /><strong :class="e.status === 'offline' ? 'text-red-600' : 'text-emerald-600'">{{
              e.status === "offline" ? "Queda" : "Reconexão"
            }}</strong
            ><span
              >{{ e.pon ? `${e.pon} · ONU ${e.position ?? "sem posição"}` : "Sem ONU vinculada" }} ·
              {{ e.login ?? `Login #${e.loginId}` }}</span
            ><span class="text-slate-500">{{ e.boxName ?? "Sem CTO" }} · porta {{ e.port ?? "não informada" }}</span
            ><time class="ml-auto text-slate-500" :datetime="e.checkedAt" :title="formatConsulted(e.checkedAt)">{{
              age(e.checkedAt)
            }}</time>
          </li>
        </ol>
      </section>
    </template>
    <section v-else-if="!subscription" class="panel p-8 text-center">
      <Cable class="mx-auto mb-3 h-8 w-8 text-slate-400" />
      <p class="text-sm font-semibold">Selecione a OLT e {{ mode === "cto" ? "a CTO" : "a PON" }} para iniciar.</p>
      <p class="mt-2 text-xs text-slate-500">O acompanhamento começa automaticamente, sem escolher uma porta, e para ao sair desta tela.</p>
    </section>
    <NetworkBoxDialog
      v-if="boxDialog && auth.can('network.boxes.view')"
      :box-id="boxDialog.id"
      :box-name="boxDialog.name"
      @close="boxDialog = null"
    />
    <p v-if="loginQuery.loading.value" class="mt-3 text-sm" role="status">Abrindo o login…</p>
    <p v-if="loginQuery.error.value" role="alert" class="mt-3 text-sm text-red-600">{{ loginQuery.error.value }}</p>
    <NetworkLoginDialog
      v-if="loginDialog && loginQuery.data.value && auth.can('network.logins.list') && auth.can('network.logins.view')"
      :login="loginQuery.data.value.login"
      @close="loginDialog = null"
    />
  </div>
</template>
<style scoped>
.pon-grid {
  display: grid;
  grid-template-columns: repeat(16, minmax(0, 1fr));
  gap: 7px;
}
.pon-grid-cto {
  grid-template-columns: repeat(8, minmax(0, 1fr));
}
.pon-tile {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid;
  border-radius: 7px;
  font-size: 12px;
  min-width: 0;
  transition:
    opacity 0.2s,
    box-shadow 0.2s;
}
.pon-tile:focus-visible {
  outline: 3px solid #3b82f6;
  outline-offset: 2px;
}
.pon-tile-indicator {
  font-size: 10px;
  line-height: 1;
  margin-top: 3px;
}
.pon-online {
  color: #047857;
  background: #ecfdf5;
  border-color: #a7f3d0;
}
.pon-offline {
  color: #be123c;
  background: #fff1f2;
  border-color: #fecdd3;
}
.pon-unknown {
  color: #b45309;
  background: #fffbeb;
  border-color: #fde68a;
}
.pon-empty {
  color: #94a3b8;
  background: #f8fafc;
  border-color: #e2e8f0;
}
.pon-conflict {
  color: #7e22ce;
  background: #faf5ff;
  border-color: #d8b4fe;
}
.pon-dim {
  opacity: 0.55;
}
.pon-selected {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}
.pon-observed {
  box-shadow: 0 0 0 3px #f59e0b;
}
.pon-changed {
  animation: pon-flash 0.8s ease-in-out infinite;
}
.pon-legend {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  border-width: 1px;
}
.pon-pill {
  display: inline-flex;
  border: 1px solid;
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 11px;
  font-weight: 700;
}
.pon-warning,
.pon-test-waiting {
  background: #fffbeb;
  color: #92400e;
  border-color: #fde68a;
}
.pon-test-success {
  background: #ecfdf5;
  color: #065f46;
  border-color: #a7f3d0;
}
:global(html[data-theme="dark"] .pon-online) {
  background: #064e3b;
  color: #6ee7b7;
  border-color: #047857;
}
:global(html[data-theme="dark"] .pon-offline) {
  background: #4c0519;
  color: #fda4af;
  border-color: #9f1239;
}
:global(html[data-theme="dark"] .pon-unknown),
:global(html[data-theme="dark"] .pon-warning),
:global(html[data-theme="dark"] .pon-test-waiting) {
  background: #422006;
  color: #fcd34d;
  border-color: #854d0e;
}
:global(html[data-theme="dark"] .pon-empty) {
  background: #1e293b;
  color: #64748b;
  border-color: #334155;
}
:global(html[data-theme="dark"] .pon-conflict) {
  background: #3b0764;
  color: #d8b4fe;
  border-color: #7e22ce;
}
:global(html[data-theme="dark"] .pon-test-success) {
  background: #064e3b;
  color: #6ee7b7;
  border-color: #047857;
}
@keyframes pon-flash {
  50% {
    box-shadow: 0 0 0 4px currentColor;
    filter: brightness(1.15);
  }
}
@media (max-width: 640px) {
  .pon-grid {
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 6px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pon-changed {
    animation: none;
    outline: 3px solid currentColor;
  }
}
</style>
