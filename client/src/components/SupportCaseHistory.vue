<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RefreshCw, MessageSquareText, History, UserRound, Clock3, Package, Inbox } from "lucide-vue-next";
import { supportApi } from "../supportApi";
import { formatIxcDateTime } from "../upgradesApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import LiveQueryState from "./LiveQueryState.vue";
import LivePagination from "./LivePagination.vue";
import SupportCaseStatus from "./SupportCaseStatus.vue";
const props = defineProps<{ customerId: string; kind: "orders" | "tickets"; caseId: number; section: "messages" | "movements" }>();
const page = ref(1),
  limit = ref(10),
  order = ref("newest");
const params = computed(() => new URLSearchParams({ page: String(page.value), limit: String(limit.value), order: order.value }));
const { data, loading, error, reload } = useLiveQuery((signal) =>
  supportApi.caseHistory(props.customerId, props.kind, props.caseId, props.section, params.value, signal)
);
watch([page, limit], reload);
function sort() {
  if (page.value !== 1) page.value = 1;
  else void reload();
}
const words = (s: string | null) => s?.replace(/_/g, " ").toLocaleLowerCase("pt-BR");
const title = (item: NonNullable<typeof data.value>["items"][number]) =>
  [...new Set([item.event, words(item.type), item.title].filter(Boolean))].join(" · ") ||
  (props.section === "messages" ? "Interação registrada" : "Movimentação registrada");
</script>
<template>
  <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
    <h4 class="text-xs font-semibold">
      <component :is="section === 'messages' ? MessageSquareText : History" class="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />{{
        section === "messages" ? "Mensagens e interações" : "Movimentações / histórico"
      }}
      <span v-if="data" class="font-normal text-slate-500">· {{ data.total }} registros</span>
    </h4>
    <div class="flex gap-2">
      <select v-model="order" class="input !w-auto !py-1.5 !text-xs" aria-label="Ordem do histórico" @change="sort">
        <option value="newest">Mais recentes</option>
        <option value="oldest">Mais antigos</option></select
      ><button type="button" class="button-secondary" :disabled="loading" @click="reload">
        <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Atualizar histórico
      </button>
    </div>
  </div>
  <p class="mb-3 text-[10px] text-slate-500">
    {{
      kind === "orders" && section === "movements"
        ? "Histórico de materiais, comodatos, patrimônio e alterações da OS. Mudanças de status e comentários aparecem em Mensagens."
        : kind === "tickets" && section === "movements"
          ? "Eventos, estados e observações registrados nas interações do atendimento."
          : "Interações registradas no IXC, incluindo eventos e mudanças de status."
    }}
  </p>
  <LiveQueryState :loading="loading" :error="error" @retry="reload" />
  <template v-if="data && !loading && !error">
    <ol class="support-case-history" :aria-label="section === 'messages' ? 'Mensagens do registro' : 'Movimentações do registro'">
      <li v-for="item in data.items" :key="item.id" class="support-case-history-item">
        <span class="support-case-history-icon" aria-hidden="true"
          ><component :is="section === 'messages' ? MessageSquareText : kind === 'orders' ? Package : History" class="h-3.5 w-3.5"
        /></span>
        <article class="support-case-card min-w-0">
          <header class="mb-2 flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <h5 class="break-words text-xs font-semibold">{{ title(item) }}</h5>
              <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                <span class="inline-flex items-center gap-1"
                  ><UserRound class="h-3 w-3" aria-hidden="true" />{{ item.operator ?? "Autor não informado" }}</span
                >
                <span class="inline-flex items-center gap-1"
                  ><Clock3 class="h-3 w-3" aria-hidden="true" />{{ formatIxcDateTime(item.date) }}</span
                >
              </p>
            </div>
            <SupportCaseStatus v-if="item.status" :status="item.status" :kind="kind" />
          </header>
          <details v-if="kind === 'tickets' && section === 'movements' && item.body" class="support-case-message-disclosure">
            <summary>Ver mensagem associada</summary>
            <p class="support-case-text mt-2" :tabindex="item.body.length > 600 ? 0 : undefined">{{ item.body }}</p>
          </details>
          <p
            v-else-if="item.body"
            class="support-case-text"
            :tabindex="item.body.length > 600 ? 0 : undefined"
            aria-label="Conteúdo da interação"
          >
            {{ item.body }}
          </p>
          <div v-if="item.observation" class="mt-2 rounded-md bg-slate-50 p-2 text-xs">
            <strong class="text-[10px] text-slate-500">Observação</strong>
            <p class="support-case-text mt-1" :tabindex="item.observation.length > 600 ? 0 : undefined">{{ item.observation }}</p>
          </div>
          <p v-if="item.truncated" class="mt-2 text-[10px] text-amber-700">
            Texto muito longo: exibindo os primeiros 16.000 caracteres. Consulte o registro completo no IXC.
          </p>
          <dl
            v-if="
              item.technician ||
              item.diagnosis ||
              item.startedAt ||
              item.finishedAt ||
              item.quantity ||
              item.totalValue ||
              item.serial ||
              item.mac
            "
            class="mt-3 grid gap-x-4 gap-y-2 border-t border-slate-100 pt-2 text-[11px] sm:grid-cols-2 xl:grid-cols-4"
          >
            <div v-if="item.technician">
              <dt class="support-case-caption">Técnico</dt>
              <dd class="mt-0.5 break-words">{{ item.technician }}</dd>
            </div>
            <div v-if="item.diagnosis">
              <dt class="support-case-caption">Diagnóstico</dt>
              <dd class="mt-0.5 break-words">{{ item.diagnosis }}</dd>
            </div>
            <div v-if="item.startedAt">
              <dt class="support-case-caption">Início</dt>
              <dd class="mt-0.5">{{ formatIxcDateTime(item.startedAt) }}</dd>
            </div>
            <div v-if="item.finishedAt">
              <dt class="support-case-caption">Fim</dt>
              <dd class="mt-0.5">{{ formatIxcDateTime(item.finishedAt) }}</dd>
            </div>
            <div v-if="item.quantity">
              <dt class="support-case-caption">Quantidade</dt>
              <dd class="mt-0.5">{{ item.quantity }}</dd>
            </div>
            <div v-if="item.totalValue">
              <dt class="support-case-caption">Valor IXC</dt>
              <dd class="mt-0.5">{{ item.totalValue }}</dd>
            </div>
            <div v-if="item.serial">
              <dt class="support-case-caption">Serial</dt>
              <dd class="mt-0.5 break-all font-mono">{{ item.serial }}</dd>
            </div>
            <div v-if="item.mac">
              <dt class="support-case-caption">MAC</dt>
              <dd class="mt-0.5 break-all font-mono">{{ item.mac }}</dd>
            </div>
          </dl>
          <footer class="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
            <span>Registro #{{ item.id }}</span
            ><span v-if="item.visibility">Visibilidade IXC: {{ item.visibility }}</span>
          </footer>
        </article>
      </li>
    </ol>
    <div v-if="!data.items.length" class="support-case-empty">
      <Inbox class="h-6 w-6" aria-hidden="true" /><strong>{{
        section === "messages" ? "Nenhuma interação registrada" : "Nenhuma movimentação registrada"
      }}</strong>
      <p>O IXC não retornou registros nesta seção.</p>
    </div>
    <LivePagination v-model:page="page" v-model:limit="limit" :total="data.total" :queried-at="data.queriedAt" />
  </template>
</template>
