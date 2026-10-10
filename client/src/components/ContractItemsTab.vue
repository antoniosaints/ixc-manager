<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Package, ListPlus, RefreshCw } from "lucide-vue-next";
import { upgradesApi, formatDate, type ContractProduct, type ContractAdditionalService, type LivePage } from "../upgradesApi";
import { supportApi } from "../supportApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import LiveQueryState from "./LiveQueryState.vue";
import LivePagination from "./LivePagination.vue";
import TechnicalStatus from "./TechnicalStatus.vue";
const props = defineProps<{ contractId: string; module: "support" | "upgrades"; kind: "products" | "additional-services" }>();
const page = ref(1),
  limit = ref(10);
const api = computed(() => (props.module === "support" ? supportApi : upgradesApi));
const params = computed(() => new URLSearchParams({ page: String(page.value), limit: String(limit.value) }));
const { data, loading, error, reload } = useLiveQuery<LivePage<ContractProduct | ContractAdditionalService>>((signal) =>
  props.kind === "products"
    ? api.value.contractProducts(props.contractId, params.value, signal)
    : api.value.contractAdditionalServices(props.contractId, params.value, signal)
);
watch([page, limit], reload);
const products = computed(() => (props.kind === "products" ? data.value?.items : []) as ContractProduct[] | undefined);
const services = computed(() => (props.kind === "additional-services" ? data.value?.items : []) as ContractAdditionalService[] | undefined);
const title = computed(() => (props.kind === "products" ? "Produtos do contrato" : "Serviços adicionais"));
const money = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const quantity = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 9 }));
const types: Record<string, string> = {
  I: "Internet",
  T: "Telefonia",
  S: "Serviços / produtos",
  SVA: "SVA",
  TV: "TV / streaming",
  SMP: "Telefonia móvel",
  M: "Mercadoria",
};
</script>
<template>
  <section class="panel overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
      <div>
        <h3 class="text-sm font-bold">
          <component :is="kind === 'products' ? Package : ListPlus" class="mr-2 inline h-4 w-4" aria-hidden="true" />{{ title
          }}<span v-if="data" class="ml-2 text-xs font-normal text-slate-400">{{ data.total }} registros</span>
        </h3>
        <p class="mt-1 text-[11px] text-slate-500">
          {{
            kind === "products"
              ? "Produtos do plano e do contrato, com valores apresentados pelo IXC."
              : "Adicionais cadastrados neste contrato, incluindo ativos e inativos."
          }}
        </p>
      </div>
      <button type="button" class="button-secondary text-xs" :disabled="loading" @click="reload">
        <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />{{ kind === "products" ? "Atualizar produtos" : "Atualizar serviços" }}
      </button>
    </div>
    <LiveQueryState :loading="loading" :error="error" @retry="reload" />
    <template v-if="data && !loading && !error">
      <div class="overflow-x-auto">
        <table v-if="kind === 'products'" class="compact-table min-w-[1050px]">
          <thead>
            <tr>
              <th scope="col" class="!pl-4">Produto / tipo</th>
              <th scope="col">Vínculo</th>
              <th scope="col">Quantidade</th>
              <th scope="col">Unitário</th>
              <th scope="col">Bruto</th>
              <th scope="col">Desconto</th>
              <th scope="col">Acréscimo</th>
              <th scope="col">Até vencimento</th>
              <th scope="col" class="!pr-4">Líquido</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="item in products" :key="item.id">
              <td class="max-w-80 !pl-4">
                <strong class="block break-words">{{ item.description ?? "Descrição não informada" }}</strong
                ><span class="compact-secondary"
                  >#{{ item.id }} · {{ types[item.type ?? ""] ?? item.type ?? "Tipo não informado"
                  }}{{ item.productId ? ` · Produto #${item.productId}` : "" }}{{ item.planId ? ` · Plano #${item.planId}` : "" }}</span
                >
                <p v-if="item.notes" class="mt-1 max-w-80 whitespace-pre-line break-words text-[11px] text-slate-500">{{ item.notes }}</p>
              </td>
              <td class="whitespace-nowrap">
                <TechnicalStatus :label="item.source === 'plan' ? 'Plano de venda' : 'Contrato'" tone="neutral" />
              </td>
              <td>{{ quantity(item.quantity) }}</td>
              <td class="whitespace-nowrap">{{ money(item.unitPrice) }}</td>
              <td class="whitespace-nowrap">{{ money(item.gross) }}</td>
              <td class="whitespace-nowrap">{{ money(item.discount) }}</td>
              <td class="whitespace-nowrap">{{ money(item.surcharge) }}</td>
              <td class="whitespace-nowrap">{{ money(item.untilDue) }}</td>
              <td class="whitespace-nowrap !pr-4 font-semibold">{{ money(item.net) }}</td>
            </tr>
          </tbody>
        </table>
        <table v-else class="compact-table min-w-[950px]">
          <thead>
            <tr>
              <th scope="col" class="!pl-4">Serviço / tipo</th>
              <th scope="col">Status</th>
              <th scope="col">Quantidade</th>
              <th scope="col">Unitário</th>
              <th scope="col">Total cadastrado</th>
              <th scope="col">Repetição</th>
              <th scope="col" class="!pr-4">Datas / execuções</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="item in services" :key="item.id">
              <td class="max-w-72 !pl-4">
                <strong class="block break-words">{{ item.description ?? "Descrição não informada" }}</strong
                ><span class="compact-secondary"
                  >#{{ item.id }} · {{ types[item.type ?? ""] ?? item.type ?? "Tipo não informado"
                  }}{{ item.productId ? ` · Produto #${item.productId}` : "" }}</span
                >
              </td>
              <td>
                <TechnicalStatus
                  :label="item.status === 'A' ? 'Ativo' : item.status === 'I' ? 'Inativo' : (item.status ?? 'Sem status')"
                  :tone="item.status === 'A' ? 'success' : item.status === 'I' ? 'danger' : 'neutral'"
                />
              </td>
              <td>{{ quantity(item.quantity) }}</td>
              <td class="whitespace-nowrap">{{ money(item.unitPrice) }}</td>
              <td class="whitespace-nowrap font-semibold">{{ money(item.total) }}</td>
              <td class="whitespace-nowrap">
                {{ item.recurring === true ? "Recorrente" : item.recurring === false ? "Quantidade definida" : "Não informada"
                }}<span v-if="item.repetitions !== null && item.repetitions > 0" class="compact-secondary"
                  >{{ item.repetitions }} {{ item.repetitions === 1 ? "repetição" : "repetições" }}</span
                >
              </td>
              <td class="whitespace-nowrap !pr-4">
                Cadastro: {{ formatDate(item.date)
                }}<span v-if="item.validUntil" class="compact-secondary">Validade: {{ formatDate(item.validUntil) }}</span
                ><span class="compact-secondary"
                  >Última execução: {{ formatDate(item.lastExecutedAt)
                  }}{{ item.executions !== null ? ` · ${item.executions} ${item.executions === 1 ? "execução" : "execuções"}` : "" }}</span
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!data.items.length" class="px-4 py-8 text-center text-xs text-slate-500">
        {{
          data.total
            ? "Nenhum item nesta página."
            : kind === "products"
              ? "Nenhum produto vinculado a este contrato no IXC."
              : "Nenhum serviço adicional neste contrato no IXC."
        }}
      </p>
      <p class="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
        {{
          kind === "products"
            ? "Valores da composição do contrato no IXC; não representam títulos pagos ou em aberto. Campos não informados aparecem como —."
            : "Valores cadastrados dos adicionais; o faturamento depende do status e das regras de execução no IXC."
        }}
      </p>
      <LivePagination v-model:page="page" v-model:limit="limit" :total="data.total" :queried-at="data.queriedAt" />
    </template>
  </section>
</template>
