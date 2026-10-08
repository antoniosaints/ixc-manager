<script setup lang="ts">
import { computed, ref, reactive, watch, onBeforeUnmount, nextTick } from "vue";
import { ShieldCheck, ShieldOff, RefreshCw, AlertTriangle, ChevronRight } from "lucide-vue-next";
import {
  onuApi,
  OnuApiError,
  type OnuBlockage,
  type PendingOnu,
  type Onu,
  type OnuConfiguration,
  type OnuOptions,
  type OnuLogin,
  type OnuContract,
  type OnuReview,
  type OnuOperationResult,
} from "../onuApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import { useAuthStore } from "../stores/auth";
import { toast } from "../notifications/toast";
import RecordDetailDialog from "./RecordDetailDialog.vue";
import SearchableSelect from "./SearchableSelect.vue";
import LiveQueryState from "./LiveQueryState.vue";
const props = defineProps<{ action: "authorize" | "deauthorize"; pending?: PendingOnu; onuId?: number }>();
const emit = defineEmits<{ close: []; changed: [] }>();
const auth = useAuthStore();
const working = ref(false),
  error = ref(""),
  review = ref<OnuReview | null>(null),
  result = ref<OnuOperationResult | null>(null),
  detail = ref<Onu | null>(null),
  options = ref<OnuOptions | null>(null);
const busyCard = ref<HTMLElement>();
const blockage = ref<OnuBlockage | null>(null),
  blockageUntil = ref<number | null>(null),
  clock = ref(Date.now()),
  checking = ref(false),
  reviewExpired = ref(false),
  previousResult = ref<OnuOperationResult | null>(null);
let activeDialog = true;
let statusTimer: ReturnType<typeof setInterval> | undefined, clockTimer: ReturnType<typeof setInterval> | undefined;
const remaining = computed(() =>
  blockageUntil.value === null ? null : Math.max(0, Math.ceil((blockageUntil.value - clock.value) / 1000))
);
const waitingTitle = computed(() =>
  blockage.value?.state === "unknown" ? "Aguardando conferência da operação anterior" : "Aguardando liberação da OLT ou login"
);
function setBlockage(value: OnuBlockage | null) {
  const firstBlock = !!value && !blockage.value;
  if (value?.operationToken !== blockage.value?.operationToken) previousResult.value = null;
  blockage.value = value;
  if (firstBlock)
    void nextTick(() => {
      if (!activeDialog || !blockage.value) return;
      busyCard.value?.focus({ preventScroll: true });
      busyCard.value?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  clock.value = Date.now();
  blockageUntil.value = value?.retryAfterSeconds === null || !value ? null : Date.now() + value.retryAfterSeconds * 1000;
}
function backToForm() {
  review.value = null;
  result.value = null;
  setBlockage(null);
  reviewExpired.value = false;
  error.value = "";
}
watch(
  () => !reviewExpired.value && auth.can("network.equipment.authorize") && (!!blockage.value || result.value?.state === "processing"),
  (active) => {
    clearInterval(statusTimer);
    clearInterval(clockTimer);
    if (active) {
      statusTimer = setInterval(() => {
        if (!document.hidden && !working.value && !checking.value) void status(true);
      }, 2000);
      clockTimer = setInterval(() => {
        clock.value = Date.now();
      }, 1000);
    }
  }
);
onBeforeUnmount(() => {
  activeDialog = false;
  clearInterval(statusTimer);
  clearInterval(clockTimer);
});
const selectedLogin = ref<OnuLogin | null>(null),
  selectedContract = ref<OnuContract | null>(null),
  contractResults = ref<OnuContract[]>([]),
  loginResults = ref<OnuLogin[]>([]),
  searchingContracts = ref(false),
  searchingLogins = ref(false),
  profileScript = ref(""),
  profileError = ref(""),
  loadingScript = ref(false),
  ports = ref<{ port: number; occupied: boolean }[]>([]);
const contractOptions = computed(() =>
  contractResults.value.map((c) => ({
    value: Number(c.id),
    label: `#${c.id} · ${c.name}`,
    description: `${c.customerName} · Cliente #${c.customerId}`,
  }))
);
const loginOptions = computed(() =>
  loginResults.value.map((l) => ({ value: Number(l.id), label: `#${l.id} · ${l.login}`, description: l.customerName }))
);
const namedOptions = (items: { id: number; name: string }[] = []) =>
  items.map((p) => ({ value: Number(p.id), label: `#${p.id} · ${p.name}` }));
let contractAbort: AbortController | undefined, loginAbort: AbortController | undefined;
let contractTimer: ReturnType<typeof setTimeout> | undefined, loginTimer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => {
  clearTimeout(contractTimer);
  clearTimeout(loginTimer);
  contractAbort?.abort();
  loginAbort?.abort();
});
const configuration = reactive<OnuConfiguration>({
  profileId: 0,
  hardwareId: 0,
  projectId: 0,
  boxId: 0,
  port: 0,
  loginId: 0,
  contractId: 0,
  vlan: 0,
  name: "",
});
const oltId = computed(() => props.pending?.oltId ?? detail.value?.oltId ?? 0);
const load = useLiveQuery(async (signal) => {
  if (props.onuId) {
    detail.value = (await onuApi.detail(props.onuId, signal)).onu;
    const d = detail.value;
    Object.assign(configuration, {
      profileId: d.profileId ?? 0,
      hardwareId: d.hardwareId ?? 0,
      projectId: d.projectId ?? 0,
      boxId: d.boxId ?? 0,
      port: d.port ?? 0,
      loginId: d.loginId ?? 0,
      contractId: d.contractId ?? 0,
      vlan: d.vlan ?? 0,
      name: d.name,
    });
  }
  if (props.action === "authorize") {
    options.value = await onuApi.options(new URLSearchParams({ oltId: String(oltId.value) }), signal);
    if (!configuration.profileId)
      configuration.profileId = Number(options.value.olts.find((o) => Number(o.id) === oltId.value)?.defaultProfileId ?? 0);
    if (configuration.loginId) {
      contractResults.value = (await onuApi.contracts(String(configuration.contractId), signal)).items;
      selectedContract.value = contractResults.value.find((c) => Number(c.id) === configuration.contractId) ?? null;
      if (selectedContract.value) {
        loginResults.value = (await onuApi.contractLogins(configuration.contractId, "", signal)).items;
        selectedLogin.value = loginResults.value.find((l) => Number(l.id) === configuration.loginId) ?? null;
      }
    }
  }
  return true;
});
const boxes = computed(
  () => options.value?.boxes.filter((b) => !configuration.projectId || Number(b.projectId) === configuration.projectId) ?? []
);
watch(
  () => [configuration.boxId, configuration.loginId],
  async () => {
    ports.value = [];
    if (!configuration.boxId) return;
    const box = configuration.boxId,
      login = configuration.loginId;
    try {
      const p = await onuApi.ports(box, login || undefined, props.onuId);
      if (box === configuration.boxId && login === configuration.loginId) ports.value = p.ports;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Não foi possível consultar portas.";
    }
  }
);
watch(
  () => configuration.projectId,
  () => {
    if (options.value && configuration.boxId && !boxes.value.some((b) => Number(b.id) === configuration.boxId)) {
      configuration.boxId = 0;
      configuration.port = 0;
    }
  }
);
watch(
  () => configuration.profileId,
  async (profileId, _old, cleanup) => {
    const abort = new AbortController();
    cleanup(() => abort.abort());
    profileScript.value = "";
    profileError.value = "";
    loadingScript.value = !!profileId;
    if (!profileId) return;
    try {
      const profile = await onuApi.profile(profileId, oltId.value, abort.signal);
      if (!abort.signal.aborted) profileScript.value = profile.script;
    } catch (e) {
      if (!abort.signal.aborted) profileError.value = e instanceof Error ? e.message : "Falha ao consultar script.";
    } finally {
      if (!abort.signal.aborted) loadingScript.value = false;
    }
  }
);
function chooseContract(value: number | string) {
  selectedContract.value = contractResults.value.find((c) => Number(c.id) === Number(value)) ?? null;
  configuration.contractId = selectedContract.value ? Number(value) : 0;
  configuration.loginId = 0;
  configuration.port = 0;
  selectedLogin.value = null;
  loginResults.value = [];
  configuration.name = "";
  searchLogins("");
}
function chooseLogin(value: number | string) {
  const login = loginResults.value.find((l) => Number(l.id) === Number(value));
  if (!login || Number(login.contractId) !== configuration.contractId) return;
  selectedLogin.value = login;
  configuration.loginId = Number(login.id);
  configuration.name = login.login;
  if (options.value?.boxes.some((b) => Number(b.id) === Number(login.boxId))) {
    configuration.boxId = Number(login.boxId);
    configuration.projectId = Number(options.value.boxes.find((b) => Number(b.id) === configuration.boxId)?.projectId ?? 0);
    configuration.port = Number(login.port ?? 0);
  }
}
function searchContracts(search: string) {
  clearTimeout(contractTimer);
  contractAbort?.abort();
  contractAbort = new AbortController();
  const abort = contractAbort;
  contractResults.value = selectedContract.value ? [selectedContract.value] : [];
  searchingContracts.value = false;
  if (!/^\d+$/.test(search.trim()) && search.trim().length < 3) return;
  searchingContracts.value = true;
  contractTimer = setTimeout(async () => {
    try {
      const data = await onuApi.contracts(search, abort.signal);
      if (!abort.signal.aborted) contractResults.value = data.items;
    } catch (e) {
      if (!abort.signal.aborted) error.value = e instanceof Error ? e.message : "Falha na busca de contratos.";
    } finally {
      if (!abort.signal.aborted) searchingContracts.value = false;
    }
  }, 250);
}
function searchLogins(search: string) {
  clearTimeout(loginTimer);
  loginAbort?.abort();
  loginAbort = new AbortController();
  const abort = loginAbort,
    contractId = configuration.contractId;
  loginResults.value = selectedLogin.value ? [selectedLogin.value] : [];
  searchingLogins.value = false;
  if (!contractId) return;
  searchingLogins.value = true;
  loginTimer = setTimeout(async () => {
    try {
      const data = await onuApi.contractLogins(contractId, search, abort.signal);
      if (!abort.signal.aborted && contractId === configuration.contractId) loginResults.value = data.items;
    } catch (e) {
      if (!abort.signal.aborted) error.value = e instanceof Error ? e.message : "Falha na busca de logins.";
    } finally {
      if (!abort.signal.aborted) searchingLogins.value = false;
    }
  }, 250);
}
async function prepare() {
  working.value = true;
  error.value = "";
  reviewExpired.value = false;
  setBlockage(null);
  result.value = null;
  try {
    review.value = await onuApi.prepare(
      props.action === "deauthorize"
        ? { action: "deauthorize", onuId: props.onuId! }
        : {
            action: "authorize",
            oltId: oltId.value,
            ...(props.pending ? { pendingId: props.pending.pendingId } : { onuId: props.onuId }),
            configuration: { ...configuration },
          }
    );
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Não foi possível revisar.";
  } finally {
    working.value = false;
  }
}
function applyStatus(next: OnuOperationResult) {
  if (!activeDialog) return;
  if (next.state === "prepared") {
    const wasBlocked = !!blockage.value;
    result.value = null;
    setBlockage(next.blockage ?? null);
    if (wasBlocked && !next.blockage)
      toast.info("OLT e login liberados", "Confira a revisão e confirme quando quiser iniciar. Nenhum comando foi reenviado.");
  } else {
    setBlockage(null);
    result.value = next;
    if (next.state === "success") emit("changed");
  }
}
async function execute() {
  if (!review.value || working.value || blockage.value || reviewExpired.value) return;
  working.value = true;
  error.value = "";
  try {
    const next = await onuApi.execute(review.value.token);
    applyStatus(next);
    if (next.state === "success") toast.success("Operação de ONU confirmada", next.result?.message);
    else
      toast.show({
        type: next.state === "rejected" ? "error" : "warning",
        title: next.state === "processing" ? "Operação em andamento" : "Confira o resultado da ONU",
        message: next.result?.message ?? "Acompanhando a resposta do IXC.",
      });
  } catch (e) {
    if (e instanceof OnuApiError && e.code === "ONU_OPERATION_BUSY" && e.blockage) {
      result.value = null;
      setBlockage(e.blockage);
      toast.show({
        type: "warning",
        title: "Esta tentativa ainda não foi iniciada",
        message: "Outra operação reservou a OLT ou o login. Acompanhe a liberação neste modal.",
        key: `onu-busy-${review.value.token}`,
      });
    } else if (e instanceof OnuApiError && e.code === "ONU_REVIEW_UNAVAILABLE") {
      reviewExpired.value = true;
      error.value = "A revisão expirou. Volte às configurações e revise novamente antes de confirmar.";
    } else {
      error.value = e instanceof Error ? e.message : "Falha ao obter a confirmação. Consulte o resultado antes de repetir.";
      try {
        applyStatus(await onuApi.status(review.value.token));
      } catch {
        result.value = { state: "unknown", result: null };
      }
    }
  } finally {
    working.value = false;
  }
}
async function status(background = false) {
  if (!review.value || checking.value || working.value) return;
  checking.value = true;
  try {
    applyStatus(await onuApi.status(review.value.token));
    if (!background) error.value = "";
  } catch (e) {
    if (e instanceof OnuApiError && e.code === "ONU_REVIEW_UNAVAILABLE") {
      reviewExpired.value = true;
      setBlockage(null);
      error.value = "A revisão expirou. Volte às configurações e revise novamente.";
    } else error.value = "Não foi possível consultar o andamento. A confirmação continua bloqueada enquanto não verificarmos a liberação.";
  } finally {
    checking.value = false;
  }
}
async function previousStatus() {
  if (!blockage.value?.operationToken || checking.value) return;
  checking.value = true;
  try {
    previousResult.value = await onuApi.status(blockage.value.operationToken);
  } catch {
    error.value = "O resultado anterior não está mais disponível. Confira o cadastro no IXC antes de continuar.";
  } finally {
    checking.value = false;
  }
}
function close() {
  if (working.value) {
    toast.info("Operação em andamento", "Aguarde a confirmação do IXC.");
    return;
  }
  emit("close");
}
const steps: Record<string, string> = {
  validation: "Validação",
  creation: "Cadastro da ONU",
  configuration: "Configuração no IXC",
  provisioning: "Gravação na OLT",
  deauthorization: "Desautorização na OLT",
};
const deauthorizationFields = computed(() =>
  Object.entries((review.value?.review.onu ?? {}) as Record<string, unknown>).filter(([key]) =>
    ["id", "serial", "pon", "loginId", "contractId"].includes(key)
  )
);
const labels: Record<string, string> = {
  profileId: "ID do perfil",
  hardwareId: "ID do hardware",
  projectId: "ID do projeto / zona",
  boxId: "ID da caixa FTTH",
  oltId: "ID da OLT",
  serial: "MAC / serial",
  pon: "PON",
  model: "Modelo",
  oltName: "OLT",
  profileName: "Perfil",
  hardwareName: "Hardware",
  projectName: "Projeto / zona",
  boxName: "Caixa FTTH",
  port: "Porta FTTH",
  vlan: "VLAN uplink",
  login: "Login",
  contractId: "Contrato ID",
  contractName: "Contrato",
  name: "Nome",
  onuId: "ONU ID",
  id: "ONU ID",
  loginId: "Login ID",
};
</script>
<template>
  <RecordDetailDialog
    :title="action === 'authorize' ? 'Autorizar ONU' : 'Desautorizar ONU'"
    :subtitle="`Rede · ${pending?.serial ?? detail?.serial ?? `ONU #${onuId}`}`"
    :icon="action === 'authorize' ? ShieldCheck : ShieldOff"
    module="network"
    :close-on-backdrop="false"
    @close="close"
  >
    <LiveQueryState :loading="load.loading.value" :error="load.error.value" @retry="load.reload" />
    <template v-if="load.data.value && !load.loading.value && !load.error.value">
      <p class="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <AlertTriangle class="h-4 w-4 shrink-0" aria-hidden="true" />{{
          action === "authorize"
            ? "A confirmação cria ou atualiza o cadastro no IXC e grava a configuração na OLT. Confira serial, PON, perfil e vínculos."
            : "Desautorizar remove o equipamento da OLT e interrompe o serviço. O cadastro da ONU será preservado."
        }}
      </p>
      <section
        v-if="blockage"
        ref="busyCard"
        tabindex="-1"
        class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800"
        role="status"
        aria-live="polite"
      >
        <h3 class="flex items-center gap-2 text-sm font-bold"><AlertTriangle class="h-4 w-4" aria-hidden="true" />{{ waitingTitle }}</h3>
        <p class="mt-2 text-xs">
          Esta tentativa ainda não enviou comandos.
          {{
            blockage.scope === "olt"
              ? "Outra operação reservou esta OLT, inclusive para outro login."
              : "Outra operação reservou este login."
          }}
        </p>
        <p v-if="blockage.state === 'unknown'" class="mt-2 text-xs">
          O IXC não confirmou a operação anterior. Confira o equipamento e o cadastro antes de tentar novamente.
        </p>
        <p class="mt-2 text-xs font-semibold">
          {{
            remaining === null
              ? "Aguardando liberação confirmada pelo servidor."
              : remaining > 0
                ? `Prazo da reserva atual: ${remaining}s.`
                : "Conferindo se a reserva foi liberada…"
          }}
        </p>
        <p class="mt-1 text-[11px]">
          Andamento consultado automaticamente a cada 2 segundos. A reserva pode ser renovada enquanto a outra operação estiver executando.
          Nenhum comando será reenviado automaticamente.
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="button-secondary" :disabled="checking" @click="status()">
            <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': checking }" aria-hidden="true" />Verificar liberação
          </button>
          <button v-if="blockage.operationToken" type="button" class="button-secondary" :disabled="checking" @click="previousStatus">
            Consultar operação anterior
          </button>
        </div>
        <div v-if="previousResult" class="mt-3 rounded-lg border border-amber-200 p-3 text-xs">
          <strong>{{
            previousResult.state === "processing"
              ? "Operação anterior em andamento"
              : previousResult.state === "success"
                ? "Operação anterior confirmada"
                : "Operação anterior requer conferência"
          }}</strong>
          <p class="mt-1">{{ previousResult.result?.message ?? "Aguardando resposta do IXC." }}</p>
          <p v-if="previousResult.result?.step" class="mt-1">
            {{ previousResult.result.onuId ? `ONU #${previousResult.result.onuId} · ` : "" }}Etapa:
            {{ steps[previousResult.result.step] ?? previousResult.result.step }}
          </p>
        </div>
      </section>
      <div v-if="result" class="panel p-4" role="status">
        <h3 class="text-sm font-bold">
          {{
            result.state === "success"
              ? "Operação confirmada"
              : result.state === "processing"
                ? "Operação em andamento"
                : result.state === "rejected"
                  ? "Operação não iniciada"
                  : result.state === "partial"
                    ? "Operação incompleta"
                    : "Resultado não confirmado"
          }}
        </h3>
        <p class="mt-2 text-xs">{{ result.result?.message ?? "O resultado ainda não foi confirmado. Confira no IXC antes de repetir." }}</p>
        <p v-if="result.result?.onuId" class="mt-2 text-xs text-slate-500">
          ONU #{{ result.result.onuId }} · Etapa: {{ steps[result.result.step] ?? result.result.step }}
        </p>
        <button type="button" class="button-secondary mt-3" :disabled="working || checking" @click="status()">
          <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Consultar resultado
        </button>
        <button v-if="result.state === 'rejected'" class="button-secondary mt-3 ml-2" type="button" @click="backToForm">
          Revisar configurações
        </button>
      </div>
      <div v-else-if="review" class="panel p-4">
        <h3 class="mb-3 text-sm font-bold">Revise antes de confirmar</h3>
        <dl class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <template v-for="(value, key) in review.review" :key="key"
            ><div v-if="labels[key] && value !== null">
              <dt class="text-[11px] text-slate-500">{{ labels[key] }}</dt>
              <dd class="mt-1 break-words text-xs font-semibold">{{ value }}</dd>
            </div></template
          >
        </dl>
        <dl v-if="action === 'deauthorize' && review.review.onu" class="mt-3 grid gap-3 sm:grid-cols-3">
          <div v-for="[key, value] in deauthorizationFields" :key="key">
            <template v-if="['id', 'serial', 'pon', 'loginId', 'contractId'].includes(String(key))"
              ><dt class="text-[11px] text-slate-500">{{ labels[key] ?? key }}</dt>
              <dd class="text-xs font-semibold">{{ value ?? "—" }}</dd></template
            >
          </div>
        </dl>
        <section v-if="review.profileScript" class="mt-4">
          <h4 class="text-xs font-bold">Script do perfil na revisão</h4>
          <pre class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 p-3 text-xs">{{
            review.profileScript
          }}</pre>
        </section>
        <p class="mt-4 text-[11px] text-slate-500">
          Revisão válida por 5 minutos. O acesso e os dados serão conferidos novamente antes do comando.
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button class="button-secondary" type="button" :disabled="working" @click="backToForm">Voltar</button
          ><button
            class="button-primary"
            type="button"
            :disabled="working || checking || !!blockage || reviewExpired || !auth.can('network.equipment.authorize')"
            @click="execute"
          >
            <ShieldCheck class="h-3.5 w-3.5" aria-hidden="true" />{{
              working ? "Aguardando IXC…" : action === "authorize" ? "Confirmar autorização" : "Confirmar desautorização"
            }}
          </button>
        </div>
      </div>
      <form v-else class="onu-operation-form" @submit.prevent="prepare">
        <template v-if="action === 'authorize'">
          <div class="panel mb-3 p-3 text-xs">
            <strong>{{ pending?.serial ?? detail?.serial }}</strong
            ><span class="ml-3 text-slate-500"
              >PON {{ pending?.pon ?? detail?.pon }} ·
              {{ options?.olts.find((o) => Number(o.id) === oltId)?.name ?? `OLT #${oltId}` }}</span
            >
          </div>
          <section class="panel mb-3 p-3">
            <h3 class="mb-3 text-sm font-bold">1. Contrato e login</h3>
            <div class="grid gap-3 sm:grid-cols-2">
              <SearchableSelect
                :model-value="configuration.contractId"
                :options="contractOptions"
                label="Contrato"
                placeholder="Busque ID, plano, cliente ou CPF/CNPJ"
                remote
                :loading="searchingContracts"
                :disabled="working"
                :hint="
                  contractResults.length > 30
                    ? 'Refine a busca: mostrando os primeiros 31 contratos.'
                    : 'Somente contratos ativos. Busque por ID ou pelo menos 3 caracteres.'
                "
                @search="searchContracts"
                @update:model-value="chooseContract"
              />
              <SearchableSelect
                :model-value="configuration.loginId"
                :options="loginOptions"
                label="Login do contrato"
                empty-message="Nenhum login ativo encontrado neste contrato."
                placeholder="Selecione um login"
                remote
                :loading="searchingLogins"
                :disabled="working || !configuration.contractId"
                :hint="
                  loginResults.length > 100
                    ? 'Refine a busca: mostrando os primeiros 101 logins.'
                    : 'Somente logins ativos do contrato selecionado.'
                "
                @search="searchLogins"
                @update:model-value="chooseLogin"
              />
            </div>
            <p v-if="selectedContract" class="mt-2 text-xs text-slate-500">
              {{ selectedContract.customerName }} · Contrato #{{ selectedContract.id
              }}<span v-if="selectedLogin"> · Login #{{ selectedLogin.id }}</span>
            </p>
          </section>
          <h3 class="mb-3 text-sm font-bold">2. Configuração do equipamento</h3>
          <fieldset :disabled="working" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SearchableSelect
              v-model="configuration.profileId"
              :options="namedOptions(options?.profiles)"
              label="Perfil"
              placeholder="Selecione o perfil"
              :disabled="working"
            />
            <SearchableSelect
              v-model="configuration.hardwareId"
              :options="[{ value: 0, label: 'Sem hardware' }, ...namedOptions(options?.hardware)]"
              label="Hardware (opcional)"
              placeholder="Sem hardware"
              :disabled="working"
            />
            <label class="text-xs text-slate-500"
              >VLAN uplink<input v-model.number="configuration.vlan" class="input mt-1" type="number" min="1" max="4094" required
            /></label>
            <SearchableSelect
              v-model="configuration.projectId"
              :options="namedOptions(options?.projects)"
              label="Projeto / zona FTTH"
              placeholder="Selecione o projeto"
              :disabled="working"
            />
            <SearchableSelect
              v-model="configuration.boxId"
              :options="namedOptions(boxes)"
              label="Caixa FTTH (CTO)"
              placeholder="Selecione a caixa"
              :disabled="working"
            />
            <SearchableSelect
              v-model="configuration.port"
              :options="ports.map((p) => ({ value: p.port, label: `${p.port}${p.occupied ? ' · Ocupada' : ''}`, disabled: p.occupied }))"
              label="Porta FTTH"
              placeholder="Selecione a porta"
              :disabled="working || !configuration.boxId"
            />
          </fieldset>
          <section v-if="configuration.profileId" class="panel mt-3 p-3">
            <h3 class="text-sm font-bold">Script do perfil #{{ configuration.profileId }}</h3>
            <p class="mt-1 text-[11px] text-slate-500">
              Modelo cadastrado no IXC. As variáveis serão preenchidas pelo IXC durante a autorização.
            </p>
            <p v-if="loadingScript" class="mt-2 text-xs" role="status">Consultando script…</p>
            <p v-else-if="profileError" class="mt-2 text-xs text-red-600" role="alert">
              {{ profileError
              }}<button type="button" class="button-secondary ml-2" @click="configuration.profileId = 0">Selecionar outro perfil</button>
            </p>
            <pre
              v-else
              class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 p-3 text-xs"
              aria-label="Script do perfil"
              >{{ profileScript }}</pre>
          </section>
          <label class="mt-3 block text-xs text-slate-500"
            >Nome da ONU<input v-model.trim="configuration.name" class="input mt-1" maxlength="100" required
          /></label>
        </template>
        <div v-else class="panel p-3 text-xs">
          <strong>ONU #{{ onuId }} · {{ detail?.serial }}</strong>
          <p class="mt-1 text-slate-500">
            PON {{ detail?.pon }} · Login #{{ detail?.loginId ?? "—" }} · Contrato #{{ detail?.contractId ?? "—" }}
          </p>
        </div>
        <div class="mt-4 flex justify-end">
          <button
            class="button-primary"
            :disabled="
              working ||
              !auth.can('network.equipment.authorize') ||
              (action === 'authorize' &&
                (!selectedContract ||
                  !selectedLogin ||
                  loadingScript ||
                  !!profileError ||
                  !profileScript ||
                  !configuration.profileId ||
                  !configuration.projectId ||
                  !configuration.boxId ||
                  !configuration.port ||
                  !configuration.vlan))
            "
          >
            <ChevronRight class="h-3.5 w-3.5" aria-hidden="true" />{{ working ? "Validando…" : "Revisar operação" }}
          </button>
        </div>
      </form>
      <p v-if="error" class="mt-3 text-xs text-red-600" role="alert">{{ error }}</p>
    </template>
  </RecordDetailDialog>
</template>
<style scoped>
.onu-operation-form .input {
  height: 32px;
  min-height: 32px;
  padding: 0.35rem 0.6rem;
  font-size: 0.75rem;
}
.onu-operation-form fieldset label {
  display: flex;
  flex-direction: column;
}
.onu-operation-form fieldset .input {
  width: 100%;
}
</style>
