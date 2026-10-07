<script setup lang="ts">
import {
  Phone,
  UserRound,
  ArrowLeft,
  RefreshCw,
  FileText,
  Network,
  Wrench,
  Headset,
  MapPin,
  MessageSquareText,
  ShieldAlert,
} from "lucide-vue-next";

import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";

import { supportApi } from "../supportApi";
import { formatConsulted } from "../upgradesApi";
import { useAuthStore } from "../stores/auth";
import { useLiveQuery } from "../composables/useLiveQuery";
import LiveQueryState from "../components/LiveQueryState.vue";
import ContractFields from "../components/ContractFields.vue";
import SupportRecords from "../components/SupportRecords.vue";
import CustomerAnalysisDialog from "../components/CustomerAnalysisDialog.vue";
const route = useRoute(),
  auth = useAuthStore();
const customerId = computed(() => String(route.params.id));
const { data, loading, error, reload } = useLiveQuery((signal) => supportApi.customer(customerId.value, signal));
const customer = computed(() => data.value?.customer);
const analysisOpen = ref(false);
watch(
  () => auth.can("support.customer.analyze"),
  (allowed) => {
    if (!allowed) analysisOpen.value = false;
  }
);
const definitions = [
  { id: "contracts", label: "Contratos", icon: FileText, permission: "support.contract.view" },
  { id: "logins", label: "Logins", icon: Network, permission: "support.logins.view" },
  { id: "orders", label: "Ordens de serviço", icon: Wrench, permission: "support.orders.view" },
  { id: "tickets", label: "Atendimentos", icon: Headset, permission: "support.tickets.view" },
] as const;
const tabs = computed(() => definitions.filter((item) => auth.can(item.permission)));
const tab = ref(tabs.value[0]?.id);
watch(customerId, () => {
  analysisOpen.value = false;
  tab.value = tabs.value[0]?.id;
  reload();
});
watch(tabs, (value) => {
  if (!value.some((item) => item.id === tab.value)) tab.value = value[0]?.id;
});
function switchTab(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !tabs.value.length) return;
  event.preventDefault();
  const index = tabs.value.findIndex((item) => item.id === tab.value),
    size = tabs.value.length;
  tab.value =
    tabs.value[
      event.key === "Home" ? 0 : event.key === "End" ? size - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + size) % size
    ]!.id;
  (event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`#support-tab-${tab.value}`)?.focus();
}
</script>
<template>
  <RouterLink
    :to="auth.can('support.customers.view') ? '/support' : auth.home"
    class="mb-4 inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-indigo-600"
    ><ArrowLeft class="h-4 w-4" aria-hidden="true" focusable="false" />Voltar aos clientes</RouterLink
  >
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-indigo-600">
        Validação de atendimento · Cliente #{{ customerId }}
      </p>
      <h1 class="text-2xl font-extrabold tracking-tight">
        <UserRound class="mr-2 inline h-5 w-5 align-middle" aria-hidden="true" focusable="false" />{{
          customer?.name ?? "Detalhes do cliente"
        }}
      </h1>
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        v-if="auth.can('support.customer.analyze')"
        type="button"
        class="button-primary text-xs"
        :disabled="loading || !customer || !!error"
        @click="analysisOpen = true"
      >
        <ShieldAlert class="h-3.5 w-3.5" aria-hidden="true" />Analisar cliente
      </button>
      <button type="button" class="button-secondary text-xs" :disabled="loading" @click="reload">
        <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />Atualizar cadastro
      </button>
    </div>
  </div>
  <LiveQueryState :loading="loading" :error="error" @retry="reload" />
  <template v-if="customer && !loading && !error">
    <div class="mb-4 grid gap-3 lg:grid-cols-2">
      <ContractFields
        title="Cadastro e instalação"
        :icon="MapPin"
        :fields="[
          { label: 'Cadastro', value: customer.active === null ? 'Sem status' : customer.active ? 'Ativo' : 'Inativo' },
          { label: 'CPF / CNPJ', value: customer.document },
          { label: 'Cidade / bairro', value: [customer.city, customer.neighborhood].filter(Boolean).join(' · ') },
          { label: 'Endereço', value: customer.address },
          { label: 'CEP', value: customer.zip },
          { label: 'Referência', value: customer.reference },
        ]"
      />
      <section class="panel px-4 py-3">
        <h2 class="mb-2 text-sm font-bold">
          <Phone class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Contatos
        </h2>
        <p class="mb-2 text-xs text-slate-500">
          {{ [customer.contactName, customer.email].filter(Boolean).join(" · ") || "Sem contato ou e-mail cadastrado." }}
        </p>
        <div class="grid gap-x-4 sm:grid-cols-2">
          <div
            v-for="contact in customer.contacts"
            :key="contact.telUrl"
            class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-2 text-xs"
          >
            <div>
              <a
                :href="contact.telUrl"
                :aria-label="`Ligar para ${contact.number}`"
                class="inline-flex items-center gap-1.5 font-semibold hover:underline"
                ><Phone class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />{{ contact.number }}</a
              >
              <p class="mt-0.5 text-[10px] text-slate-400">
                {{ contact.labels.join(" · ") }}{{ contact.extension ? ` · Ramal ${contact.extension}` : "" }}
              </p>
            </div>
            <a
              v-if="contact.whatsappUrl"
              :href="contact.whatsappUrl"
              target="_blank"
              rel="noopener noreferrer"
              referrerpolicy="no-referrer"
              :aria-label="`WhatsApp para ${contact.number} (abre em nova aba)`"
              class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600"
              ><MessageSquareText class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />WhatsApp ↗</a
            >
          </div>
        </div>
        <p v-if="!customer.contacts.length" class="text-xs text-slate-500">Nenhum telefone informado no IXC.</p>
      </section>
    </div>
    <details v-for="note in customer.notes" :key="note.label" class="panel mb-3 px-4 py-2">
      <summary class="cursor-pointer text-xs font-semibold">{{ note.label }}</summary>
      <p class="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-500">{{ note.content }}</p>
    </details>
    <div class="mb-3 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Informações do cliente" @keydown="switchTab">
      <div class="flex min-w-max gap-1">
        <button
          v-for="item in tabs"
          :id="`support-tab-${item.id}`"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="tab === item.id"
          :aria-controls="`support-panel-${item.id}`"
          :tabindex="tab === item.id ? 0 : -1"
          class="inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold"
          :class="tab === item.id ? 'support-tab-active' : 'border-transparent text-slate-500 hover:text-indigo-600'"
          @click="tab = item.id"
        >
          <component :is="item.icon" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" focusable="false" />{{ item.label }}
        </button>
      </div>
    </div>
    <section v-if="tab" :id="`support-panel-${tab}`" role="tabpanel" :aria-labelledby="`support-tab-${tab}`" tabindex="0">
      <SupportRecords :key="`${customerId}-${tab}`" :customer-id="customerId" :kind="tab" />
    </section>
    <p v-else class="panel p-4 text-xs text-slate-500">
      Seu perfil permite consultar o cadastro. Um administrador pode liberar os detalhes de contratos, logins e histórico em Configurações.
    </p>
    <p class="mt-3 text-[11px] text-slate-400">
      Cadastro consultado em {{ formatConsulted(data?.queriedAt) }} · Brasília · Consulta direta ao IXC
    </p>
  </template>
  <CustomerAnalysisDialog
    v-if="analysisOpen && customer && auth.can('support.customer.analyze')"
    :key="customerId"
    :customer-id="customerId"
    :customer-name="customer.name"
    @close="analysisOpen = false"
  />
</template>
