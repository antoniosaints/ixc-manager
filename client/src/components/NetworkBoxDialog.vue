<script setup lang="ts">
import { computed, reactive, ref, watch, onBeforeUnmount } from "vue";
import { Cable, MapPin, Network, Search, RefreshCw, ArrowUpRight, Info, Copy, ArrowLeftRight } from "lucide-vue-next";
import RecordQuickLink from "./RecordQuickLink.vue";
import CustomerQuickLinks from "./CustomerQuickLinks.vue";
import NetworkBoxMapDialog from "./NetworkBoxMapDialog.vue";
import { networkApi, type NetworkLogin, type NetworkLogins } from "../networkApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import { useNetworkMonitor, applyConnectionUpdate } from "../composables/useNetworkMonitor";
import { useAuthStore } from "../stores/auth";
import { formatIxcDateTime } from "../upgradesApi";
import { toast } from "../notifications/toast";
import RecordDetailDialog from "./RecordDetailDialog.vue";
import LivePagination from "./LivePagination.vue";
import LiveQueryState from "./LiveQueryState.vue";
import TechnicalStatus from "./TechnicalStatus.vue";
import ContractFields from "./ContractFields.vue";
import NetworkMonitorStatus from "./NetworkMonitorStatus.vue";
import LoginActions from "./LoginActions.vue";
import LoginNetworkTabs from "./LoginNetworkTabs.vue";
import LoginTechnologyBadge from "./LoginTechnologyBadge.vue";
import LoginSignalCard from "./LoginSignalCard.vue";
import PortManeuverDialog from "./PortManeuverDialog.vue";
const props = defineProps<{ boxId: number; boxName: string; initialConnection?: string }>();
const emit = defineEmits<{ close: [] }>();
const auth = useAuthStore();
const mapOpen = ref(false);
const maneuverOpen = ref(false);
const boxTransfer = ref(false);
const boxDialog = ref<InstanceType<typeof RecordDetailDialog>>();
const loginDialog = ref<InstanceType<typeof RecordDetailDialog>>();
const form = reactive({
  registration: props.initialConnection && props.initialConnection !== "all" ? "active" : "all",
  connection: props.initialConnection ?? "all",
  search: "",
});
const applied = ref({ ...form }),
  page = ref(1),
  limit = ref(10),
  selectedLogin = ref<NetworkLogin | null>(null);
const params = computed(() => new URLSearchParams({ ...applied.value, page: String(page.value), limit: String(limit.value) }));
const { data, loading, error, reload, refreshInBackground } = useLiveQuery<NetworkLogins>(async (signal) => {
  if (auth.can("network.logins.view")) return networkApi.logins(props.boxId, params.value, signal);
  const result = await networkApi.box(props.boxId, signal);
  return { ...result, items: [], total: 0, page: 1, limit: 10 };
});
watch(
  () => auth.can("network.logins.view"),
  () => {
    selectedLogin.value = null;
    void reload();
  }
);
const monitor = useNetworkMonitor({
  boxIds: () => [props.boxId],
  dialogTarget: () => boxDialog.value?.target,
  enabled: () => !selectedLogin.value && !maneuverOpen.value,
  refresh: async () => {
    const updated = await refreshInBackground();
    const focused = await refreshSelected();
    return updated && focused;
  },
  connections: (updates) => {
    if (data.value)
      data.value = {
        ...data.value,
        items: data.value.items.map((login) => {
          const update = updates.find((item) => item.id === login.id);
          return update ? { ...applyConnectionUpdate(login, update), port: update.port && update.port > 0 ? update.port : null } : login;
        }),
      };
  },
  offline: (events, total) => {
    const names = events.slice(0, 3).map((event) => data.value?.items.find((row) => row.id === event.id)?.login ?? `Login #${event.id}`);
    toast.show({
      type: "warning",
      title: total === 1 ? "Login ficou offline" : `${total} logins ficaram offline`,
      message: `${names.join(", ")}${total > 3 ? ` e mais ${total - 3}` : ""} · ${data.value?.box.name ?? props.boxName}`,
      key: `network-offline-box-${props.boxId}`,
      duration: 10_000,
      actions: [
        {
          label: "Ver offline",
          onClick: () => {
            form.connection = "offline";
            form.registration = "active";
            form.search = "";
            apply();
          },
        },
      ],
    });
  },
});
const focusedMonitor = useNetworkMonitor({
  scope: () => (selectedLogin.value ? { scope: "box-login", boxId: props.boxId, loginId: selectedLogin.value.id } : null),
  dialogTarget: () => loginDialog.value?.target,
  refresh: refreshSelected,
  connections: (updates) => {
    const login = selectedLogin.value;
    const update = login && updates.find((item) => item.id === login.id);
    if (login && update)
      selectedLogin.value = { ...applyConnectionUpdate(login, update), port: update.port && update.port > 0 ? update.port : null };
  },
});
let selectedRequest: AbortController | undefined;
async function refreshSelected() {
  const selected = selectedLogin.value;
  if (!selected) return true;
  selectedRequest?.abort();
  const request = new AbortController();
  selectedRequest = request;
  try {
    const result = await networkApi.login(props.boxId, selected.id, request.signal);
    if (!request.signal.aborted && selectedLogin.value?.id === selected.id) selectedLogin.value = result.login;
    return true;
  } catch {
    return false; // Retry with the next monitor tick; don't close the focused record.
  }
}
watch(
  () => selectedLogin.value?.id,
  () => selectedRequest?.abort()
);
onBeforeUnmount(() => selectedRequest?.abort());
watch([page, limit], reload);
watch(data, (value) => {
  if (value && selectedLogin.value) {
    // Keep a focused connection open even if its status no longer matches the
    // table filter; the monitor updates its badge without changing that filter.
    selectedLogin.value = value.items.find((l) => l.id === selectedLogin.value!.id) ?? selectedLogin.value;
  }
});
function apply() {
  applied.value = { ...form, search: form.search.trim() };
  selectedLogin.value = null;
  if (page.value !== 1) page.value = 1;
  else void reload();
}
async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("IP copiado");
  } catch {
    toast.error("Não foi possível copiar o IP");
  }
}
const statusLabel = (status: string) => (status === "online" ? "Online" : status === "offline" ? "Offline" : "Sem status");
</script>
<template>
  <RecordDetailDialog
    ref="boxDialog"
    :title="data?.box.name ?? boxName"
    :subtitle="`Caixa de atendimento #${boxId} · Rede`"
    :icon="Cable"
    module="network"
    @close="emit('close')"
  >
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <TechnicalStatus
        v-if="data"
        :label="data.box.active === true ? 'Caixa ativa' : data.box.active === false ? 'Caixa inativa' : 'Sem status'"
        :tone="data.box.active === true ? 'success' : data.box.active === false ? 'danger' : 'neutral'"
      />
      <NetworkMonitorStatus :state="monitor.state.value" :checked-at="monitor.checkedAt.value" :message="monitor.message.value" />
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <button
          v-if="auth.can('network.ports.manage') && auth.can('network.logins.view') && data?.box.active"
          type="button"
          class="button-secondary"
          :disabled="loading"
          @click="
            boxTransfer = false;
            maneuverOpen = true;
          "
        >
          <ArrowLeftRight class="h-3.5 w-3.5" aria-hidden="true" />Manobra de portas
        </button>
        <button
          v-if="auth.can('network.ports.manage') && auth.can('network.logins.view') && data?.box.active"
          type="button"
          class="button-secondary"
          :disabled="loading"
          @click="
            boxTransfer = true;
            maneuverOpen = true;
          "
        >
          <ArrowLeftRight class="h-3.5 w-3.5" aria-hidden="true" />Manobra de caixa
        </button>
        <RouterLink
          v-if="auth.can('network.pon.view') && data?.box.transmitterId"
          :to="{ path: '/network/pon', query: { oltId: String(data.box.transmitterId), boxId: String(props.boxId) } }"
          class="button-secondary"
          @click="emit('close')"
          ><Network class="h-3.5 w-3.5" aria-hidden="true" />Monitor PON</RouterLink
        >
        <button v-if="data?.box.coordinates" type="button" class="button-secondary" @click="mapOpen = true">
          <MapPin class="h-3.5 w-3.5" aria-hidden="true" />Ver no mapa
        </button>
        <button type="button" class="button-secondary" :disabled="loading" @click="reload">
          <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Atualizar caixa
        </button>
      </div>
    </div>
    <LiveQueryState :loading="loading" :error="error" @retry="reload" />
    <template v-if="data && !loading && !error">
      <div class="mb-3 grid gap-3 lg:grid-cols-2">
        <ContractFields
          title="Localização da caixa"
          :icon="MapPin"
          :fields="[
            { label: 'Cidade / bairro', value: [data.box.city, data.box.neighborhood].filter(Boolean).join(' · ') || null },
            { label: 'Endereço', value: data.box.address },
            { label: 'CEP', value: data.box.zip },
            {
              label: 'Coordenadas',
              value: data.box.coordinates ? `${data.box.coordinates.latitude}, ${data.box.coordinates.longitude}` : null,
            },
          ]"
        />
        <ContractFields
          title="Estrutura e capacidade"
          :icon="Cable"
          :fields="[
            { label: 'Capacidade cadastrada', value: data.box.capacity ? `${data.box.capacity} portas` : null },
            { label: 'Portas com login ativo', value: data.box.occupiedPorts },
            { label: 'Portas sem login ativo', value: data.box.freePorts },
            { label: 'Transmissor', value: data.box.transmitter ?? (data.box.transmitterId ? `#${data.box.transmitterId}` : null) },
            { label: 'Projeto / interface', value: `${data.box.projectId ?? '—'} / ${data.box.interfaceId ?? '—'}` },
            { label: 'Atualização no IXC', value: formatIxcDateTime(data.box.updatedAt) },
          ]"
        />
      </div>
      <p class="mb-3 flex items-start gap-1.5 text-[11px] text-slate-500">
        <Info class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Disponibilidade estimada pelas portas distintas de logins ativos. Não
        considera reservas ou ONUs sem vínculo com login. Conexão conforme o estado informado pelo IXC; não é um teste de alcance do
        equipamento.
      </p>
      <p
        v-if="data.box.duplicatePorts || data.box.invalidPorts"
        role="alert"
        class="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"
      >
        Revisar vínculos: {{ data.box.duplicatePorts }} logins adicionais em portas compartilhadas · {{ data.box.invalidPorts }} logins
        ativos sem porta válida.
      </p>
      <details v-if="data.box.notes" class="mb-3 rounded-lg border border-slate-200 p-2 text-xs">
        <summary class="cursor-pointer font-semibold">Observações da caixa</summary>
        <p class="mt-2 whitespace-pre-wrap break-words text-slate-500">{{ data.box.notes }}</p>
      </details>
      <div v-if="auth.can('network.logins.view')" class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          v-for="item in [
            { key: 'all', label: 'Todos os logins', value: data.box.totalLogins },
            { key: 'online', label: 'Online (ativos)', value: data.box.onlineLogins },
            { key: 'offline', label: 'Offline (ativos)', value: data.box.offlineLogins },
            { key: 'unknown', label: 'Sem status (ativos)', value: data.box.unknownLogins },
          ]"
          :key="item.key"
          type="button"
          class="support-case-card !p-2 text-left hover:bg-slate-50"
          :aria-pressed="applied.connection === item.key"
          @click="
            form.connection = item.key;
            form.registration = item.key === 'all' ? 'all' : 'active';
            apply();
          "
        >
          <span class="support-case-caption">{{ item.label }}</span
          ><strong class="block text-lg">{{ item.value.toLocaleString("pt-BR") }}</strong>
        </button>
      </div>
      <section v-if="auth.can('network.logins.view')" class="panel overflow-hidden">
        <div class="border-b border-slate-100 px-3 py-3">
          <h3 class="mb-2 text-sm font-bold">
            <Network class="mr-1 inline h-4 w-4" aria-hidden="true" />Logins vinculados
            <span class="ml-1 text-[11px] font-normal text-slate-500"
              >{{ data.total.toLocaleString("pt-BR") }} encontrados · {{ data.box.inactiveLogins }} inativos na caixa</span
            >
          </h3>
          <form class="network-controls flex flex-wrap items-center gap-2" @submit.prevent="apply">
            <label class="sr-only" for="network-login-registration">Cadastro do login</label
            ><select id="network-login-registration" v-model="form.registration" class="input !w-auto" @change="apply">
              <option value="all">Todos os cadastros</option>
              <option value="active">Logins ativos</option>
              <option value="inactive">Logins inativos</option>
            </select>
            <label class="sr-only" for="network-login-connection">Conexão do login</label
            ><select id="network-login-connection" v-model="form.connection" class="input !w-auto" @change="apply">
              <option value="all">Todas as conexões</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="unknown">Sem status</option>
            </select>
            <label class="sr-only" for="network-login-search">Buscar login da caixa</label
            ><input
              id="network-login-search"
              v-model="form.search"
              class="input min-w-40 flex-1 sm:max-w-lg"
              placeholder="Login, cliente ou IP"
              maxlength="120"
            /><button type="submit" class="button-primary"><Search class="h-3.5 w-3.5" aria-hidden="true" />Buscar</button>
          </form>
        </div>
        <div class="overflow-x-auto">
          <table class="compact-table min-w-[820px]">
            <thead>
              <tr>
                <th scope="col">Porta</th>
                <th scope="col">Login / cliente</th>
                <th scope="col">Cadastro</th>
                <th scope="col">Conexão</th>
                <th scope="col">IP / MAC</th>
                <th scope="col">Contrato</th>
                <th scope="col"><span class="sr-only">Detalhes do login</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="login in data.items" :key="login.id" class="cursor-pointer hover:bg-slate-50" @click="selectedLogin = login">
                <td>{{ login.port ?? "—" }}</td>
                <td class="max-w-60">
                  <button
                    type="button"
                    class="block truncate font-semibold text-left hover:underline"
                    :title="login.login ?? undefined"
                    @click.stop="selectedLogin = login"
                  >
                    {{ login.login ?? `Login #${login.id}` }}</button
                  ><RouterLink
                    v-if="login.customerId && auth.can('support.customer.view')"
                    :to="`/support/customers/${login.customerId}`"
                    class="compact-secondary truncate hover:underline"
                    @click.stop
                    >{{ login.customerName ?? `Cliente #${login.customerId}` }} ↗</RouterLink
                  ><span v-else class="compact-secondary truncate"
                    >{{ login.customerName ?? "Cliente não vinculado" }} · #{{ login.id }}</span
                  >
                </td>
                <td>
                  <LoginTechnologyBadge class="mb-1" :technology="login.technology" />
                  <TechnicalStatus
                    :label="login.active === true ? 'Ativo' : login.active === false ? 'Inativo' : 'Sem status'"
                    :tone="login.active === true ? 'success' : login.active === false ? 'danger' : 'neutral'"
                  />
                </td>
                <td>
                  <TechnicalStatus
                    :label="statusLabel(login.status)"
                    :tone="login.status === 'online' ? 'success' : login.status === 'offline' ? 'danger' : 'neutral'"
                    connection
                  />
                </td>
                <td class="font-mono text-[11px]">
                  {{ login.ip ?? "Sem IP" }}<span class="compact-secondary">{{ login.mac ?? "Sem MAC" }}</span>
                </td>
                <td>
                  <RecordQuickLink
                    v-if="login.contractId && (auth.can('support.contract.view') || auth.can('upgrades.contract.view'))"
                    :target="{ kind: 'contract', id: login.contractId, module: auth.can('support.contract.view') ? 'support' : 'upgrades' }"
                    :label="`Contrato #${login.contractId}`"
                  /><span v-else>{{ login.contractId ? `#${login.contractId}` : "Sem contrato" }}</span
                  ><span class="compact-secondary">{{
                    login.contractStatus === "A"
                      ? "Ativo"
                      : login.contractStatus === "I"
                        ? "Inativo"
                        : (login.contractStatus ?? "Sem status")
                  }}</span>
                </td>
                <td>
                  <button
                    type="button"
                    class="text-xs font-medium hover:underline"
                    :aria-label="`Ver conexão de ${login.login ?? login.id}`"
                    @click.stop="selectedLogin = login"
                  >
                    Ver conexão <ArrowUpRight class="inline h-3 w-3" aria-hidden="true" />
                  </button>
                </td>
              </tr>
              <tr v-if="!data.items.length">
                <td colspan="7" class="!py-8 text-center text-slate-500">Nenhum login encontrado para estes filtros.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <LivePagination v-model:page="page" v-model:limit="limit" :total="data.total" :queried-at="data.queriedAt" />
      </section>
    </template>
    <RecordDetailDialog
      ref="loginDialog"
      v-if="selectedLogin && auth.can('network.logins.view')"
      :title="`Login #${selectedLogin.id}${selectedLogin.login ? ` · ${selectedLogin.login}` : ''}`"
      :subtitle="`${data?.box.name ?? boxName} · Porta ${selectedLogin.port ?? 'não informada'}`"
      :icon="Network"
      module="network"
      @close="selectedLogin = null"
    >
      <template #title-badge><LoginTechnologyBadge :technology="selectedLogin.technology" /></template>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <TechnicalStatus
          :label="statusLabel(selectedLogin.status)"
          :tone="selectedLogin.status === 'online' ? 'success' : selectedLogin.status === 'offline' ? 'danger' : 'neutral'"
          connection
        /><span class="text-xs text-slate-500">{{ selectedLogin.customerName ?? "Cliente não informado" }}</span
        ><NetworkMonitorStatus
          :state="focusedMonitor.state.value"
          :checked-at="focusedMonitor.checkedAt.value"
          :message="focusedMonitor.message.value"
        />
        <span class="text-[10px] text-slate-500">Conexão no IXC · independente da ONU</span
        ><button v-if="selectedLogin.ip" type="button" class="button-secondary ml-auto" @click="copy(selectedLogin.ip)">
          <Copy class="h-3.5 w-3.5" aria-hidden="true" />Copiar IP
        </button>
      </div>
      <LoginNetworkTabs :login-id="selectedLogin.id" :scope="{ module: 'network', boxId }">
        <template #actions
          ><LoginActions
            :login-id="selectedLogin.id"
            :login="selectedLogin.login"
            :scope="{ module: 'network', boxId }"
            @completed="reload"
            @transferred="selectedLogin = null"
        /></template>
        <LoginSignalCard
          v-if="selectedLogin.technology?.kind !== 'radio'"
          class="mb-3"
          module="network"
          :box-id="boxId"
          :login-id="selectedLogin.id"
        />
        <div class="grid gap-3 lg:grid-cols-2">
          <ContractFields
            title="Identificação da conexão"
            :icon="Network"
            :fields="[
              { label: 'IP', value: selectedLogin.ip },
              { label: 'MAC', value: selectedLogin.mac },
              { label: 'MAC da ONU', value: selectedLogin.onuMac },
              { label: 'Concentrador', value: selectedLogin.concentrator },
              { label: 'Cliente', value: selectedLogin.customerName },
              { label: 'Contrato', value: selectedLogin.contractName },
            ]"
          /><ContractFields
            title="Histórico recente da conexão"
            :fields="[
              { label: 'Última conexão', value: formatIxcDateTime(selectedLogin.lastConnectedAt) },
              { label: 'Última desconexão', value: formatIxcDateTime(selectedLogin.lastDisconnectedAt) },
              { label: 'Motivo da desconexão', value: selectedLogin.disconnectReason },
              { label: 'Sinal do último atendimento', value: selectedLogin.lastServiceSignal },
            ]"
          />
        </div>
        <div class="mt-3 flex flex-wrap gap-3">
          <RecordQuickLink
            v-if="selectedLogin.contractId"
            :target="{ kind: 'contract', id: selectedLogin.contractId, module: auth.can('support.contract.view') ? 'support' : 'upgrades' }"
            :label="`Ver contrato #${selectedLogin.contractId}`"
          />
          <RecordQuickLink
            v-if="selectedLogin.contractId"
            :target="{ kind: 'login', id: selectedLogin.id, contractId: selectedLogin.contractId }"
            label="Dados completos do login"
          />
          <CustomerQuickLinks
            v-if="selectedLogin.customerId"
            :customer-id="selectedLogin.customerId"
            :contract-id="selectedLogin.contractId ?? undefined"
          />
        </div>
      </LoginNetworkTabs>
    </RecordDetailDialog>
    <NetworkBoxMapDialog v-if="mapOpen && data" :box="data.box" @close="mapOpen = false" />
  </RecordDetailDialog>
  <PortManeuverDialog
    v-if="maneuverOpen && auth.can('network.ports.manage') && auth.can('network.logins.view')"
    :box-id="boxId"
    :box-name="data?.box.name ?? boxName"
    :box-transfer="boxTransfer"
    @close="maneuverOpen = false"
    @completed="reload"
  />
</template>
