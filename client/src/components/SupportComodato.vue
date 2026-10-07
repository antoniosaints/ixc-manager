<script setup lang="ts">
import { Package, RefreshCw } from "lucide-vue-next";

import { computed, ref, watch } from "vue";

import { supportApi } from "../supportApi";
import { formatDate } from "../upgradesApi";
import { useAuthStore } from "../stores/auth";
import { useLiveQuery } from "../composables/useLiveQuery";
import LiveQueryState from "./LiveQueryState.vue";
import RecordQuickLink from "./RecordQuickLink.vue";
import LivePagination from "./LivePagination.vue";
const props = defineProps<{ contractId: string }>();
const auth = useAuthStore();
const page = ref(1),
  limit = ref(10);
const params = computed(() => new URLSearchParams({ page: String(page.value), limit: String(limit.value) }));
const { data, loading, error, reload } = useLiveQuery((signal) => supportApi.comodato(props.contractId, params.value, signal));
watch([page, limit], reload);
const status = (value: string | null) => (value === "E" ? "Emprestado" : value ? `Status ${value}` : "Não informado");
</script>
<template>
  <section class="panel overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
      <div>
        <h3 class="text-sm font-bold">
          <Package class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Comodatos do contrato<span
            v-if="data"
            class="ml-2 text-xs font-normal text-slate-400"
            >{{ data.total }} registros</span
          >
        </h3>
        <p class="mt-1 text-[11px] text-slate-500">
          Histórico de equipamentos do contrato. Confira o status e o vínculo com o login; o tipo de equipamento do login é apenas
          cadastral.
        </p>
      </div>
      <button type="button" class="button-secondary text-xs" :disabled="loading" @click="reload">
        <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />Atualizar comodatos
      </button>
    </div>
    <div v-if="loading || error" class="p-4"><LiveQueryState :loading="loading" :error="error" @retry="reload" /></div>
    <template v-else-if="data"
      ><div class="overflow-x-auto">
        <table class="w-full min-w-[850px] text-left text-xs">
          <thead class="bg-slate-50 text-[10px] uppercase text-slate-500">
            <tr>
              <th class="px-4 py-2">Equipamento / Produto</th>
              <th class="px-3 py-2">Status / Movimento</th>
              <th class="px-3 py-2">Patrimônio</th>
              <th class="px-3 py-2">Série / MAC</th>
              <th class="px-3 py-2">Data / Quantidade</th>
              <th class="px-4 py-2">Login vinculado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in data.items" :key="item.id" class="border-t border-slate-100">
              <td class="px-4 py-2">
                <p class="font-semibold">{{ item.description ?? "Descrição não informada" }}</p>
                <span class="text-[10px] text-slate-400"
                  >Registro #{{ item.id }}{{ item.productId ? ` · Produto #${item.productId}` : "" }}</span
                >
              </td>
              <td class="px-3 py-2">
                <span :class="item.status === 'E' ? 'text-emerald-700' : 'text-slate-500'">{{ status(item.status) }}</span>
                <p class="mt-0.5 text-[10px] text-slate-400">
                  {{ item.movement === "S" ? "Saída" : item.movement === "E" ? "Entrada" : (item.movement ?? "Sem movimento")
                  }}{{ item.returnId ? ` · Devolução #${item.returnId}` : "" }}
                </p>
              </td>
              <td class="px-3 py-2">
                {{ item.assetNumber ?? (item.assetId ? `#${item.assetId}` : "Não informado")
                }}<span v-if="item.assetId && item.assetNumber" class="mt-0.5 block text-[10px] text-slate-400">#{{ item.assetId }}</span>
              </td>
              <td class="px-3 py-2 font-mono">
                {{ item.serial ?? "Sem série" }}<span class="mt-0.5 block text-[10px] text-slate-400">{{ item.mac ?? "Sem MAC" }}</span>
              </td>
              <td class="whitespace-nowrap px-3 py-2">
                {{ formatDate(item.date)
                }}<span class="mt-0.5 block text-[10px] text-slate-400">Quantidade {{ item.quantity ?? "não informada" }}</span>
              </td>
              <td class="px-4 py-2">
                <RecordQuickLink
                  v-if="item.loginId && auth.can('support.contract.view') && auth.can('support.logins.view')"
                  :target="{ kind: 'login', id: item.loginId, contractId: Number(contractId) }"
                  :label="`Login #${item.loginId}`"
                />
                <span v-else class="text-slate-500">{{ item.loginId ? `#${item.loginId}` : "Sem login vinculado" }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!data.items.length" class="px-4 py-8 text-center text-xs text-slate-500">
        {{ data.total ? "Nenhum comodato nesta página." : "Nenhum registro de comodato neste contrato no IXC." }}
      </p>
      <LivePagination v-model:page="page" v-model:limit="limit" :total="data.total" :queried-at="data.queriedAt"
    /></template>
  </section>
</template>
