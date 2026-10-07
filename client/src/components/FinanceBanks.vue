<script setup lang="ts">
import { watch } from "vue";
import { Landmark, Info, RefreshCw } from "lucide-vue-next";
import { financeBanks } from "../financeApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import LiveQueryState from "./LiveQueryState.vue";
import { formatConsulted } from "../upgradesApi";
const props = defineProps<{ params: URLSearchParams; period: { from: string; to: string } }>();
const { data, loading, error, reload } = useLiveQuery((signal) => financeBanks(props.params, signal));
watch(
  () => props.params,
  () => {
    void reload();
  }
);
const money = (value: number | null) => (value === null ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
</script>
<template>
  <div class="px-4 py-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-sm font-bold"><Landmark class="mr-1.5 inline h-4 w-4" aria-hidden="true" />Caixa e bancos</h2>
      <button type="button" class="button-secondary" :disabled="loading" @click="reload">
        <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Atualizar saldos
      </button>
    </div>
    <p class="mt-1 text-[11px] text-slate-500">
      Saldo calculado antes de {{ date(period.from) }} e ao fim de {{ date(period.to) }}. Inclui transferências entre contas; considera
      todos os regimes.
    </p>
  </div>
  <LiveQueryState :loading="loading" :error="error" @retry="reload" />
  <template v-if="data && !loading && !error">
    <p
      v-for="warning in data.warnings"
      :key="warning"
      role="alert"
      class="mx-4 mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"
    >
      {{ warning }}
    </p>
    <div class="overflow-x-auto">
      <table class="compact-table min-w-[860px]">
        <thead>
          <tr>
            <th scope="col" class="!pl-4">Caixa / banco</th>
            <th scope="col" class="text-right">Saldo inicial</th>
            <th scope="col" class="text-right">Saldo na criação</th>
            <th scope="col" class="text-right">Entradas</th>
            <th scope="col" class="text-right">Saídas</th>
            <th scope="col" class="!pr-4 text-right">Saldo final calculado</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="account in data.accounts" :key="account.id" class="hover:bg-slate-50">
            <td class="max-w-72 !pl-4">
              <strong class="block truncate font-semibold" :title="account.name">{{ account.name }}</strong
              ><span class="compact-secondary"
                >#{{ account.id }} · Conta contábil #{{ account.accountId }}{{ account.active ? "" : " · Inativa" }}</span
              ><span v-if="account.reason" class="mt-1 block text-[10px] text-amber-700">{{ account.reason }}</span>
            </td>
            <td class="whitespace-nowrap text-right">{{ money(account.opening) }}</td>
            <td class="whitespace-nowrap text-right">{{ money(account.openingAdjustment) }}</td>
            <td class="whitespace-nowrap text-right">{{ money(account.inflow) }}</td>
            <td class="whitespace-nowrap text-right">{{ money(account.outflow) }}</td>
            <td class="!pr-4 whitespace-nowrap text-right font-semibold">{{ money(account.closing) }}</td>
          </tr>
          <tr v-if="!data.accounts.length">
            <td colspan="6" class="!py-6 text-center text-slate-500">Nenhum saldo disponível para os filtros selecionados.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500">
      <p class="flex items-start gap-1.5">
        <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Calculado pelo saldo de abertura cadastrado e pelos lançamentos desde
        a abertura. Aberturas ocorridas dentro do período ficam na coluna Saldo na criação. Valores sujeitos à conferência no IXC; não
        representam o saldo confirmado pela instituição bancária.
      </p>
      <p class="mt-1">Consultado em {{ formatConsulted(data.queriedAt) }} · Brasília</p>
    </div>
  </template>
</template>
