<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Network, Search, RotateCcw, Wifi, WifiOff, Users, ArrowUpRight } from "lucide-vue-next";
import { networkApi, type NetworkLoginRow } from "../networkApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import { useNetworkMonitor, applyConnectionUpdate } from "../composables/useNetworkMonitor";
import { useAuthStore } from "../stores/auth";
import { toast } from "../notifications/toast";
import LivePagination from "../components/LivePagination.vue";
import LiveQueryState from "../components/LiveQueryState.vue";
import TechnicalStatus from "../components/TechnicalStatus.vue";
import NetworkMonitorStatus from "../components/NetworkMonitorStatus.vue";
import NetworkLoginDialog from "../components/NetworkLoginDialog.vue";
import RecordQuickLink from "../components/RecordQuickLink.vue";
const route = useRoute(),
  router = useRouter(),
  auth = useAuthStore();
function routeFilters() {
  return {
    registration: String(route.query.registration ?? "active"),
    connection: String(route.query.connection ?? "all"),
    searchBy: String(route.query.searchBy ?? "login"),
    search: String(route.query.search ?? ""),
    cityId: String(route.query.cityId ?? ""),
    branchId: String(route.query.branchId ?? ""),
  };
}
const form = reactive(routeFilters()),
  applied = ref({ ...form }),
  page = ref(1),
  limit = ref(10),
  selected = ref<NetworkLoginRow | null>(null);
const params = computed(() => {
  const p = new URLSearchParams({ ...applied.value, page: String(page.value), limit: String(limit.value) });
  if (!p.get("cityId")) p.delete("cityId");
  if (!p.get("branchId")) p.delete("branchId");
  return p;
});
const { data, loading, error, reload, refreshInBackground } = useLiveQuery((signal) => networkApi.list(params.value, signal));
const filters = useLiveQuery((signal) => networkApi.listFilters(signal));
const monitor = useNetworkMonitor({
  scope: () => (data.value?.items.length ? { scope: "login-list", loginIds: data.value.items.map((row) => row.id) } : null),
  enabled: () => !selected.value && !loading.value && !error.value,
  refresh: refreshInBackground,
  connections: (updates) => {
    if (data.value)
      data.value = {
        ...data.value,
        items: data.value.items.map((row) => {
          const update = updates.find((item) => item.id === row.id);
          return update ? applyConnectionUpdate(row, update) : row;
        }),
      };
  },
  offline: (events, total) => {
    const names = events.slice(0, 3).map((event) => data.value?.items.find((row) => row.id === event.id)?.login ?? `Login #${event.id}`);
    toast.show({
      type: "warning",
      title: total === 1 ? "Login ficou offline" : `${total} logins ficaram offline`,
      message: names.join(", "),
      key: "network-list-offline",
      duration: 10000,
      actions: [
        {
          label: "Ver offline",
          onClick: () => {
            form.connection = "offline";
            apply();
          },
        },
      ],
    });
  },
});
watch([page, limit], reload);
watch(
  () => route.query,
  () => {
    Object.assign(form, routeFilters());
    applied.value = { ...form };
    if (page.value !== 1) page.value = 1;
    else void reload();
  }
);
watch(
  () => auth.can("network.logins.view"),
  (allowed) => {
    if (!allowed) selected.value = null;
  }
);
watch(selected, (value, previous) => {
  if (!value && previous) void refreshInBackground();
});
function apply() {
  const q = { ...form, search: form.search.trim() };
  if (Object.entries(q).every(([key, value]) => routeFilters()[key as keyof typeof q] === value)) void reload();
  else void router.replace({ query: Object.fromEntries(Object.entries(q).filter(([, value]) => value !== "")) });
}
function clear() {
  Object.assign(form, { registration: "active", connection: "all", searchBy: "login", search: "", cityId: "", branchId: "" });
  apply();
}
function open(row: NetworkLoginRow) {
  if (auth.can("network.logins.view")) selected.value = row;
}
</script>
<template>
  <div class="compact-view">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em] network-text">Acessos e conexões</p>
        <h1 class="text-2xl font-extrabold tracking-tight"><Network class="mr-2 inline h-5 w-5" aria-hidden="true" />Logins</h1>
        <p class="mt-1 text-xs text-slate-500">Consulte os logins diretamente no IXC e acompanhe as desconexões da página em tempo real.</p>
      </div>
      <NetworkMonitorStatus :state="monitor.state.value" :checked-at="monitor.checkedAt.value" :message="monitor.message.value" />
    </div>
    <div v-if="data" class="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
      <button
        v-for="card in [
          { label: 'Logins encontrados', value: data.total, icon: Network, connection: 'all', registration: form.registration },
          { label: 'Cadastro ativo', value: data.summary.activeLogins, icon: Users, connection: form.connection, registration: 'active' },
          { label: 'Online', value: data.summary.onlineLogins, icon: Wifi, connection: 'online', registration: form.registration },
          { label: 'Offline', value: data.summary.offlineLogins, icon: WifiOff, connection: 'offline', registration: form.registration },
        ]"
        :key="card.label"
        type="button"
        class="panel flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
        @click="
          form.connection = card.connection;
          form.registration = card.registration;
          apply();
        "
      >
        <component :is="card.icon" class="h-4 w-4 network-text" aria-hidden="true" /><span class="text-[11px] text-slate-500">{{
          card.label
        }}</span
        ><strong class="ml-auto text-lg">{{ card.value.toLocaleString("pt-BR") }}</strong>
      </button>
    </div>
    <section class="panel overflow-hidden">
      <div class="border-b border-slate-100 px-4 py-3">
        <h2 class="mb-2 text-sm font-bold">
          <Network class="mr-2 inline h-4 w-4 network-text" aria-hidden="true" />Lista de logins
          <span v-if="data" class="ml-1 text-[11px] font-normal text-slate-500">{{ data.total.toLocaleString("pt-BR") }} encontrados</span>
        </h2>
        <form class="network-controls flex flex-wrap items-center gap-2" @submit.prevent="apply">
          <label class="sr-only" for="login-registration">Cadastro do login</label
          ><select id="login-registration" v-model="form.registration" class="input !w-auto" @change="apply">
            <option value="active">Logins ativos</option>
            <option value="inactive">Logins inativos</option>
            <option value="all">Todos os cadastros</option>
          </select>
          <label class="sr-only" for="login-connection">Conexão</label
          ><select id="login-connection" v-model="form.connection" class="input !w-auto" @change="apply">
            <option value="all">Todas as conexões</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
          <label class="sr-only" for="login-city">Cidade</label
          ><select id="login-city" v-model="form.cityId" class="input !w-auto max-w-48" @change="apply">
            <option value="">Todas as cidades</option>
            <option v-for="city in filters.data.value?.cities ?? []" :key="city.id" :value="String(city.id)">{{ city.name }}</option>
          </select>
          <label class="sr-only" for="login-branch">Filial</label
          ><select id="login-branch" v-model="form.branchId" class="input !w-auto max-w-48" @change="apply">
            <option value="">Todas as filiais</option>
            <option v-for="branch in filters.data.value?.branches ?? []" :key="branch.id" :value="String(branch.id)">
              {{ branch.name }}
            </option>
          </select>
          <label class="sr-only" for="login-search-by">Buscar por</label
          ><select id="login-search-by" v-model="form.searchBy" class="input !w-auto">
            <option value="login">Login</option>
            <option value="box">Caixa FTTH (nome ou ID)</option>
            <option value="document">CPF / CNPJ</option>
            <option value="customer">Nome do cliente</option>
            <option value="contractId">ID do contrato</option>
            <option value="loginId">ID do login</option>
            <option value="city">Cidade</option>
            <option value="branch">Filial</option>
          </select>
          <label class="sr-only" for="login-search">Busca de logins</label
          ><input
            id="login-search"
            v-model="form.search"
            class="input min-w-40 flex-1"
            :placeholder="form.searchBy === 'document' ? 'CPF ou CNPJ completo' : 'Digite sua busca'"
            maxlength="120"
          />
          <button type="submit" class="button-primary"><Search class="h-3.5 w-3.5" aria-hidden="true" />Buscar</button
          ><button type="button" class="button-secondary" @click="clear"><RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />Limpar</button>
        </form>
        <p v-if="filters.error.value" class="mt-2 text-[11px] text-amber-700" role="alert">
          Não foi possível carregar cidades e filiais.
          <button type="button" class="underline" @click="filters.reload">Tentar novamente</button>
        </p>
      </div>
      <LiveQueryState :loading="loading" :error="error" @retry="reload" />
      <template v-if="data && !loading && !error">
        <div class="overflow-x-auto">
          <table class="compact-table min-w-[950px]">
            <thead>
              <tr>
                <th scope="col">Login / ID</th>
                <th scope="col">Cliente</th>
                <th scope="col">Cadastro / conexão</th>
                <th scope="col">Caixa / porta</th>
                <th scope="col">Cidade / filial</th>
                <th scope="col">IP / MAC</th>
                <th scope="col">Contrato</th>
                <th v-if="auth.can('network.logins.view')" scope="col"><span class="sr-only">Detalhes do login</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="row in data.items"
                :key="row.id"
                :class="auth.can('network.logins.view') ? 'cursor-pointer hover:bg-slate-50' : ''"
                @click="open(row)"
              >
                <td class="max-w-56">
                  <button
                    v-if="auth.can('network.logins.view')"
                    type="button"
                    class="block truncate font-semibold text-left hover:underline"
                    :title="row.login ?? undefined"
                    :aria-label="`Ver detalhes do login #${row.id}`"
                    @click.stop="open(row)"
                  >
                    {{ row.login ?? "Sem login" }}</button
                  ><strong v-else class="block truncate">{{ row.login ?? "Sem login" }}</strong
                  ><span class="compact-secondary">Login #{{ row.id }}</span>
                </td>
                <td class="max-w-56">
                  <RouterLink
                    v-if="row.customerId && auth.can('support.customer.view')"
                    :to="`/support/customers/${row.customerId}`"
                    class="block truncate hover:underline"
                    @click.stop
                    >{{ row.customerName ?? `Cliente #${row.customerId}` }}</RouterLink
                  ><span v-else class="block truncate">{{ row.customerName ?? "Sem cliente" }}</span
                  ><span class="compact-secondary">{{
                    row.customerDocument ?? (row.customerId ? `Cliente #${row.customerId}` : "Sem documento")
                  }}</span>
                </td>
                <td>
                  <div class="flex flex-wrap gap-1">
                    <TechnicalStatus
                      :label="row.active === true ? 'Ativo' : row.active === false ? 'Inativo' : 'Sem cadastro'"
                      :tone="row.active === true ? 'success' : 'neutral'"
                    /><TechnicalStatus
                      :label="row.status === 'online' ? 'Online' : 'Offline'"
                      :tone="row.status === 'online' ? 'success' : 'danger'"
                      connection
                    />
                  </div>
                </td>
                <td class="max-w-48">
                  <RecordQuickLink
                    v-if="row.ftthBoxId"
                    :target="{ kind: 'box', id: row.ftthBoxId, name: row.ftthBoxName ?? undefined }"
                    :label="row.ftthBoxName ?? `Caixa #${row.ftthBoxId}`"
                  /><span v-if="!row.ftthBoxId || !auth.can('network.boxes.view')" class="block truncate">{{
                    row.ftthBoxName ?? (row.ftthBoxId ? `Caixa #${row.ftthBoxId}` : "Sem caixa vinculada")
                  }}</span
                  ><span class="compact-secondary"
                    >Porta {{ row.port ?? "—" }}{{ row.ftthBoxId && row.ftthBoxSource === "onu" ? " · Vínculo pela ONU" : "" }}</span
                  >
                </td>
                <td class="max-w-48">
                  <span class="block truncate">{{ row.city ?? "Cidade não informada" }}</span
                  ><span class="compact-secondary truncate">{{ row.branch ?? "Filial não informada" }}</span>
                </td>
                <td class="font-mono text-[11px]">
                  {{ row.ip ?? "Sem IP" }}<span class="compact-secondary">{{ row.mac ?? "Sem MAC" }}</span>
                </td>
                <td>
                  <RecordQuickLink
                    v-if="row.contractId"
                    :target="{ kind: 'contract', id: row.contractId, module: auth.can('support.contract.view') ? 'support' : 'upgrades' }"
                    :label="`#${row.contractId}`"
                  /><span v-if="!row.contractId || (!auth.can('support.contract.view') && !auth.can('upgrades.contract.view'))">{{
                    row.contractId ? `#${row.contractId}` : "Sem contrato válido"
                  }}</span>
                </td>
                <td v-if="auth.can('network.logins.view')">
                  <button type="button" class="network-text whitespace-nowrap text-xs hover:underline" @click.stop="open(row)">
                    Ver detalhes <ArrowUpRight class="inline h-3 w-3" aria-hidden="true" />
                  </button>
                </td>
              </tr>
              <tr v-if="!data.items.length">
                <td :colspan="auth.can('network.logins.view') ? 8 : 7" class="!py-8 text-center text-slate-500">
                  Nenhum login encontrado para estes filtros.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <LivePagination v-model:page="page" v-model:limit="limit" :total="data.total" :queried-at="data.queriedAt" />
      </template>
    </section>
    <p class="mt-3 text-[11px] text-slate-500">
      Os indicadores respeitam os filtros. Monitor de 1 segundo apenas nos logins desta página; ao abrir um detalhe, acompanha somente esse
      login. Pausa com a janela oculta. Leitura do IP cadastrado no IXC, sem testar o equipamento ou alterar dados.
    </p>
    <NetworkLoginDialog v-if="selected && auth.can('network.logins.view')" :key="selected.id" :login="selected" @close="selected = null" />
  </div>
</template>
