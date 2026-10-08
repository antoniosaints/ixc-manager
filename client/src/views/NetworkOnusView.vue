<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Cable, Search, RefreshCw, ShieldCheck, List } from "lucide-vue-next";
import { onuApi, type PendingOnu } from "../onuApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import { useAuthStore } from "../stores/auth";
import LiveQueryState from "../components/LiveQueryState.vue";
import LivePagination from "../components/LivePagination.vue";
import TechnicalStatus from "../components/TechnicalStatus.vue";
import OnuOperationDialog from "../components/OnuOperationDialog.vue";
import OnuDetailsDialog from "../components/OnuDetailsDialog.vue";
const auth = useAuthStore(),
  route = useRoute(),
  router = useRouter();
const tab = ref(route.query.tab === "registered" ? "registered" : "pending"),
  olt = ref(String(route.query.oltId ?? "")),
  search = ref(String(route.query.search ?? "")),
  status = ref(String(route.query.status ?? "all"));
const applied = ref({ olt: olt.value, search: search.value, status: status.value }),
  page = ref(1),
  limit = ref(10),
  selectedPending = ref<PendingOnu | null>(null),
  selectedId = ref<number | null>(null);
const options = useLiveQuery((signal) => onuApi.options(undefined, signal));
const params = computed(
  () =>
    new URLSearchParams({
      page: String(page.value),
      limit: String(limit.value),
      search: applied.value.search,
      status: applied.value.status,
      ...(applied.value.olt ? { oltId: applied.value.olt } : {}),
    })
);
const pending = useLiveQuery((signal) => (tab.value === "pending" ? onuApi.pending(params.value, signal) : Promise.resolve(null)));
const registered = useLiveQuery((signal) => (tab.value === "registered" ? onuApi.registered(params.value, signal) : Promise.resolve(null)));
const query = computed(() => (tab.value === "pending" ? pending : registered));
const data = computed(() => query.value.data.value),
  loading = computed(() => query.value.loading.value),
  error = computed(() => query.value.error.value);
watch([tab, page, limit], () => {
  void pending.reload();
  void registered.reload();
});
watch(
  () => auth.can("network.equipment.authorize"),
  (allowed) => {
    if (!allowed) selectedPending.value = null;
  }
);
watch(
  () => auth.can("network.onus.view"),
  (allowed) => {
    if (!allowed) {
      selectedPending.value = null;
      selectedId.value = null;
      void router.replace(auth.home);
    }
  }
);
watch(
  () => route.query,
  () => {
    const nextTab = route.query.tab === "registered" ? "registered" : "pending";
    const next = {
      olt: String(route.query.oltId ?? ""),
      search: String(route.query.search ?? ""),
      status: String(route.query.status ?? "all"),
    };
    if (nextTab === tab.value && JSON.stringify(next) === JSON.stringify(applied.value)) return;
    tab.value = nextTab;
    olt.value = next.olt;
    search.value = next.search;
    status.value = next.status;
    applied.value = next;
    if (page.value !== 1) page.value = 1;
    else void query.value.reload();
  }
);
async function apply() {
  applied.value = { olt: olt.value, search: search.value.trim(), status: status.value };
  await router.replace({
    query: {
      tab: tab.value,
      ...(olt.value ? { oltId: olt.value } : {}),
      ...(applied.value.search ? { search: applied.value.search } : {}),
      ...(tab.value === "registered" ? { status: status.value } : {}),
    },
  });
  if (page.value !== 1) page.value = 1;
  else void query.value.reload();
}
function changeTab(value: string) {
  tab.value = value;
  page.value = 1;
  void apply();
}
function tabKeyboard(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === "Home" ? "pending" : event.key === "End" ? "registered" : tab.value === "pending" ? "registered" : "pending";
  changeTab(next);
  document.getElementById(`onus-${next}-tab`)?.focus();
}
function changed() {
  void query.value.reload();
}
</script>
<template>
  <div class="compact-view">
    <div class="mb-4">
      <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em] network-text">Equipamentos de fibra</p>
      <h1 class="text-2xl font-extrabold">
        <Cable class="mr-2 inline h-5 w-5" aria-hidden="true" />ONUs
        <span v-if="data && !loading && !error" class="ml-2 text-xs font-normal text-slate-500"
          >{{ data.total.toLocaleString("pt-BR") }} {{ tab === "pending" ? "pendentes" : "cadastros encontrados" }}</span
        >
      </h1>
      <p class="mt-1 text-xs text-slate-500">Consulte as pendências por OLT e confira os equipamentos cadastrados no IXC.</p>
    </div>
    <section class="panel overflow-hidden">
      <div class="border-b border-slate-100 px-4 py-3">
        <div class="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Listas de ONUs" @keydown="tabKeyboard">
          <button
            id="onus-pending-tab"
            class="button-secondary"
            :class="{ 'network-nav-active': tab === 'pending' }"
            type="button"
            role="tab"
            :aria-selected="tab === 'pending'"
            :tabindex="tab === 'pending' ? 0 : -1"
            aria-controls="onus-list"
            @click="changeTab('pending')"
          >
            <ShieldCheck class="h-3.5 w-3.5" aria-hidden="true" />Não autorizadas na OLT</button
          ><button
            id="onus-registered-tab"
            class="button-secondary"
            :class="{ 'network-nav-active': tab === 'registered' }"
            type="button"
            role="tab"
            :aria-selected="tab === 'registered'"
            :tabindex="tab === 'registered' ? 0 : -1"
            aria-controls="onus-list"
            @click="changeTab('registered')"
          >
            <List class="h-3.5 w-3.5" aria-hidden="true" />Cadastros de ONUs
          </button>
        </div>
        <form class="network-controls flex flex-wrap gap-2" @submit.prevent="apply">
          <label class="sr-only" for="onu-olt">OLT</label
          ><select id="onu-olt" v-model="olt" class="input !w-auto max-w-72" @change="apply">
            <option value="">Todas as OLTs</option>
            <option v-for="o in options.data.value?.olts" :key="o.id" :value="String(o.id)">{{ o.name }}</option></select
          ><template v-if="tab === 'registered'"
            ><label class="sr-only" for="onu-status">Autorização cadastrada</label
            ><select id="onu-status" v-model="status" class="input !w-auto" @change="apply">
              <option value="all">Todas as autorizações</option>
              <option value="A">Autorizadas</option>
              <option value="NA">Não autorizadas</option>
            </select></template
          ><label class="sr-only" for="onu-search">Buscar ONU</label
          ><input
            id="onu-search"
            v-model="search"
            class="input min-w-48 flex-1"
            :placeholder="tab === 'pending' ? 'MAC / serial, modelo ou PON' : 'Nome, MAC / serial ou login'"
            maxlength="100"
          /><button class="button-primary" type="submit"><Search class="h-3.5 w-3.5" aria-hidden="true" />Buscar</button
          ><button class="button-secondary" type="button" :disabled="loading" @click="query.reload">
            <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Atualizar lista
          </button>
        </form>
        <p class="mt-2 text-[11px] text-slate-500">
          {{
            tab === "pending"
              ? "Pendências informadas pelo IXC. Atualizar lista apenas consulta os dados."
              : "Autorização conforme o cadastro do IXC; o estado da conexão é consultado pelo login."
          }}<span v-if="!auth.can('network.equipment.authorize')"> Seu acesso permite apenas consulta.</span>
        </p>
        <p v-if="options.error.value" class="mt-2 text-xs text-red-600" role="alert">
          {{ options.error.value }} <button type="button" class="underline" @click="options.reload">Tentar novamente</button>
        </p>
      </div>
      <div id="onus-list" role="tabpanel" :aria-labelledby="tab === 'pending' ? 'onus-pending-tab' : 'onus-registered-tab'">
        <LiveQueryState :loading="loading" :error="error" @retry="query.reload" />
        <template v-if="data && !loading && !error">
          <div class="overflow-x-auto">
            <table class="compact-table min-w-[800px]">
              <thead>
                <tr>
                  <th scope="col">MAC / serial</th>
                  <th scope="col">OLT</th>
                  <th scope="col">PON</th>
                  <th scope="col">{{ tab === "pending" ? "Modelo" : "Login / cadastro" }}</th>
                  <th scope="col"><span class="sr-only">Ações da ONU</span></th>
                </tr>
              </thead>
              <tbody v-if="tab === 'pending'" class="divide-y divide-slate-100">
                <tr v-for="row in pending.data.value?.items ?? []" :key="row.pendingId" class="hover:bg-slate-50">
                  <td class="font-mono text-xs font-semibold">{{ row.serial }}</td>
                  <td>
                    {{ row.oltName }}<span class="block text-[10px] text-slate-500">OLT #{{ row.oltId }}</span>
                  </td>
                  <td>
                    {{ row.pon
                    }}<span class="block text-[10px] text-slate-500"
                      >Chassi {{ row.chassis }} · Slot {{ row.slot }} · PON {{ row.ponNumber }}</span
                    >
                  </td>
                  <td>{{ row.model || "Não informado" }}</td>
                  <td class="text-right">
                    <button
                      v-if="auth.can('network.equipment.authorize')"
                      type="button"
                      class="button-secondary"
                      :disabled="!row.canAuthorize"
                      @click="selectedPending = row"
                    >
                      <ShieldCheck class="h-3.5 w-3.5" aria-hidden="true" />Autorizar</button
                    ><span v-else class="text-[11px] text-slate-500">Consulta</span>
                  </td>
                </tr>
              </tbody>
              <tbody v-else class="divide-y divide-slate-100">
                <tr
                  v-for="row in registered.data.value?.items ?? []"
                  :key="row.id"
                  class="cursor-pointer hover:bg-slate-50"
                  @click="selectedId = row.id"
                >
                  <td>
                    <strong class="font-mono">{{ row.serial || "Sem serial" }}</strong
                    ><span class="block text-[10px] text-slate-500">ONU #{{ row.id }} · {{ row.name }}</span>
                  </td>
                  <td>{{ row.oltName || `OLT #${row.oltId}` }}</td>
                  <td>{{ row.pon || "—" }}</td>
                  <td>
                    <span class="mb-1 block text-xs">{{ row.login || "Sem login vinculado" }}</span
                    ><TechnicalStatus
                      :label="
                        row.authorization === 'A' ? 'Autorizada' : row.authorization === 'NA' ? 'Não autorizada' : 'Sem classificação'
                      "
                      :tone="row.authorization === 'A' ? 'success' : 'neutral'"
                    />
                  </td>
                  <td class="text-right">
                    <button class="record-quick-link" type="button" @click.stop="selectedId = row.id">Ver ONU #{{ row.id }}</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="!data.items.length" class="p-5 text-center text-xs text-slate-500">
            Nenhuma ONU encontrada para os filtros selecionados.
          </p>
          <LivePagination
            :total="data.total"
            :page="page"
            :limit="limit"
            :queried-at="data.queriedAt"
            @update:page="page = $event"
            @update:limit="limit = $event"
          />
        </template>
      </div>
    </section>
    <OnuOperationDialog
      v-if="selectedPending && auth.can('network.equipment.authorize')"
      action="authorize"
      :pending="selectedPending"
      @close="selectedPending = null"
      @changed="changed"
    />
    <OnuDetailsDialog v-if="selectedId" :onu-id="selectedId" @close="selectedId = null" @changed="changed" />
  </div>
</template>
