<script setup lang="ts">
import { ArrowUpRight } from "lucide-vue-next";
import { useRouter } from "vue-router";
import type { Customer } from "../api";
import RiskBadge from "./RiskBadge.vue";

defineProps<{ customers: Customer[]; canViewDetails: boolean; emptyMessage: string }>();
const router = useRouter();
const target = (customer: Customer) => ({
  path: `/customers/${customer.customer_id}`,
  query: { contractId: String(customer.contract_id) },
});
const scoreColor = (value: number, max: number) => {
  const ratio = value / max;
  if (ratio >= 0.7) return "bg-red-50 text-red-700 ring-red-100";
  if (ratio >= 0.4) return "bg-orange-50 text-orange-700 ring-orange-100";
  if (ratio > 0) return "bg-amber-50 text-amber-700 ring-amber-100";
  return "bg-emerald-50 text-emerald-700 ring-emerald-100";
};
</script>
<template>
  <div class="relative overflow-x-auto">
    <table class="compact-table min-w-[1040px]">
      <thead>
        <tr>
          <th class="!pl-4">Cliente / contrato</th>
          <th>Score / nível</th>
          <th>Localidade</th>
          <th>Plano</th>
          <th>Financeiro</th>
          <th>Suporte</th>
          <th>Conexão</th>
          <th>Atualizado</th>
          <th class="!pr-4"><span class="sr-only">Ações do cliente</span></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        <tr
          v-for="customer in customers"
          :key="customer.contract_id"
          :class="canViewDetails ? 'cursor-pointer hover:bg-cyan-50/40' : ''"
          @click="canViewDetails && router.push(target(customer))"
        >
          <td class="max-w-64 !pl-4">
            <RouterLink
              v-if="canViewDetails"
              :to="target(customer)"
              :title="customer.name"
              class="block truncate font-semibold hover:text-cyan-700 hover:underline"
              @click.stop
              >{{ customer.name }}</RouterLink
            ><strong v-else class="block truncate font-semibold" :title="customer.name">{{ customer.name }}</strong>
            <div class="compact-secondary flex items-center gap-1.5 whitespace-nowrap">
              <span>#{{ customer.customer_id }} · Contrato #{{ customer.contract_id }}</span
              ><span v-if="customer.workflow_status === 'RESOLVED'" class="text-emerald-700">Resolvido</span
              ><span v-if="customer.attention_critical" class="text-red-700">Crítico manual</span>
            </div>
          </td>
          <td class="whitespace-nowrap">
            <div class="flex items-center gap-2">
              <span
                ><strong class="text-base font-extrabold">{{ customer.score }}</strong
                ><span class="text-[10px] text-slate-400">/100</span></span
              ><RiskBadge :level="customer.risk_level" />
            </div>
          </td>
          <td class="max-w-40">
            <span class="block truncate" :title="customer.city ?? ''">{{ customer.city ?? "—" }}</span
            ><span v-if="customer.neighborhood" class="compact-secondary truncate" :title="customer.neighborhood">{{
              customer.neighborhood
            }}</span>
          </td>
          <td class="max-w-48">
            <span class="block truncate" :title="customer.plan_name ?? ''">{{ customer.plan_name ?? "—" }}</span>
          </td>
          <td>
            <span class="rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1" :class="scoreColor(customer.financial_score, 30)"
              >{{ customer.financial_score }}/30</span
            >
          </td>
          <td>
            <span class="rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1" :class="scoreColor(customer.support_score, 25)"
              >{{ customer.support_score }}/25</span
            >
          </td>
          <td>
            <span class="rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1" :class="scoreColor(customer.network_score, 25)"
              >{{ customer.network_score }}/25</span
            >
          </td>
          <td class="whitespace-nowrap text-[10px] text-slate-500">{{ new Date(customer.calculated_at).toLocaleDateString("pt-BR") }}</td>
          <td class="!pr-4">
            <div class="flex items-center justify-end gap-2 whitespace-nowrap">
              <slot name="actions" :customer="customer" /><RouterLink
                v-if="canViewDetails"
                :to="target(customer)"
                :aria-label="`Ver contrato ${customer.contract_id} de ${customer.name}`"
                title="Ver contrato"
                class="rounded p-1 text-cyan-700 hover:bg-cyan-100"
                @click.stop
                ><ArrowUpRight class="h-4 w-4" aria-hidden="true" focusable="false"
              /></RouterLink>
            </div>
          </td>
        </tr>
        <tr v-if="!customers.length">
          <td colspan="9" class="!px-4 !py-10 text-center text-slate-500">{{ emptyMessage }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
