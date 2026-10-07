<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Banknote, FileText, Phone, RefreshCw, TriangleAlert, MapPin } from "lucide-vue-next";
import { collectionsApi, collectionMoney as money } from "../collectionsApi";
import { formatDate, internetStatus } from "../upgradesApi";
import { useAuthStore } from "../stores/auth";
import { useLiveQuery } from "../composables/useLiveQuery";
import LivePagination from "./LivePagination.vue";
import LiveQueryState from "./LiveQueryState.vue";
import RecordQuickLink from "./RecordQuickLink.vue";
import CustomerQuickLinks from "./CustomerQuickLinks.vue";
import ContactNumbers from "./ContactNumbers.vue";
const props = defineProps<{ customerId: number; filters: Record<string, string> }>();
const auth = useAuthStore(),
  page = ref(1),
  limit = ref(10);
const params = computed(() => new URLSearchParams({ ...props.filters, page: String(page.value), limit: String(limit.value) }));
const { data, loading, error, reload } = useLiveQuery((signal) => collectionsApi.customer(props.customerId, params.value, signal));
watch([page, limit], reload);
</script>
<template>
  <LiveQueryState :loading="loading" :error="error" @retry="reload" />
  <div v-if="data && !loading && !error" class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-slate-500">Pendências de contratos ativos · Filtros da lista · Cliente #{{ data.customer.id }}</p>
      <div class="flex gap-2">
        <CustomerQuickLinks :customer-id="customerId" :show-collections="false" />
        <button type="button" class="button-secondary" @click="reload"><RefreshCw aria-hidden="true" />Atualizar</button>
      </div>
    </div>
    <div class="grid gap-3 lg:grid-cols-2">
      <section class="panel p-3">
        <h3 class="mb-2 flex items-center gap-2 text-sm font-bold"><Banknote class="h-4 w-4" aria-hidden="true" />Resumo financeiro</h3>
        <div class="grid grid-cols-3 gap-3 text-xs">
          <div>
            <span class="text-slate-500">Saldo aberto</span><strong class="mt-1 block text-base">{{ money(data.customer.balance) }}</strong>
          </div>
          <div>
            <span class="text-slate-500">Saldo vencido</span
            ><strong class="mt-1 block text-base">{{ money(data.customer.overdueBalance) }}</strong>
          </div>
          <div>
            <span class="text-slate-500">Títulos</span
            ><strong class="mt-1 block text-base"
              >{{ data.customer.titles }}
              <span class="text-xs font-normal text-slate-500">({{ data.customer.overdueTitles }} vencidos)</span></strong
            >
          </div>
        </div>
        <p class="mt-3 text-xs text-slate-500">
          {{ data.customer.document || "CPF/CNPJ não informado" }} · Cadastro
          {{ data.customer.active === true ? "ativo" : data.customer.active === false ? "inativo" : "não informado" }}
        </p>
        <p class="mt-1 text-xs text-slate-500">
          <MapPin class="mr-1 inline h-3 w-3" aria-hidden="true" />{{
            [data.customer.city, data.customer.neighborhood].filter(Boolean).join(" · ") || "Localidade não informada"
          }}
        </p>
      </section>
      <section class="panel p-3">
        <h3 class="mb-2 flex items-center gap-2 text-sm font-bold"><Phone class="h-4 w-4" aria-hidden="true" />Contatos para cobrança</h3>
        <ContactNumbers :numbers="data.customer.contacts" />
        <p v-if="!data.customer.contacts.length" class="text-xs text-slate-500">Nenhum telefone informado no cadastro.</p>
        <p class="mt-2 break-words text-xs text-slate-500">{{ data.customer.email || "E-mail não informado" }}</p>
      </section>
    </div>
    <p class="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
      <TriangleAlert class="h-4 w-4 shrink-0" aria-hidden="true" />Saldo cadastrado no IXC, sem cálculo adicional de juros e multa. Títulos
      aguardando confirmação continuam em aberto até a baixa. Confira antes de realizar a cobrança.
    </p>
    <section class="panel overflow-hidden">
      <h3 class="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm font-bold">
        <FileText class="h-4 w-4" aria-hidden="true" />Títulos do cliente
        <span class="text-xs font-normal text-slate-500">{{ data.total }} encontrados</span>
      </h3>
      <div class="overflow-x-auto">
        <table class="compact-table min-w-[850px]">
          <thead>
            <tr>
              <th scope="col">Título / documento</th>
              <th scope="col">Contrato / acesso</th>
              <th scope="col">Conta / filial</th>
              <th scope="col">Vencimento</th>
              <th scope="col" class="text-right">Original</th>
              <th scope="col" class="text-right">Recebido</th>
              <th scope="col" class="text-right">Saldo</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="title in data.items" :key="title.id" class="hover:bg-slate-50">
              <td>
                <strong>#{{ title.id }}</strong
                ><span class="compact-secondary">{{ title.document || "Sem documento" }}</span
                ><span v-if="title.awaitingConfirmation || title.processing" class="block text-[10px] text-amber-700">{{
                  title.awaitingConfirmation ? "Aguardando confirmação" : "Em processamento"
                }}</span
                ><span v-if="title.inCollection" class="compact-secondary">Em cobrança no IXC</span>
              </td>
              <td>
                <RecordQuickLink
                  v-if="title.contractId && (auth.can('support.contract.view') || auth.can('upgrades.contract.view'))"
                  :target="{ kind: 'contract', id: title.contractId, module: auth.can('support.contract.view') ? 'support' : 'upgrades' }"
                  :label="`Ver contrato #${title.contractId}`"
                />
                <span v-else>{{ title.contractId ? `Contrato #${title.contractId}` : "Sem contrato" }}</span>
                <span class="compact-secondary"
                  >{{ title.contractName || "Plano não informado" }} · {{ internetStatus(title.internetStatus || "") }}</span
                >
              </td>
              <td>
                {{ title.accountName || "Conta não informada"
                }}<span class="compact-secondary">{{ title.branchName || "Filial não informada" }}</span>
              </td>
              <td class="whitespace-nowrap">
                {{ formatDate(title.dueDate)
                }}<span class="compact-secondary">{{ title.daysLate ? `${title.daysLate} dias de atraso` : "Vence hoje / a vencer" }}</span>
              </td>
              <td class="text-right whitespace-nowrap">{{ money(title.amount) }}</td>
              <td class="text-right whitespace-nowrap">{{ title.paid === null ? "Não informado" : money(title.paid) }}</td>
              <td class="text-right whitespace-nowrap font-semibold">{{ money(title.balance) }}</td>
            </tr>
            <tr v-if="!data.items.length">
              <td colspan="7" class="!py-6 text-center text-slate-500">Nenhum título nesta página. Atualize a consulta.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <LivePagination v-model:page="page" v-model:limit="limit" :total="data.total" :queried-at="data.queriedAt" />
    </section>
  </div>
</template>
