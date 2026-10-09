<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ArrowLeftRight, ArrowRight, RefreshCw, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-vue-next";
import RecordDetailDialog from "./RecordDetailDialog.vue";
import SearchableSelect from "./SearchableSelect.vue";
import PortManeuverProgress from "./PortManeuverProgress.vue";
import { portManeuverApi, type ManeuverOptions, type ManeuverPlan, type ManeuverResult } from "../portManeuverApi";
import { clearManeuverBackup, readManeuverBackup, saveManeuverBackup, type ManeuverBackup } from "../portManeuverStorage";
import { useAuthStore } from "../stores/auth";
import { toast } from "../notifications/toast";
import { queryErrorMessage } from "../queryErrorMessage";
const props = defineProps<{ boxId: number; boxName: string }>();
const emit = defineEmits<{ close: []; completed: [] }>();
const auth = useAuthStore(),
  userId = auth.user?.id ?? 0;
const options = ref<ManeuverOptions | null>(null),
  loading = ref(false),
  busy = ref(false),
  executing = ref(false),
  error = ref("");
const loginId = ref<number | string>(""),
  targetPort = ref<number | string>("");
const plan = ref<ManeuverPlan | null>(null),
  result = ref<ManeuverResult | null>(null),
  backup = ref<ManeuverBackup | null>(null);
const requested = ref(false),
  confirmed = ref(false),
  reviewedAt = ref(0),
  manualChecked = ref(false);
const invalidBackup = ref(false);
const allowed = computed(() => ["network.boxes.view", "network.logins.view", "network.ports.manage"].every((p) => auth.can(p)));
const source = computed(() => options.value?.logins.find((r) => r.id === Number(loginId.value)));
const target = computed(() => options.value?.ports.find((r) => r.port === Number(targetPort.value)));
const loginOptions = computed(() =>
  (options.value?.logins ?? []).map((r) => ({
    value: r.id,
    label: `Porta ${r.port || "—"} · ${r.login} · #${r.id}`,
    description: r.blockedReason ?? `${r.customerName} · ${r.active ? "Ativo" : "Inativo"}${r.onuId ? ` · ONU #${r.onuId}` : ""}`,
    disabled: !!r.blockedReason,
  }))
);
const portOptions = computed(() =>
  (options.value?.ports ?? []).map((p) => ({
    value: p.port,
    label: `Porta ${p.port} · ${p.status === "free" ? "Livre" : p.status === "blocked" ? "Bloqueada" : p.login}`,
    description: p.reason ?? (p.status === "occupied" ? "Trocar as portas dos dois logins" : "Mover o login para esta porta"),
    disabled: p.status === "blocked" || p.port === source.value?.port,
  }))
);
const pending = computed(() => !!backup.value && (requested.value || !plan.value));
const canRecover = computed(
  () =>
    !!plan.value &&
    (["partial", "unknown", "processing"].includes(result.value?.state ?? "") ||
      (plan.value.review.mode === "restore" && result.value?.state === "rejected"))
);
const finished = computed(
  () => result.value?.state === "success" || (result.value?.state === "rejected" && plan.value?.review.mode !== "restore")
);
const operationLabel = computed(() =>
  plan.value?.review.mode === "restore"
    ? "Restaurar portas originais"
    : plan.value?.review.mode === "swap"
      ? "Trocar portas"
      : "Mover login"
);
async function loadOptions() {
  loading.value = true;
  try {
    options.value = await portManeuverApi.options(props.boxId);
  } catch (e) {
    error.value = queryErrorMessage(e instanceof Error ? e.message : "Falha ao consultar portas.");
  } finally {
    loading.value = false;
  }
}
function selectSource(value: number | string) {
  loginId.value = value;
  targetPort.value = "";
  plan.value = null;
  confirmed.value = false;
}
function selectTarget(value: number | string) {
  targetPort.value = value;
  plan.value = null;
  confirmed.value = false;
}
async function prepare() {
  if (!allowed.value || busy.value || pending.value || !source.value || !target.value) return;
  busy.value = true;
  error.value = "";
  try {
    const prepared = await portManeuverApi.prepare(props.boxId, {
      loginId: source.value.id,
      targetPort: target.value.port,
      ...(target.value.status === "occupied" && target.value.loginId ? { swapLoginId: target.value.loginId } : {}),
    });
    plan.value = prepared;
    result.value = null;
    requested.value = false;
    confirmed.value = false;
    reviewedAt.value = Date.now();
  } catch (e) {
    error.value = queryErrorMessage(e instanceof Error ? e.message : "Não foi possível revisar a manobra.");
    await loadOptions();
  } finally {
    busy.value = false;
  }
}
function remember(state: ManeuverResult["state"]) {
  if (!plan.value || !userId) throw new Error("Sessão indisponível. Entre novamente antes de executar.");
  backup.value = saveManeuverBackup(userId, plan.value, state);
}
function applyResult(next: ManeuverResult) {
  result.value = next;
  try {
    if (finished.value) {
      clearManeuverBackup(userId, props.boxId);
      backup.value = null;
    } else remember(next.state);
  } catch {
    error.value =
      "O resultado recebido está exibido abaixo, mas não foi possível atualizar o lembrete local. Confira-o antes de iniciar outra manobra.";
  }
  if (next.state === "success") {
    toast.success(next.result?.message ?? "Manobra concluída");
    emit("completed");
  }
}
async function execute() {
  if (!allowed.value || !plan.value || busy.value || requested.value || !confirmed.value) return;
  if (Date.now() - reviewedAt.value >= plan.value.expiresInSeconds * 1000) {
    plan.value = null;
    error.value = "A revisão expirou. Revise as portas novamente antes de confirmar.";
    return;
  }
  // Persist before the first POST. Browser reloads never re-send mutations automatically.
  try {
    remember("processing");
  } catch {
    error.value =
      "Não foi possível salvar a referência no navegador. Libere o armazenamento local antes de executar. Nenhuma gravação foi enviada.";
    return;
  }
  requested.value = true;
  busy.value = true;
  executing.value = true;
  error.value = "";
  try {
    const next = await portManeuverApi.execute(props.boxId, plan.value.token);
    executing.value = false;
    applyResult(next);
    await loadOptions();
  } catch (e) {
    error.value = queryErrorMessage(e instanceof Error ? e.message : "Falha ao receber o resultado. Consulte antes de repetir.");
    result.value = { state: "unknown", result: null };
  } finally {
    executing.value = false;
    busy.value = false;
  }
}
async function status() {
  const token = backup.value?.token ?? plan.value?.token;
  if (!token || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const next = await portManeuverApi.status(props.boxId, token);
    plan.value = next;
    requested.value = next.state !== "prepared";
    confirmed.value = false;
    if (next.state === "prepared") {
      requested.value = true;
      result.value = next;
      error.value = "Esta revisão não foi executada. Confira as portas e remova o lembrete para criar uma nova revisão.";
    } else applyResult(next);
    await loadOptions();
  } catch (e) {
    error.value = queryErrorMessage(e instanceof Error ? e.message : "Operação indisponível. Confira as portas no IXC.");
  } finally {
    busy.value = false;
  }
}
async function recover() {
  if (!allowed.value || !plan.value || busy.value || !canRecover.value) return;
  busy.value = true;
  error.value = "";
  try {
    const prepared = await portManeuverApi.recovery(props.boxId, plan.value.token);
    // Keep the pending reference until recovery is confirmed or the user returns to consulting it.
    plan.value = prepared;
    result.value = null;
    requested.value = false;
    confirmed.value = false;
    reviewedAt.value = Date.now();
  } catch (e) {
    error.value = queryErrorMessage(e instanceof Error ? e.message : "Não foi possível revisar a recuperação.");
  } finally {
    busy.value = false;
  }
}
function reset() {
  if (busy.value || (backup.value && !finished.value)) return;
  plan.value = null;
  result.value = null;
  requested.value = false;
  confirmed.value = false;
  error.value = "";
  targetPort.value = "";
  void loadOptions();
}
function dismissBackup() {
  if (busy.value || !manualChecked.value) return;
  try {
    clearManeuverBackup(userId, props.boxId);
  } catch {
    error.value = "Não foi possível remover o lembrete local. Verifique o armazenamento do navegador.";
    return;
  }
  invalidBackup.value = false;
  backup.value = null;
  manualChecked.value = false;
  plan.value = null;
  result.value = null;
  requested.value = false;
  error.value = "";
  void loadOptions();
}
function close() {
  if (busy.value) {
    toast.show({ type: "warning", title: "Aguarde a conclusão da consulta ou operação." });
    return;
  }
  emit("close");
}
onMounted(async () => {
  try {
    backup.value = readManeuverBackup(userId, props.boxId);
  } catch (e) {
    error.value = (e as Error).message;
    requested.value = true;
    invalidBackup.value = true;
  }
  await loadOptions();
  if (backup.value) await status();
});
</script>
<template>
  <RecordDetailDialog
    :title="'Manobra de portas'"
    :subtitle="`${boxName} · CTO #${boxId}`"
    :icon="ArrowLeftRight"
    module="network"
    :close-on-backdrop="false"
    @close="close"
  >
    <p class="mb-4 text-xs leading-5 text-slate-500">
      Mova um login para uma porta livre ou troque dois logins desta CTO. Login e ONU vinculada são conferidos juntos. A manobra altera o
      cadastro no IXC; a mudança física deve acompanhar as portas revisadas.
    </p>
    <div v-if="backup && !finished" class="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">
      <p class="font-bold"><AlertTriangle class="mr-1 inline h-4 w-4" aria-hidden="true" />Há uma manobra registrada neste navegador</p>
      <p class="mt-1">Consulte o resultado antes de iniciar outra. As credenciais dos logins não são armazenadas neste lembrete.</p>
      <p v-for="r in backup.logins" :key="r.id" class="mt-1 break-words">
        #{{ r.id }} · {{ r.login }} · Porta {{ r.fromPort || "sem porta" }} → {{ r.toPort }}
      </p>
    </div>
    <p v-if="error" class="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700" role="alert">{{ error }}</p>
    <template v-if="!requested && !plan">
      <div class="mb-4 flex items-center justify-between gap-2">
        <h3 class="text-sm font-bold">Escolha o login e a porta de destino</h3>
        <button
          type="button"
          class="button-secondary"
          :disabled="loading || busy"
          @click="
            error = '';
            loadOptions();
          "
        >
          <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Atualizar portas
        </button>
      </div>
      <div class="grid gap-3 md:grid-cols-2">
        <SearchableSelect
          :model-value="loginId"
          :options="loginOptions"
          label="Login de origem"
          :loading="loading"
          :disabled="busy || pending || !allowed"
          @update:model-value="selectSource"
        />
        <SearchableSelect
          :model-value="targetPort"
          :options="portOptions"
          label="Porta de destino"
          :loading="loading"
          :disabled="busy || pending || !source || !allowed"
          @update:model-value="selectTarget"
        />
      </div>
      <div v-if="options" class="mt-4 rounded-xl border border-slate-200 p-3">
        <div class="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <strong class="text-xs text-ink">{{ options.capacity }} portas</strong
          ><span><i class="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Livre</span
          ><span><i class="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />Ocupada</span
          ><span><i class="mr-1 inline-block h-2 w-2 rounded-full bg-slate-400" />Bloqueada</span>
        </div>
        <div class="grid max-h-60 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-8">
          <button
            v-for="p in options.ports"
            :key="p.port"
            type="button"
            :disabled="busy || pending || !source || !allowed || p.status === 'blocked' || p.port === source.port"
            :title="`Porta ${p.port}: ${p.reason ?? p.login ?? 'Livre'}`"
            :aria-label="`Porta ${p.port}: ${p.status === 'free' ? 'livre' : (p.login ?? 'bloqueada')}`"
            :aria-pressed="Number(targetPort) === p.port"
            class="rounded-lg border px-2 py-2 text-center text-xs disabled:cursor-not-allowed disabled:opacity-50"
            :class="[
              p.status === 'free'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : p.status === 'occupied'
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-slate-100 text-slate-500',
              Number(targetPort) === p.port ? 'ring-2 ring-blue-500' : '',
            ]"
            @click="selectTarget(p.port)"
          >
            <strong class="block text-sm">{{ p.port }}</strong
            >{{ p.port === source?.port ? "Origem" : p.status === "free" ? "Livre" : p.status === "occupied" ? "Trocar" : "Revisar" }}
          </button>
        </div>
        <p class="mt-2 text-[11px] leading-4 text-slate-500">
          Portas com cadastros inativos também contam como ocupadas. Duplicidades, ONUs sem vínculo compatível e reservas impedem a manobra.
        </p>
      </div>
      <div v-if="source && target" class="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <strong>{{ target.status === "occupied" ? "Troca de portas" : "Mudança para porta livre" }}</strong>
        <p class="mt-1 break-words">{{ source.login }}: porta {{ source.port }} → {{ target.port }}</p>
        <p v-if="target.status === 'occupied'" class="mt-1 break-words">{{ target.login }}: porta {{ target.port }} → {{ source.port }}</p>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="button-secondary" :disabled="busy" @click="close">Cancelar</button
        ><button
          type="button"
          class="button-primary"
          :disabled="busy || loading || pending || !source || !target || !allowed"
          @click="prepare"
        >
          <ShieldCheck class="h-4 w-4" aria-hidden="true" />{{ busy ? "Validando…" : "Revisar manobra" }}
        </button>
      </div>
    </template>
    <template v-if="plan">
      <div class="rounded-xl border border-slate-200 p-4" :aria-busy="executing">
        <h3 class="mb-3 text-sm font-bold">{{ operationLabel }} · {{ plan.review.boxName }}</h3>
        <PortManeuverProgress
          v-if="executing && plan.review.logins[0]"
          :from-port="plan.review.logins[0].fromPort"
          :to-port="plan.review.logins[0].toPort"
          :restoring="plan.review.mode === 'restore'"
        />
        <div
          v-for="r in plan.review.logins"
          :key="r.id"
          class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 py-3 first:border-0 first:pt-0"
        >
          <div class="min-w-0">
            <strong class="block break-words text-sm">{{ r.login }}</strong
            ><span class="text-[11px] text-slate-500"
              >Login #{{ r.id }} · Contrato #{{ r.contractId }}{{ r.onuId ? ` · ONU #${r.onuId}` : " · Sem ONU vinculada" }}</span
            >
            <p v-if="requested && options?.logins.some((l) => l.id === r.id)" class="mt-1 text-[11px] text-slate-500">
              Consulta atual: login
              {{
                options.logins.find((l) => l.id === r.id)?.port
                  ? `na porta ${options.logins.find((l) => l.id === r.id)?.port}`
                  : "sem porta"
              }}
              <template v-if="r.onuId">
                · ONU
                {{
                  options.logins.find((l) => l.id === r.id)?.onuPort
                    ? `na porta ${options.logins.find((l) => l.id === r.id)?.onuPort}`
                    : "sem porta"
                }}</template
              >
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2 text-sm font-bold">
            <span class="rounded-lg bg-slate-100 px-3 py-2">{{ r.fromPort ? `Porta ${r.fromPort}` : "Sem porta" }}</span
            ><ArrowRight class="h-4 w-4 text-slate-400" aria-hidden="true" /><span
              class="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700"
              >Porta {{ r.toPort }}</span
            >
          </div>
        </div>
      </div>
      <p v-if="plan.review.mode === 'swap' && !requested" class="mt-3 text-xs leading-5 text-slate-500">
        A origem ficará temporariamente sem porta, o segundo login ocupará a porta liberada e o primeiro será salvo no destino. Cada etapa é
        conferida no IXC.
      </p>
      <div
        v-if="result && requested"
        class="mt-3 rounded-xl border p-3 text-xs leading-5"
        :class="
          result.state === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'
        "
        role="status"
      >
        <CheckCircle2 v-if="result.state === 'success'" class="mr-1 inline h-4 w-4" aria-hidden="true" /><AlertTriangle
          v-else
          class="mr-1 inline h-4 w-4"
          aria-hidden="true"
        />{{ result.result?.message ?? "O resultado ainda não foi confirmado. Consulte antes de repetir." }}
      </div>
      <label v-if="!requested" class="mt-4 flex items-start gap-2 text-xs leading-5"
        ><input v-model="confirmed" type="checkbox" class="mt-1 accent-blue-600" :disabled="busy" />Conferi a CTO, os logins e as portas.
        Confirmo {{ plan.review.mode === "restore" ? "a restauração" : "a manobra" }} destes cadastros no IXC.</label
      >
      <div class="mt-4 flex flex-wrap justify-end gap-2">
        <button
          v-if="!requested && !backup"
          type="button"
          class="button-secondary"
          :disabled="busy"
          @click="
            plan = null;
            confirmed = false;
          "
        >
          Voltar
        </button>
        <button v-if="!requested" type="button" class="button-primary" :disabled="busy || !confirmed || !allowed" @click="execute">
          {{ busy ? "Executando…" : `Confirmar ${operationLabel.toLowerCase()}` }}
        </button>
        <button v-if="canRecover" type="button" class="button-secondary" :disabled="busy || !allowed" @click="recover">
          Restaurar portas originais
        </button>
        <button v-if="requested && !finished" type="button" class="button-secondary" :disabled="busy" @click="status">
          <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Consultar resultado
        </button>
        <button v-if="finished" type="button" class="button-secondary" :disabled="busy" @click="reset">Nova manobra</button>
        <button type="button" class="button-secondary" :disabled="busy" @click="close">Fechar</button>
      </div>
    </template>
    <div v-if="backup && !plan" class="mt-3 flex justify-end">
      <button type="button" class="button-secondary" :disabled="busy" @click="status">Consultar manobra salva</button>
    </div>
    <div
      v-if="(backup || invalidBackup) && !busy && (error || result?.state === 'prepared')"
      class="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500"
    >
      <label class="flex items-start gap-2"
        ><input v-model="manualChecked" type="checkbox" class="mt-0.5 accent-blue-600" />Conferi manualmente as portas no IXC e quero
        remover apenas o lembrete deste navegador.</label
      ><button type="button" class="button-secondary mt-2" :disabled="!manualChecked" @click="dismissBackup">Remover lembrete local</button>
    </div>
  </RecordDetailDialog>
</template>
