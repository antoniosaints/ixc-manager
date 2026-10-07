<script setup lang="ts">
import { useAuthStore } from "../stores/auth";
const auth = useAuthStore();
import { computed, ref } from "vue";
import { ArrowUpRight, PackageOpen, Search, ChevronLeft } from "lucide-vue-next";
import { useLiveQuery } from "../composables/useLiveQuery";
import { upgradesApi, formatConsulted } from "../upgradesApi";
import LiveQueryState from "../components/LiveQueryState.vue";
const search = ref("");
const appliedSearch = ref("");
const page = ref(1);
const limit = ref("10");
const { data, loading, error, reload } = useLiveQuery((signal) =>
  upgradesApi.plans(new URLSearchParams({ search: appliedSearch.value, page: String(page.value), limit: limit.value }), signal)
);
const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / Number(limit.value))));
const apply = () => {
  appliedSearch.value = search.value.trim();
  page.value = 1;
  void reload();
};
const changePage = (next: number) => {
  page.value = Math.max(1, Math.min(next, totalPages.value));
  void reload();
};
const money = (value: number | null) =>
  value === null ? "Não informado" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
</script>
<template>
  <div class="compact-view">
    <section class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-violet-600">Catálogo comercial</p>
        <h1 class="text-2xl font-extrabold tracking-tight">
          <PackageOpen class="mr-2 inline h-5 w-5 align-middle" aria-hidden="true" focusable="false" />Planos disponíveis
        </h1>
        <p class="mt-1 text-xs text-slate-500">Consulte os planos de venda ativos no IXC e encontre contratos para uma nova oferta.</p>
      </div>
      <span
        class="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700"
        ><span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>Consulta direta ao IXC</span
      >
    </section>
    <section class="panel overflow-hidden">
      <div class="relative flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 class="flex items-center gap-2 text-sm font-bold">
          <PackageOpen class="h-4 w-4 text-violet-500" aria-hidden="true" focusable="false" />{{
            data ? `${data.total.toLocaleString("pt-BR")} planos ativos` : "Planos ativos"
          }}
        </h2>
        <form class="flex w-full gap-2 sm:w-auto" @submit.prevent="apply">
          <label class="sr-only" for="plan-search">Buscar plano</label
          ><input id="plan-search" v-model="search" class="input min-w-0 sm:w-72" placeholder="Buscar pelo nome do plano" /><button
            type="submit"
            class="button-upgrades"
          >
            <Search class="h-4 w-4" aria-hidden="true" focusable="false" /><span class="sr-only">Buscar</span>
          </button>
        </form>
      </div>
      <LiveQueryState :loading="loading" :error="error" @retry="reload" />
      <div v-if="data && !loading && !error" class="relative overflow-x-auto">
        <table class="compact-table min-w-[620px]">
          <thead class="bg-slate-50">
            <tr>
              <th class="!pl-4">Plano</th>
              <th>Valor cadastrado</th>
              <th>Fidelidade</th>
              <th>Filial</th>
              <th v-if="auth.can('upgrades.opportunities.view')" class="!pr-4"><span class="sr-only">Oportunidades</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="plan in data.items" :key="plan.id" class="hover:bg-violet-50/30">
              <td class="max-w-sm !pl-4">
                <strong class="block truncate font-semibold" :title="plan.name">{{ plan.name }}</strong>
                <p class="compact-secondary truncate" :title="plan.description ?? undefined">
                  Plano #{{ plan.id }}<span v-if="plan.description"> · {{ plan.description }}</span>
                </p>
              </td>
              <td class="whitespace-nowrap font-medium">{{ money(plan.value) }}</td>
              <td>{{ plan.fidelityMonths !== null ? `${plan.fidelityMonths} meses` : "Não informada" }}</td>
              <td>{{ plan.branchId ? `#${plan.branchId}` : "Não informada" }}</td>
              <td v-if="auth.can('upgrades.opportunities.view')" class="!pr-4">
                <RouterLink
                  v-if="auth.can('upgrades.opportunities.view')"
                  :to="{ path: '/upgrades', query: { planId: plan.id, planName: plan.name } }"
                  :aria-label="`Ver oportunidades do plano ${plan.name}, ID ${plan.id}`"
                  class="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-violet-700 hover:underline"
                  >Ver oportunidades<ArrowUpRight class="h-4 w-4" aria-hidden="true" focusable="false"
                /></RouterLink>
              </td>
            </tr>
            <tr v-if="!data.items.length">
              <td :colspan="auth.can('upgrades.opportunities.view') ? 5 : 4" class="!px-4 !py-10 text-center text-slate-500">
                Nenhum plano ativo encontrado para esta busca.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        class="relative flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500"
      >
        <span>{{ data ? `Consultado em ${formatConsulted(data.queriedAt)} · Brasília` : "Consultas em tempo real" }}</span>
        <div class="flex flex-wrap items-center gap-2">
          <label class="sr-only" for="plans-limit">Registros por página</label
          ><select
            id="plans-limit"
            v-model="limit"
            class="rounded-lg border border-slate-200 bg-white px-2 py-1"
            @change="
              page = 1;
              reload();
            "
          >
            <option value="10">10 por página</option>
            <option value="25">25 por página</option></select
          ><span v-if="data">{{ page }} / {{ totalPages }}</span
          ><button
            class="button-secondary !px-3 !py-1.5 !text-xs"
            type="button"
            :disabled="loading || page <= 1"
            @click="changePage(page - 1)"
          >
            <ChevronLeft class="inline h-3.5 w-3.5 shrink-0 align-middle" aria-hidden="true" focusable="false" /> Anterior</button
          ><button
            class="button-secondary !px-3 !py-1.5 !text-xs"
            type="button"
            :disabled="loading || !data || page >= totalPages"
            @click="changePage(page + 1)"
          >
            Próxima
          </button>
        </div>
      </div>
    </section>
    <p class="mt-3 text-[10px] leading-relaxed text-slate-500">
      O valor exibido é o cadastrado no plano de venda. Confira a composição de produtos, descontos e condições comerciais no IXC antes de
      definir a oferta.
    </p>
  </div>
</template>
