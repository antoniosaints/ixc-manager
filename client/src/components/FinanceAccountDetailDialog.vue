<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Banknote, ArrowUpRight, Info, RefreshCw } from "lucide-vue-next";
import RecordDetailDialog from "./RecordDetailDialog.vue";
import LiveQueryState from "./LiveQueryState.vue";
import { useLiveQuery } from "../composables/useLiveQuery";
import { financeAccountDetail } from "../financeApi";
import { formatConsulted } from "../upgradesApi";
import { useAuthStore } from "../stores/auth";
const props = defineProps<{ account: { id: number; name: string; value: number }; params: URLSearchParams; basis: "result" | "ledger" }>();
const emit = defineEmits<{ close: [] }>();
const auth = useAuthStore();
const page = ref(1),
  limit = ref(10);
const query = computed(() => {
  const params = new URLSearchParams(props.params);
  params.set("accountId", String(props.account.id));
  params.set("basis", props.basis);
  params.set("page", String(page.value));
  params.set("limit", String(limit.value));
  return params;
});
const { data, loading, error, reload } = useLiveQuery((signal) => financeAccountDetail(query.value, signal));
watch(query, reload);
const pages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / limit.value)));
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null) => (value ? value.split("-").reverse().join("/") : "Não informado");
const status = (value: string | null, kind: string) =>
  ({ A: "Aberto", P: "Parcial", R: kind === "receivable" ? "Recebido" : "Pago", C: "Cancelado" })[value as "A"] ?? value ?? "Não informado";
</script>
<template>
  <RecordDetailDialog
    :title="account.name"
    :subtitle="`Conta #${account.id} · Títulos e lançamentos que compõem o valor`"
    :icon="Banknote"
    module="finance"
    @close="emit('close')"
  >
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
      <span
        >{{ date(params.get("from")) }} a {{ date(params.get("to")) }} · Filial {{ params.get("branchId") || "Todas" }} ·
        {{ { cash: "Caixa", competence: "Competência", manual: "Manual" }[params.get("regime") as "cash"] || "Todos os regimes" }}</span
      >
      <button type="button" class="button-secondary" :disabled="loading" @click="reload">
        <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Atualizar
      </button>
    </div>
    <LiveQueryState :loading="loading" :error="error" @retry="reload" />
    <template v-if="data && !loading && !error">
      <div class="mb-3 grid gap-3 sm:grid-cols-3">
        <div class="panel p-3">
          <p class="text-xs text-slate-500">{{ basis === "result" ? "Valor líquido da conta" : "Variação (crédito − débito)" }}</p>
          <strong class="mt-1 block text-xl">{{ money(data.value) }}</strong>
        </div>
        <div class="panel p-3">
          <p class="text-xs text-slate-500">Créditos</p>
          <strong class="mt-1 block text-lg">{{ money(data.credit) }}</strong>
        </div>
        <div class="panel p-3">
          <p class="text-xs text-slate-500">Débitos</p>
          <strong class="mt-1 block text-lg">{{ money(data.debit) }}</strong>
        </div>
      </div>
      <p
        v-if="Math.round(data.value * 100) !== Math.round(account.value * 100)"
        class="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
        role="status"
      >
        O valor mudou desde a consulta da lista ({{ money(account.value) }}). A composição abaixo usa uma nova consulta ao banco; atualize a
        lista para comparar.
      </p>
      <p class="mb-3 flex gap-2 text-xs text-slate-500">
        <Info class="h-4 w-4 shrink-0" aria-hidden="true" /><span
          >{{ data.total }} lançamentos · {{ data.receivableTitles }} títulos a receber · {{ data.payableTitles }} títulos a pagar ·
          {{ data.unlinked }} sem título. Um título pode aparecer em mais de um lançamento. A contribuição é o valor contábil deste
          lançamento, que pode incluir baixas parciais e estornos; o valor original do título não deve ser somado.
          {{
            basis === "result"
              ? "Transferências internas e lançamentos cancelados foram excluídos."
              : "Lançamentos cancelados foram excluídos; transferências internas permanecem na movimentação."
          }}</span
        >
      </p>
      <div class="panel overflow-x-auto">
        <table class="compact-table min-w-[950px]">
          <thead>
            <tr>
              <th scope="col">Lançamento / data</th>
              <th scope="col">Título / cliente ou fornecedor</th>
              <th scope="col">Documento / vencimento</th>
              <th scope="col" class="text-right">Valor do título</th>
              <th scope="col" class="text-right">Débito</th>
              <th scope="col" class="text-right">Crédito</th>
              <th scope="col" class="text-right">Contribuição</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in data.items" :key="item.id">
              <td>
                <strong>#{{ item.id }}</strong
                ><span class="compact-secondary">{{ date(item.day) }} · Filial #{{ item.branchId }}</span
                ><span v-if="item.history" class="compact-secondary max-w-56 break-words">{{ item.history }}</span>
              </td>
              <td>
                <div v-for="title in item.titles" :key="`${title.kind}-${title.id}`" class="mb-1 last:mb-0">
                  <strong>{{ title.kind === "receivable" ? "A receber" : "A pagar" }} #{{ title.id }}</strong
                  ><span class="compact-secondary">{{ status(title.status, title.kind) }}</span
                  ><RouterLink
                    v-if="title.kind === 'receivable' && title.partyId && auth.can('support.customer.view')"
                    :to="`/support/customers/${title.partyId}`"
                    class="flex items-center gap-1 font-semibold text-primary"
                    >{{ title.partyName || `Cliente #${title.partyId}`
                    }}<ArrowUpRight class="h-3 w-3 shrink-0" aria-hidden="true" /></RouterLink
                  ><span v-else class="block">{{ title.partyName || "Vínculo não encontrado" }}</span
                  ><span v-if="title.contractId" class="compact-secondary">Contrato #{{ title.contractId }}</span>
                </div>
                <span v-if="!item.titles.length" class="text-slate-500">Lançamento sem título vinculado</span>
              </td>
              <td>
                <div v-for="title in item.titles" :key="`${title.kind}-${title.id}`" class="mb-1 last:mb-0">
                  {{ title.document || item.document || "Sem documento" }}<span class="compact-secondary">{{ date(title.dueDate) }}</span>
                </div>
                <span v-if="!item.titles.length">{{ item.document || "Sem documento" }}</span>
              </td>
              <td class="text-right whitespace-nowrap">
                <div v-for="title in item.titles" :key="`${title.kind}-${title.id}`">
                  {{ title.amount === null ? "Não informado" : money(title.amount) }}
                </div>
                <span v-if="!item.titles.length">—</span>
              </td>
              <td class="text-right whitespace-nowrap">{{ money(item.debit) }}</td>
              <td class="text-right whitespace-nowrap">{{ money(item.credit) }}</td>
              <td class="text-right whitespace-nowrap font-semibold" :class="item.value < 0 ? 'text-red-600' : ''">
                {{ money(item.value) }}
              </td>
            </tr>
            <tr v-if="!data.items.length">
              <td colspan="7" class="!py-8 text-center text-slate-500">Nenhum lançamento encontrado para esta conta e período.</td>
            </tr>
          </tbody>
        </table>
        <footer class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-3 text-xs text-slate-500">
          <span>Consultado em {{ formatConsulted(data.queriedAt) }} · Brasília</span>
          <div class="flex items-center gap-2">
            <select v-model="limit" aria-label="Lançamentos por página" class="input !w-auto" @change="page = 1">
              <option :value="10">10 por página</option>
              <option :value="25">25 por página</option></select
            ><span>{{ page }} / {{ pages }}</span
            ><button type="button" class="button-secondary" :disabled="page <= 1" @click="page--">Anterior</button
            ><button type="button" class="button-secondary" :disabled="page >= pages" @click="page++">Próxima</button>
          </div>
        </footer>
      </div>
    </template>
  </RecordDetailDialog>
</template>
