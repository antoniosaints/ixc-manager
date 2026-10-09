<script setup lang="ts">
import { ref, computed } from "vue";
import { Unplug, Eraser, Power, TriangleAlert, LoaderCircle, RefreshCw } from "lucide-vue-next";
import { loginToolsApi, type LoginToolScope, type LoginAction, type LoginActionPlan, type LoginActionResult } from "../loginToolsApi";
import { useAuthStore } from "../stores/auth";
import { toast } from "../notifications/toast";
import RecordDetailDialog from "./RecordDetailDialog.vue";
import LoginPortAction from "./LoginPortAction.vue";
const props = defineProps<{ loginId: number; login: string | null; scope: LoginToolScope }>();
const emit = defineEmits<{ completed: [port?: number]; transferred: [destination: { boxId: number; boxName: string; port: number }] }>();
const auth = useAuthStore(),
  preparing = ref(false),
  busy = ref(false),
  error = ref(""),
  plan = ref<LoginActionPlan | null>(null),
  result = ref<LoginActionResult | null>(null),
  requested = ref(false);
const actions = [
  {
    id: "disconnect",
    label: "Desconectar",
    icon: Unplug,
    permission: "network.logins.disconnect",
    help: "A sessão de internet será interrompida. O equipamento pode reconectar automaticamente.",
  },
  {
    id: "clearMac",
    label: "Limpar MAC",
    icon: Eraser,
    permission: "network.logins.clearMac",
    help: "O MAC utilizado para autenticação será removido do cadastro do login. Não altera o serial da ONU.",
  },
  {
    id: "reboot",
    label: "Reboot ONU",
    icon: Power,
    permission: "network.equipment.reboot",
    help: "A ONU será reiniciada. O acesso ficará indisponível até o equipamento retornar.",
  },
] as const;
const selected = computed(() => actions.find((a) => a.id === plan.value?.review.action));
async function prepare(action: LoginAction) {
  if (preparing.value || busy.value) return;
  preparing.value = true;
  error.value = "";
  result.value = null;
  requested.value = false;
  try {
    plan.value = await loginToolsApi.prepare(props.loginId, props.scope, action);
  } catch (e) {
    toast.error("Não foi possível preparar a ação", (e as Error).message);
  } finally {
    preparing.value = false;
  }
}
function showResult(value: LoginActionResult) {
  result.value = value;
  if (value.state === "success") {
    toast.success("Comando confirmado pelo IXC", value.result?.message);
    emit("completed");
  } else if (value.state === "rejected") toast.error("Operação não executada", value.result?.message);
}
async function execute() {
  if (!plan.value || busy.value || requested.value) return;
  busy.value = true;
  requested.value = true;
  error.value = "";
  try {
    showResult(await loginToolsApi.execute(plan.value.token));
  } catch (e) {
    error.value = `${(e as Error).message} Consulte o resultado antes de iniciar outra tentativa.`;
  } finally {
    busy.value = false;
  }
}
async function status() {
  if (!plan.value || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    showResult(await loginToolsApi.status(plan.value.token));
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
function close() {
  if (!busy.value) plan.value = null;
}
</script>
<template>
  <div class="flex flex-wrap items-center justify-end gap-2">
    <LoginPortAction :login-id="loginId" :disabled="preparing || busy" @completed="(port) => emit('completed', port)" />
    <LoginPortAction
      :login-id="loginId"
      :disabled="preparing || busy"
      box-transfer
      @transferred="(destination) => emit('transferred', destination)"
      @completed="emit('completed')"
    />
    <button
      v-for="action in actions.filter((a) => auth.can(a.permission))"
      :key="action.id"
      type="button"
      class="button-secondary"
      :disabled="preparing || busy"
      @click="prepare(action.id)"
    >
      <component
        :is="preparing ? LoaderCircle : action.icon"
        class="h-3.5 w-3.5"
        :class="{ 'animate-spin': preparing }"
        aria-hidden="true"
      />{{ action.label }}
    </button>
  </div>
  <RecordDetailDialog
    v-if="plan"
    :title="`Confirmar ${selected?.label.toLowerCase()} · Login #${plan.review.loginId}`"
    :subtitle="plan.review.login || login || 'Login'"
    :icon="TriangleAlert"
    :module="scope.module"
    compact
    :close-on-backdrop="false"
    @close="close"
  >
    <p class="mb-3 text-sm">{{ selected?.help }}</p>
    <dl class="support-case-card mb-3 grid gap-3 text-xs sm:grid-cols-2">
      <div>
        <dt class="support-case-caption">Cliente / contrato</dt>
        <dd>#{{ plan.review.customerId }} · {{ plan.review.contractId ? `Contrato #${plan.review.contractId}` : "Sem contrato" }}</dd>
      </div>
      <div v-if="plan.review.action === 'clearMac'">
        <dt class="support-case-caption">MAC atual</dt>
        <dd class="font-mono">{{ plan.review.mac }}</dd>
      </div>
      <template v-if="plan.review.action === 'reboot'"
        ><div>
          <dt class="support-case-caption">ONU / OLT</dt>
          <dd>#{{ plan.review.onuId }} · OLT #{{ plan.review.oltId }}</dd>
        </div>
        <div>
          <dt class="support-case-caption">Serial / PON</dt>
          <dd>{{ plan.review.serial ?? "Não informado" }} · {{ plan.review.pon }}</dd>
        </div></template
      >
    </dl>
    <p v-if="!requested" class="mb-3 text-xs text-slate-500">Revise o login e confirme a operação. A revisão expira em 5 minutos.</p>
    <p v-if="error" role="alert" class="mb-3 text-xs text-red-600">{{ error }}</p>
    <p v-if="result" role="status" class="support-case-card mb-3 text-sm">
      {{
        result.result?.message ??
        (result.state === "processing"
          ? "Operação em andamento. Aguarde e consulte o resultado."
          : "Nenhum comando foi confirmado. Feche e revise uma nova tentativa.")
      }}
    </p>
    <div class="flex flex-wrap justify-end gap-2">
      <button type="button" class="button-secondary" :disabled="busy" @click="close">{{ requested ? "Fechar" : "Cancelar" }}</button
      ><button v-if="!requested" type="button" class="button-primary" :disabled="busy" @click="execute">
        Confirmar {{ selected?.label.toLowerCase() }}</button
      ><button
        v-else-if="error || result?.state === 'processing' || result?.state === 'unknown'"
        type="button"
        class="button-secondary"
        :disabled="busy"
        @click="status"
      >
        <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Consultar resultado
      </button>
    </div>
  </RecordDetailDialog>
</template>
