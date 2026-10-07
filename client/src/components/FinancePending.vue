<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ListFilter, Search, ArrowUpRight, RefreshCw } from "lucide-vue-next";
import { financePending } from "../financeApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import { useAuthStore } from "../stores/auth";
import LiveQueryState from "./LiveQueryState.vue";
import LivePagination from "./LivePagination.vue";
const props = defineProps<{
  params: URLSearchParams;
  kind: string;
  scope: string;
  bucket: string;
  search?: string;
  searchBy?: string;
  sort?: string;
}>();
const emit = defineEmits<{
  selection: [{ kind: string; scope: string; bucket: string; search: string; searchBy: string; sort: string }];
}>();
const auth = useAuthStore(),
  page = ref(1),
  limit = ref(10);
const form = reactive({
  kind: props.kind,
  scope: props.scope,
  bucket: props.bucket,
  search: props.search ?? "",
  searchBy: props.searchBy ?? "name",
  sort: props.sort ?? "oldest",
});
const applied = ref({ ...form });
const request = computed(() => {
  const params = new URLSearchParams(props.params);
  Object.entries(applied.value).forEach(([k, v]) => params.set(k, v));
  params.set("page", String(page.value));
  params.set("limit", String(limit.value));
  return params;
});
const { data, loading, error, reload } = useLiveQuery((signal) => financePending(request.value, signal));
watch(
  () => props.params,
  () => {
    page.value = 1;
    void reload();
  }
);
watch([page, limit], reload);
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (s: string | null) => (s ? new Date(`${s}T12:00:00Z`).toLocaleDateString("pt-BR") : "Não informada");
function apply() {
  if (form.scope !== "aging") form.bucket = "all";
  if (form.kind === "payable" && form.searchBy === "contractId") {
    form.searchBy = "name";
    form.search = "";
  }
  applied.value = { ...form };
  emit("selection", { ...form });
  if (page.value !== 1) page.value = 1;
  else void reload();
}
</script>
<template>
  <section aria-label="Lista de pendências financeiras">
    <div class="px-4 py-3 border-b border-slate-100">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 class="text-sm font-bold">
          <ListFilter class="inline mr-1.5 h-4 w-4" aria-hidden="true" />Pendências detalhadas
          <span v-if="data" class="ml-2 text-xs font-normal text-slate-500"
            >{{ data.total.toLocaleString("pt-BR") }} títulos · {{ money(data.balance) }}</span
          >
        </h2>
        <button class="button-secondary" type="button" :disabled="loading" @click="reload">
          <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Atualizar lista
        </button>
      </div>
      <form class="flex flex-wrap items-end gap-2" @submit.prevent="apply">
        <label class="text-[11px] text-slate-500"
          >Títulos<select v-model="form.kind" class="input mt-1" @change="apply">
            <option value="receivable">A receber</option>
            <option value="payable">A pagar</option>
          </select></label
        >
        <label class="text-[11px] text-slate-500"
          >Base<select v-model="form.scope" class="input mt-1" @change="apply">
            <option value="aging">Carteira vencida atual</option>
            <option value="period">Em aberto no período</option>
            <option value="overdue">Vencidos no período</option>
          </select></label
        >
        <label v-if="form.scope === 'aging'" class="text-[11px] text-slate-500"
          >Atraso<select v-model="form.bucket" class="input mt-1" @change="apply">
            <option value="all">Todos os atrasos</option>
            <option value="1-30">1–30 dias</option>
            <option value="31-60">31–60 dias</option>
            <option value="61-90">61–90 dias</option>
            <option value="91+">Mais de 90 dias</option>
          </select></label
        >
        <label class="text-[11px] text-slate-500"
          >Ordenar<select v-model="form.sort" class="input mt-1" @change="apply">
            <option value="oldest">Mais antigos</option>
            <option value="newest">Mais recentes</option>
            <option value="balance">Maior saldo</option>
          </select></label
        >
        <label class="text-[11px] text-slate-500"
          >Buscar por<select v-model="form.searchBy" class="input mt-1">
            <option value="name">{{ form.kind === "receivable" ? "Cliente" : "Fornecedor" }}</option>
            <option value="partyId">ID do {{ form.kind === "receivable" ? "cliente" : "fornecedor" }}</option>
            <option value="titleId">ID do título</option>
            <option v-if="form.kind === 'receivable'" value="contractId">ID do contrato</option>
          </select></label
        >
        <label class="min-w-40 flex-1 text-[11px] text-slate-500"
          >Busca<input v-model="form.search" class="input mt-1" maxlength="120" placeholder="Nome ou ID conforme a opção"
        /></label>
        <button class="button-primary" type="submit" :disabled="loading"><Search class="h-3.5 w-3.5" aria-hidden="true" />Buscar</button>
        <button
          v-if="form.search"
          class="button-secondary"
          type="button"
          @click="
            form.search = '';
            apply();
          "
        >
          Limpar busca
        </button>
      </form>
      <p class="mt-2 text-[10px] text-slate-500">
        {{
          applied.scope === "aging"
            ? "Saldos atuais de todos os vencimentos atrasados, incluindo datas anteriores ao período."
            : "Somente títulos com vencimento no período escolhido acima."
        }}
        Filtros de filial, conta e regime se aplicam à lista. Saldos de títulos ativos, sem estornos ou antigos renegociados.
      </p>
    </div>
    <LiveQueryState :loading="loading" :error="error" @retry="reload" />
    <template v-if="data && !loading && !error">
      <div class="overflow-x-auto">
        <table class="compact-table min-w-[800px]">
          <thead>
            <tr>
              <th scope="col" class="!pl-4">{{ data.kind === "receivable" ? "Cliente / contrato" : "Fornecedor" }}</th>
              <th scope="col">Título / documento</th>
              <th scope="col">Conta / filial</th>
              <th scope="col">Vencimento</th>
              <th scope="col" class="text-right">Valor original</th>
              <th scope="col" class="text-right">{{ data.kind === "receivable" ? "Recebido" : "Pago" }}</th>
              <th scope="col" class="!pr-4 text-right">Saldo aberto</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="item in data.items" :key="item.id" class="hover:bg-slate-50">
              <td class="!pl-4 max-w-64">
                <RouterLink
                  v-if="data.kind === 'receivable' && item.partyId && auth.can('support.customer.view')"
                  :to="`/support/customers/${item.partyId}`"
                  class="inline-flex items-center gap-1 font-semibold hover:underline"
                  :title="item.partyName ?? ''"
                  >{{ item.partyName ?? "Cliente não informado" }}<ArrowUpRight class="h-3 w-3 shrink-0" aria-hidden="true" /></RouterLink
                ><strong v-else class="font-semibold">{{ item.partyName ?? "Cadastro não informado" }}</strong
                ><span class="compact-secondary"
                  >{{ item.partyId ? `#${item.partyId}` : "" }}{{ item.contractId ? ` · Contrato #${item.contractId}` : "" }}</span
                >
              </td>
              <td>
                #{{ item.id }}<span class="compact-secondary">{{ item.document || "Sem documento" }}</span>
              </td>
              <td>
                {{ item.accountName ?? "Conta não informada"
                }}<span class="compact-secondary"
                  >{{ item.accountId ? `#${item.accountId}` : "" }}{{ item.branchId ? ` · Filial #${item.branchId}` : "" }}</span
                >
              </td>
              <td class="whitespace-nowrap">
                {{ date(item.dueDate)
                }}<span class="compact-secondary" :class="item.daysLate ? '!text-red-600' : ''">{{
                  item.daysLate ? `${item.daysLate} dias de atraso` : "A vencer / vence hoje"
                }}</span>
              </td>
              <td class="text-right whitespace-nowrap">{{ money(item.amount) }}</td>
              <td class="text-right whitespace-nowrap">{{ item.paid === null ? "Não informado" : money(item.paid) }}</td>
              <td class="!pr-4 text-right whitespace-nowrap font-semibold">{{ money(item.balance) }}</td>
            </tr>
            <tr v-if="!data.items.length">
              <td colspan="7" class="!py-8 text-center text-slate-500">Nenhuma pendência encontrada para estes filtros.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <LivePagination v-model:page="page" v-model:limit="limit" :total="data.total" :queried-at="data.queriedAt" />
    </template>
  </section>
</template>
