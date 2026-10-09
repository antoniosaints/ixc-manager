<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Cable, Network, Search, RotateCcw, ArrowUpRight, Wifi, WifiOff, CircleDashed, MapPin } from "lucide-vue-next";
import { networkApi, type NetworkBox } from "../networkApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import { useAuthStore } from "../stores/auth";
import LivePagination from "../components/LivePagination.vue";
import LiveQueryState from "../components/LiveQueryState.vue";
import TechnicalStatus from "../components/TechnicalStatus.vue";
import NetworkBoxDialog from "../components/NetworkBoxDialog.vue";
import NetworkBoxMapDialog from "../components/NetworkBoxMapDialog.vue";
const auth = useAuthStore(),
  route = useRoute(),
  router = useRouter();
const form = reactive({
  status: String(route.query.status ?? "active"),
  searchBy: String(route.query.searchBy ?? "name"),
  search: String(route.query.search ?? ""),
});
const applied = ref({ ...form }),
  page = ref(1),
  limit = ref(10),
  selectedBox = ref<NetworkBox | null>(null),
  mapBox = ref<NetworkBox | null>(null),
  connection = ref("all");
const params = computed(() => new URLSearchParams({ ...applied.value, page: String(page.value), limit: String(limit.value) }));
const { data, loading, error, reload, refreshInBackground } = useLiveQuery((signal) => networkApi.boxes(params.value, signal));
// The box dialog owns the live socket. Refresh this snapshot once when it closes.
watch(selectedBox, (box, previous) => {
  if (!box && previous) void refreshInBackground();
});
watch([page, limit], reload);
watch(
  () => route.query,
  () => {
    Object.assign(form, {
      status: String(route.query.status ?? "active"),
      searchBy: String(route.query.searchBy ?? "name"),
      search: String(route.query.search ?? ""),
    });
    applied.value = { ...form };
    if (page.value !== 1) page.value = 1;
    else void reload();
  }
);
watch(
  () => auth.can("network.logins.view"),
  (allowed) => {
    if (!allowed) selectedBox.value = null;
  }
);
watch(
  () => auth.can("network.boxes.view"),
  (allowed) => {
    if (!allowed) mapBox.value = null;
  }
);
function apply() {
  const query = { ...form, search: form.search.trim() };
  if (Object.entries(query).every(([k, v]) => String(route.query[k] ?? (k === "status" ? "active" : k === "searchBy" ? "name" : "")) === v))
    void reload();
  else void router.replace({ query });
}
function open(box: NetworkBox, status = "all") {
  if (!auth.can("network.logins.view")) return;
  mapBox.value = null;
  connection.value = status;
  selectedBox.value = box;
}
</script>
<template>
  <div class="compact-view">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em] network-text">Infraestrutura e conexões</p>
        <h1 class="text-2xl font-extrabold tracking-tight">
          <Network class="mr-2 inline h-5 w-5" aria-hidden="true" />Caixas de atendimento
        </h1>
        <p class="mt-1 text-xs text-slate-500">Localize a caixa e consulte os acessos vinculados para validar a rede.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500">Banco IXC · somente leitura</span>
      </div>
    </div>
    <div v-if="data && !loading && !error" class="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
      <section
        v-for="item in [
          { label: 'Caixas', value: data.summary.boxes, icon: Cable },
          { label: 'Logins ativos', value: data.summary.activeLogins, icon: Network },
          { label: 'Online', value: data.summary.onlineLogins, icon: Wifi },
          { label: 'Offline', value: data.summary.offlineLogins, icon: WifiOff },
          { label: 'Sem status', value: data.summary.unknownLogins, icon: CircleDashed },
        ]"
        :key="item.label"
        class="panel flex items-center gap-2 px-3 py-2"
      >
        <component :is="item.icon" class="h-4 w-4 network-text" aria-hidden="true" /><span class="text-[11px] text-slate-500">{{
          item.label
        }}</span
        ><strong class="ml-auto text-lg">{{ item.value.toLocaleString("pt-BR") }}</strong>
      </section>
    </div>
    <section class="panel overflow-hidden">
      <div class="border-b border-slate-100 px-4 py-3">
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <Cable class="h-4 w-4 network-text" aria-hidden="true" />
          <h2 class="text-sm font-bold">Caixas no IXC</h2>
          <span class="text-[11px] text-slate-500">{{
            data ? `${data.total.toLocaleString("pt-BR")} encontradas` : "Consulta de caixas"
          }}</span>
        </div>
        <form class="network-controls flex flex-wrap items-center gap-2" @submit.prevent="apply">
          <label class="sr-only" for="network-box-status">Status da caixa</label
          ><select id="network-box-status" v-model="form.status" class="input !w-auto" @change="apply">
            <option value="active">Caixas ativas</option>
            <option value="inactive">Caixas inativas</option>
            <option value="all">Todas as caixas</option></select
          ><label class="sr-only" for="network-box-search-by">Buscar caixa por</label
          ><select id="network-box-search-by" v-model="form.searchBy" class="input !w-auto">
            <option value="name">Nome da caixa</option>
            <option value="id">ID da caixa</option>
            <option value="address">Endereço / cidade</option>
            <template v-if="auth.can('network.logins.view')"
              ><option value="login">Login vinculado</option>
              <option value="ip">IP do login</option>
              <option value="customer">Cliente vinculado</option></template
            ></select
          ><label class="sr-only" for="network-box-search">Busca de caixas</label
          ><input
            id="network-box-search"
            v-model="form.search"
            class="input min-w-40 flex-1 sm:max-w-lg"
            :placeholder="form.searchBy === 'id' ? 'ID da caixa no IXC' : 'Digite sua busca'"
            maxlength="120"
          /><button type="submit" class="button-primary"><Search class="h-3.5 w-3.5" aria-hidden="true" />Buscar</button
          ><button
            type="button"
            class="button-secondary"
            @click="
              Object.assign(form, { status: 'active', searchBy: 'name', search: '' });
              apply();
            "
          >
            <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />Limpar
          </button>
        </form>
      </div>
      <LiveQueryState :loading="loading" :error="error" @retry="reload" />
      <template v-if="data && !loading && !error">
        <div class="overflow-x-auto">
          <table class="compact-table min-w-[850px]">
            <thead>
              <tr>
                <th scope="col" class="!pl-4">Caixa / ID</th>
                <th scope="col">Cadastro</th>
                <th scope="col">Localidade</th>
                <th scope="col">Portas</th>
                <th scope="col">Logins ativos</th>
                <th scope="col">Conexão dos ativos</th>
                <th scope="col"><span class="sr-only">Detalhes da caixa</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="box in data.items"
                :key="box.id"
                :class="auth.can('network.logins.view') ? 'cursor-pointer hover:bg-slate-50' : ''"
                @click="open(box)"
              >
                <td class="max-w-64 !pl-4">
                  <button
                    v-if="auth.can('network.logins.view')"
                    type="button"
                    class="block truncate text-left font-semibold hover:underline"
                    :title="box.name"
                    @click.stop="open(box)"
                  >
                    {{ box.name }}</button
                  ><strong v-else class="block truncate" :title="box.name">{{ box.name }}</strong
                  ><span class="compact-secondary">Caixa #{{ box.id }} · {{ box.totalLogins }} logins</span>
                </td>
                <td>
                  <TechnicalStatus
                    :label="box.active === true ? 'Ativa' : box.active === false ? 'Inativa' : 'Sem status'"
                    :tone="box.active === true ? 'success' : box.active === false ? 'danger' : 'neutral'"
                  />
                </td>
                <td class="max-w-56">
                  <span class="block truncate">{{ box.city ?? "Cidade não informada" }}</span
                  ><span class="compact-secondary truncate">{{ box.neighborhood ?? box.address ?? "Sem endereço" }}</span>
                </td>
                <td>
                  <span>{{ box.occupiedPorts }} / {{ box.capacity ?? "—" }}</span
                  ><span class="compact-secondary">{{
                    box.freePorts === null ? "Capacidade não informada" : `${box.freePorts} sem login ativo`
                  }}</span>
                </td>
                <td>
                  {{ box.activeLogins }}<span v-if="box.inactiveLogins" class="compact-secondary">{{ box.inactiveLogins }} inativos</span>
                </td>
                <td>
                  <div class="flex flex-wrap items-center gap-1">
                    <button
                      v-for="item in [
                        { key: 'online', label: 'Online', value: box.onlineLogins, tone: 'success' },
                        { key: 'offline', label: 'Offline', value: box.offlineLogins, tone: 'danger' },
                        { key: 'unknown', label: 'Sem status', value: box.unknownLogins, tone: 'neutral' },
                      ] as const"
                      :key="item.key"
                      type="button"
                      :disabled="!auth.can('network.logins.view')"
                      :aria-label="`${item.label} na caixa ${box.name}: ${item.value} logins`"
                      @click.stop="open(box, item.key)"
                    >
                      <TechnicalStatus :label="`${item.value} ${item.label}`" :tone="item.tone" />
                    </button>
                  </div>
                </td>
                <td>
                  <div class="flex items-center justify-end gap-3 whitespace-nowrap">
                    <button
                      v-if="auth.can('network.logins.view')"
                      type="button"
                      class="text-xs font-medium network-text hover:underline"
                      :aria-label="`Ver logins da caixa ${box.name}`"
                      @click.stop="open(box)"
                    >
                      Ver logins <ArrowUpRight class="inline h-3 w-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-xs font-medium network-text hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                      :disabled="!box.coordinates"
                      :title="box.coordinates ? 'Mostrar a localização da caixa' : 'Caixa sem coordenadas válidas cadastradas no IXC'"
                      :aria-label="`Ver no mapa a caixa ${box.name}${box.coordinates ? '' : ': coordenadas não cadastradas'}`"
                      @click.stop="mapBox = box"
                    >
                      <MapPin class="h-3.5 w-3.5" aria-hidden="true" />Ver no mapa
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="!data.items.length">
                <td colspan="7" class="!py-10 text-center text-slate-500">Nenhuma caixa encontrada para estes filtros.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <LivePagination v-model:page="page" v-model:limit="limit" :total="data.total" :queried-at="data.queriedAt" />
      </template>
    </section>
    <p class="mt-2 text-[10px] text-slate-500">
      Indicadores respeitam a busca e o status da caixa. Online, offline e sem status contam somente logins ativos. As consultas não alteram
      o IXC; manobras exigem revisão e permissão própria. Abra uma caixa para acompanhar as conexões a cada 1 segundo. O monitor pausa
      quando a aba fica oculta e para ao fechar o modal.
    </p>
    <NetworkBoxDialog
      v-if="selectedBox && auth.can('network.logins.view')"
      :key="selectedBox.id"
      :box-id="selectedBox.id"
      :box-name="selectedBox.name"
      :initial-connection="connection"
      @close="selectedBox = null"
    />
    <NetworkBoxMapDialog v-if="mapBox && auth.can('network.boxes.view')" :key="mapBox.id" :box="mapBox" @close="mapBox = null" />
  </div>
</template>
