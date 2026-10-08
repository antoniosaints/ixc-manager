<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { Cable, RefreshCw, ShieldCheck, ShieldOff } from "lucide-vue-next";
import { onuApi } from "../onuApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import { useAuthStore } from "../stores/auth";
import RecordDetailDialog from "./RecordDetailDialog.vue";
import RecordQuickLink from "./RecordQuickLink.vue";
import TechnicalStatus from "./TechnicalStatus.vue";
import LiveQueryState from "./LiveQueryState.vue";
import { toast } from "../notifications/toast";
import OnuOperationDialog from "./OnuOperationDialog.vue";
const props = defineProps<{ onuId: number }>(),
  emit = defineEmits<{ close: []; changed: [] }>(),
  auth = useAuthStore();
const operation = ref<"authorize" | "deauthorize" | null>(null);
const query = useLiveQuery((signal) => onuApi.detail(props.onuId, signal));
watch(() => props.onuId, query.reload);
watch(
  () => auth.can("network.onus.view"),
  (allowed) => {
    if (!allowed) emit("close");
  }
);
watch(
  () => auth.can("network.equipment.authorize"),
  (allowed) => {
    if (!allowed) operation.value = null;
  }
);
const confirming = ref(false);
let mounted = true;
onBeforeUnmount(() => {
  mounted = false;
});
async function confirmDeauthorization() {
  if (confirming.value) return;
  confirming.value = true;
  const accepted = await toast.confirm({
    title: "Desautorizar esta ONU?",
    message: `ONU #${props.onuId} · ${query.data.value?.onu.serial ?? ""}. O serviço será interrompido. O cadastro será preservado. Você ainda revisará os dados antes do comando.`,
    type: "warning",
    confirmLabel: "Continuar para revisão",
    cancelLabel: "Cancelar",
  });
  confirming.value = false;
  if (
    accepted &&
    mounted &&
    auth.can("network.onus.view") &&
    auth.can("network.equipment.authorize") &&
    query.data.value?.onu.authorization === "A"
  )
    operation.value = "deauthorize";
}
async function changed() {
  emit("changed");
  await query.reload();
}
</script>
<template>
  <RecordDetailDialog
    :title="`ONU #${onuId}`"
    subtitle="Rede · Cadastro do equipamento no IXC"
    :icon="Cable"
    module="network"
    @close="emit('close')"
  >
    <LiveQueryState :loading="query.loading.value" :error="query.error.value" @retry="query.reload" />
    <template v-if="query.data.value && !query.loading.value && !query.error.value">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <TechnicalStatus
          :label="
            query.data.value.onu.authorization === 'A'
              ? 'Autorizada'
              : query.data.value.onu.authorization === 'NA'
                ? 'Não autorizada'
                : 'Autorização não informada'
          "
          :tone="query.data.value.onu.authorization === 'A' ? 'success' : 'neutral'"
        />
        <div class="flex flex-wrap gap-2">
          <button class="button-secondary" type="button" @click="query.reload">
            <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Atualizar cadastro</button
          ><button
            v-if="auth.can('network.equipment.authorize') && query.data.value.onu.authorization === 'NA'"
            class="button-primary"
            type="button"
            @click="operation = 'authorize'"
          >
            <ShieldCheck class="h-3.5 w-3.5" aria-hidden="true" />Autorizar ONU</button
          ><button
            v-if="auth.can('network.equipment.authorize') && query.data.value.onu.authorization === 'A'"
            class="button-secondary text-red-600"
            type="button"
            :disabled="confirming"
            @click="confirmDeauthorization"
          >
            <ShieldOff class="h-3.5 w-3.5" aria-hidden="true" />Desautorizar ONU
          </button>
        </div>
      </div>
      <section class="support-case-card">
        <h3 class="support-case-heading"><Cable aria-hidden="true" />Identificação e vínculos</h3>
        <dl class="grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="field in [
              { label: 'Nome', value: query.data.value.onu.name },
              { label: 'MAC / serial', value: query.data.value.onu.serial },
              { label: 'PON', value: query.data.value.onu.pon },
              { label: 'OLT', value: query.data.value.onu.oltName || `#${query.data.value.onu.oltId}` },
              { label: 'Modelo', value: query.data.value.onu.hardwareName || query.data.value.onu.model },
              {
                label: 'Perfil',
                value: query.data.value.onu.profileName || (query.data.value.onu.profileId ? `#${query.data.value.onu.profileId}` : ''),
              },
              {
                label: 'Projeto / zona',
                value: query.data.value.onu.projectName || (query.data.value.onu.projectId ? `#${query.data.value.onu.projectId}` : ''),
              },
              { label: 'Porta FTTH', value: query.data.value.onu.port },
              { label: 'VLAN uplink', value: query.data.value.onu.vlan },
            ]"
            :key="field.label"
          >
            <dt class="support-case-caption">{{ field.label }}</dt>
            <dd class="mt-1 break-words font-semibold">{{ field.value || "Não informado" }}</dd>
          </div>
          <div>
            <dt class="support-case-caption">Caixa FTTH</dt>
            <dd class="mt-1">
              <RecordQuickLink
                v-if="query.data.value.onu.boxId"
                :target="{ kind: 'box', id: query.data.value.onu.boxId }"
                :label="
                  query.data.value.onu.boxName
                    ? `${query.data.value.onu.boxName} · #${query.data.value.onu.boxId}`
                    : `Ver caixa #${query.data.value.onu.boxId}`
                "
              /><span v-if="!query.data.value.onu.boxId || !auth.can('network.boxes.view')">{{
                query.data.value.onu.boxId ? query.data.value.onu.boxName || `#${query.data.value.onu.boxId}` : "Não informada"
              }}</span>
            </dd>
          </div>
          <div>
            <dt class="support-case-caption">Contrato</dt>
            <dd class="mt-1">
              <RecordQuickLink
                v-if="query.data.value.onu.contractId"
                :target="{ kind: 'contract', id: query.data.value.onu.contractId, module: 'support' }"
                :label="`Ver contrato #${query.data.value.onu.contractId}`"
              /><span v-if="!query.data.value.onu.contractId || !auth.can('support.contract.view')">{{
                query.data.value.onu.contractId ? `#${query.data.value.onu.contractId}` : "Não informado"
              }}</span>
            </dd>
          </div>
          <div>
            <dt class="support-case-caption">Login</dt>
            <dd class="mt-1">
              <RecordQuickLink
                v-if="query.data.value.onu.loginId && query.data.value.onu.contractId"
                :target="{ kind: 'login', id: query.data.value.onu.loginId, contractId: query.data.value.onu.contractId }"
                :label="query.data.value.onu.login || `Ver login #${query.data.value.onu.loginId}`"
              /><span
                v-if="
                  !query.data.value.onu.loginId ||
                  !query.data.value.onu.contractId ||
                  !auth.can('support.contract.view') ||
                  !auth.can('support.logins.view')
                "
                >{{
                  query.data.value.onu.loginId ? query.data.value.onu.login || `#${query.data.value.onu.loginId}` : "Não informado"
                }}</span
              >
            </dd>
          </div>
        </dl>
      </section>
      <p class="mt-3 text-[11px] text-slate-500">
        A autorização reflete o cadastro do IXC. Desautorizar remove o dispositivo da OLT, preservando o cadastro.
      </p>
    </template>
    <OnuOperationDialog
      v-if="operation && auth.can('network.equipment.authorize')"
      :action="operation"
      :onu-id="onuId"
      @close="operation = null"
      @changed="changed"
    />
  </RecordDetailDialog>
</template>
