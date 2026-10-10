<script setup lang="ts">
import CustomerQuickLinks from "../components/CustomerQuickLinks.vue";
import { toast } from "../notifications/toast";
import {
  FileText,
  Network,
  UserRound,
  ArrowLeft,
  ArrowUpRight,
  Copy,
  Phone,
  RefreshCw,
  LayoutDashboard,
  Package,
  ListPlus,
} from "lucide-vue-next";

import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useAuthStore } from "../stores/auth";
import { useLiveQuery } from "../composables/useLiveQuery";
import { upgradesApi, formatConsulted, internetStatus, type UpgradeLogin, type LivePage } from "../upgradesApi";
import { supportApi, contractStatus } from "../supportApi";
import ContractItemsTab from "../components/ContractItemsTab.vue";
import SupportComodato from "../components/SupportComodato.vue";
import LiveQueryState from "../components/LiveQueryState.vue";
import PermanenceBadge from "../components/PermanenceBadge.vue";
import ContractFields from "../components/ContractFields.vue";
import ContractOverview from "../components/ContractOverview.vue";
import LoginRecordList from "../components/LoginRecordList.vue";
import LivePagination from "../components/LivePagination.vue";
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const module = computed(() => (route.meta.module === "support" ? "support" : "upgrades"));
const isSupport = computed(() => module.value === "support");
const fromContracts = computed(() => isSupport.value && route.query.from === "contracts");
const technicalApi = computed(() => (isSupport.value ? supportApi : upgradesApi));
const can = (permission: string) => auth.can(`${module.value}.${permission}`);
const contractId = computed(() => String(route.params.id));
const { data, loading, error, reload } = useLiveQuery((signal) => technicalApi.value.contract(contractId.value, signal));
const contract = computed(() => data.value?.contract);
const tab = ref(isSupport.value && ["logins", "equipment"].includes(String(route.query.tab)) && can("logins.view") ? "logins" : "overview");
function chooseTab(id: string) {
  tab.value = id;
  if (isSupport.value)
    router.replace({ query: { ...route.query, tab: id, loginId: ["logins", "equipment"].includes(id) ? route.query.loginId : undefined } });
}
const tabs = computed(() => [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "contacts", label: "Contatos", icon: Phone, count: contract.value?.contacts.length },
  ...(can("contract.view")
    ? [
        { id: "products", label: "Produtos", icon: Package },
        { id: "additional-services", label: "Serviços adicionais", icon: ListPlus },
      ]
    : []),
  ...(isSupport.value && can("comodato.view") ? [{ id: "comodato", label: "Comodatos", icon: Package }] : []),
  ...(can("logins.view") ? [{ id: "logins", label: "Logins e equipamentos", icon: Network }] : []),
]);
const technical = computed(() => tab.value === "logins");
const routeTab = computed(() => (route.query.tab === "equipment" ? "logins" : route.query.tab));
const loginPage = shallowRef<LivePage<UpgradeLogin> | null>(null);
const loginLoading = ref(false);
const loginError = ref("");
const page = ref(1),
  limit = ref(10),
  selectedId = ref<number | null>(null);
const linkedLogin = shallowRef<UpgradeLogin | null>(null);
const selectedLogin = computed(
  () =>
    loginPage.value?.items.find((login) => login.id === selectedId.value) ??
    (linkedLogin.value?.id === selectedId.value ? linkedLogin.value : null)
);
const requestedLoginId = computed(() => {
  const value = Number(route.query.loginId);
  return isSupport.value && Number.isSafeInteger(value) && value > 0 ? value : null;
});
let controller: AbortController | undefined;
let version = 0;
function clearLogins() {
  version++;
  controller?.abort();
  loginPage.value = null;
  linkedLogin.value = null;
  selectedId.value = null;
  loginLoading.value = false;
  loginError.value = "";
}
async function loadLogins() {
  clearLogins();
  if (!contract.value || !can("logins.view")) return;
  const current = version;
  controller = new AbortController();
  loginLoading.value = true;
  try {
    const result = await technicalApi.value.logins(
      contractId.value,
      new URLSearchParams({ page: String(page.value), limit: String(limit.value) }),
      controller.signal
    );
    if (current !== version) return;
    const requested = requestedLoginId.value;
    const linked =
      requested && !result.items.some((login) => login.id === requested)
        ? (await supportApi.login(contractId.value, requested, controller.signal)).login
        : null;
    if (current === version) {
      loginPage.value = result;
      linkedLogin.value = linked;
      selectedId.value = requested;
    }
  } catch (reason) {
    if (current === version && !controller.signal.aborted)
      loginError.value = reason instanceof Error ? reason.message : "Falha ao consultar os logins.";
  } finally {
    if (current === version) loginLoading.value = false;
  }
}
watch([contractId, module], () => {
  tab.value = isSupport.value && ["logins", "equipment"].includes(String(route.query.tab)) && can("logins.view") ? "logins" : "overview";
  page.value = 1;
  clearLogins();
  reload();
});
watch(data, (value) => {
  clearLogins();
  if (value && isSupport.value && typeof route.query.tab === "string")
    tab.value = tabs.value.find((item) => item.id === routeTab.value)?.id ?? "overview";
  if (value && technical.value) loadLogins();
});
watch(tab, () => {
  if (technical.value && !loginPage.value && !loginLoading.value) loadLogins();
});
watch(
  () => [route.query.tab, route.query.loginId],
  () => {
    if (!isSupport.value) return;
    clearLogins();
    tab.value = tabs.value.find((item) => item.id === routeTab.value)?.id ?? "overview";
    if (technical.value && contract.value) loadLogins();
  }
);
watch(tabs, (value) => {
  if (!value.some((item) => item.id === tab.value)) {
    clearLogins();
    tab.value = "overview";
  }
});
watch([page, limit], loadLogins);
onBeforeUnmount(clearLogins);
function switchTab(event: KeyboardEvent) {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  const index = tabs.value.findIndex((item) => item.id === tab.value);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.value.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.value.length) % tabs.value.length;
  chooseTab(tabs.value[next]!.id);
  (event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`#tab-${tab.value}`)?.focus();
}
const copied = ref("");
let copyTimer: ReturnType<typeof setTimeout> | undefined;
async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    copied.value = "Informação copiada.";
    toast.success("Informação copiada");
  } catch {
    copied.value = "Não foi possível copiar. Selecione o texto e copie manualmente.";
    toast.error("Falha ao copiar", copied.value);
  }
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copied.value = ""), 3000);
}
onBeforeUnmount(() => clearTimeout(copyTimer));
const yesNo = (value: boolean | null) => (value === null ? "Não informado" : value ? "Sim" : "Não");
</script>
<template>
  <RouterLink
    :to="
      isSupport
        ? fromContracts
          ? '/support/contracts'
          : contract && auth.can('support.customer.view')
            ? `/support/customers/${contract.customerId}`
            : auth.can('support.customers.view')
              ? '/support'
              : auth.home
        : auth.can('upgrades.opportunities.view')
          ? '/upgrades'
          : auth.home
    "
    class="mb-4 inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-violet-700"
    ><ArrowLeft class="h-4 w-4" aria-hidden="true" focusable="false" />{{
      isSupport ? (fromContracts ? "Voltar aos contratos" : "Voltar ao cliente") : "Voltar às oportunidades"
    }}</RouterLink
  >
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-violet-600">
        {{ isSupport ? "Validação do contrato" : "Detalhes para a oferta" }}
      </p>
      <h1 class="text-2xl font-extrabold tracking-tight">
        <FileText class="mr-2 inline h-5 w-5 align-middle" aria-hidden="true" focusable="false" />Contrato #{{ route.params.id }}
      </h1>
    </div>
    <button type="button" class="button-secondary gap-2 text-xs" :disabled="loading" @click="reload">
      <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" aria-hidden="true" focusable="false" />Atualizar detalhes
    </button>
  </div>
  <LiveQueryState :loading="loading" :error="error" @retry="reload" />
  <template v-if="contract && !loading && !error">
    <section class="panel mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div class="min-w-0">
        <h2 class="text-lg font-bold">
          <UserRound class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />{{ contract.customerName }}
        </h2>
        <p class="mt-0.5 text-xs text-slate-500">Cliente #{{ contract.customerId }} · {{ contract.planName }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span v-if="isSupport" class="rounded-md bg-slate-100 px-2 py-1 text-slate-500">{{ contractStatus(contract.contractStatus) }}</span>
        <span class="rounded-md bg-slate-50 px-2 py-1 text-slate-500">{{ internetStatus(contract.internetStatus) }}</span
        ><PermanenceBadge :contract="contract" />
      </div>
    </section>
    <CustomerQuickLinks class="mb-3" :customer-id="contract.customerId" :contract-id="Number(contractId)" />
    <p
      v-if="!contract.customerAvailable"
      role="alert"
      class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
    >
      O cadastro do cliente não foi encontrado no IXC. Os contatos desse cadastro estão indisponíveis.
    </p>
    <div class="mb-4 overflow-x-auto" role="tablist" aria-label="Informações do contrato" @keydown="switchTab">
      <div class="support-case-tabs min-w-max w-fit">
        <button
          v-for="item in tabs"
          :id="`tab-${item.id}`"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="tab === item.id"
          :aria-controls="`panel-${item.id}`"
          :tabindex="tab === item.id ? 0 : -1"
          @click="chooseTab(item.id)"
        >
          <component :is="item.icon" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" focusable="false" />{{ item.label
          }}<span v-if="item.count !== undefined" class="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{{ item.count }}</span>
        </button>
      </div>
    </div>
    <section :id="`panel-${tab}`" role="tabpanel" :aria-labelledby="`tab-${tab}`" tabindex="0">
      <template v-if="tab === 'overview'">
        <ContractOverview :contract="contract" />
        <div
          v-if="!isSupport"
          class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3"
        >
          <p class="text-xs text-violet-700">Confira os planos para preparar a próxima oferta.</p>
          <RouterLink v-if="auth.can('upgrades.plans.view')" to="/upgrades/plans" class="button-upgrades text-xs"
            >Consultar planos<ArrowUpRight class="h-3.5 w-3.5" aria-hidden="true" focusable="false"
          /></RouterLink>
        </div>
      </template>
      <template v-else-if="tab === 'contacts'">
        <div class="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section class="panel min-w-0 overflow-hidden">
            <div class="border-b border-slate-100 px-4 py-3">
              <h3 class="text-sm font-bold">
                <Phone class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Telefones e contatos
              </h3>
              <p class="mt-1 text-[11px] text-slate-500">
                Números preenchidos no contrato e no cadastro do cliente, agrupados sem repetição.
              </p>
            </div>
            <p v-if="!contract.contacts.length" class="p-4 text-sm text-slate-500">Nenhum telefone informado no IXC.</p>
            <div
              v-for="contact in contract.contacts"
              :key="contact.telUrl"
              class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 last:border-0"
            >
              <div class="min-w-0">
                <p class="text-sm font-semibold">
                  {{ contact.number
                  }}<span v-if="contact.extension" class="ml-2 text-xs font-normal text-slate-500">Ramal {{ contact.extension }}</span>
                </p>
                <p class="mt-0.5 break-words text-[11px] text-slate-500">{{ contact.labels.join(" · ") }}</p>
                <p class="mt-0.5 text-[10px] text-slate-400">{{ contact.sources.join(" · ") }}</p>
              </div>
              <div class="flex items-center gap-2">
                <a
                  :href="contact.telUrl"
                  class="rounded-md p-2 text-slate-500 hover:bg-slate-50"
                  :aria-label="`Ligar para ${contact.number}`"
                  title="Ligar"
                  ><Phone class="h-3.5 w-3.5" aria-hidden="true" focusable="false" /></a
                ><button
                  type="button"
                  class="rounded-md p-2 text-slate-500 hover:bg-slate-50"
                  :aria-label="`Copiar telefone ${contact.number}`"
                  title="Copiar número"
                  @click="copy(contact.number)"
                >
                  <Copy class="h-3.5 w-3.5" aria-hidden="true" focusable="false" /></button
                ><a
                  v-if="contact.whatsappUrl"
                  :href="contact.whatsappUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerpolicy="no-referrer"
                  class="rounded-md border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-violet-600"
                  >WhatsApp ↗</a
                >
              </div>
            </div>
          </section>
          <div class="space-y-4">
            <ContractFields
              title="Cadastro do cliente"
              :fields="[
                { label: 'Pessoa de contato', value: contract.contactName },
                { label: 'E-mail', value: contract.email },
                { label: 'Ramal cadastrado', value: contract.extension },
                { label: 'Cliente IXC', value: `#${contract.customerId}` },
              ]"
            />
            <ContractFields
              title="Endereço de instalação"
              :fields="[
                { label: 'Cidade', value: contract.city },
                { label: 'Bairro', value: contract.neighborhood },
                { label: 'Endereço', value: contract.address },
                { label: 'CEP', value: contract.installation.zip },
                { label: 'Referência', value: contract.installation.reference },
                {
                  label: 'Bloco / apartamento',
                  value: [contract.installation.building, contract.installation.apartment].filter(Boolean).join(' / ') || null,
                },
                { label: 'Usa endereço do cliente', value: yesNo(contract.installation.usesCustomerAddress) },
              ]"
            />
          </div>
        </div>
      </template>
      <ContractItemsTab
        v-else-if="(tab === 'products' || tab === 'additional-services') && can('contract.view')"
        :key="`${module}-${contractId}-${tab}`"
        :contract-id="contractId"
        :module="module"
        :kind="tab"
      />
      <SupportComodato v-else-if="isSupport && tab === 'comodato' && can('comodato.view')" :key="contractId" :contract-id="contractId" />
      <template v-else-if="technical && can('logins.view')">
        <section class="panel mb-4 overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <h3 class="text-sm font-bold">
                <Network class="mr-1.5 inline h-4 w-4" aria-hidden="true" />Logins e equipamentos<span
                  v-if="loginPage"
                  class="ml-2 text-xs font-normal text-slate-400"
                  >{{ loginPage.total }} encontrados</span
                >
              </h3>
              <p class="mt-1 text-[11px] text-slate-500">Abra um login para ver a conexão, as redes Wi-Fi e os dados do equipamento.</p>
            </div>
            <button type="button" class="button-secondary text-xs" :disabled="loginLoading" @click="loadLogins">
              <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Atualizar logins
            </button>
          </div>
          <div v-if="loginLoading || loginError" class="p-4">
            <LiveQueryState :loading="loginLoading" :error="loginError" @retry="loadLogins" />
          </div>
          <template v-else-if="loginPage">
            <LoginRecordList
              :items="loginPage.items"
              :module="module"
              :initial-login="requestedLoginId ? selectedLogin : null"
              :initial-tab="isSupport && route.query.tab === 'equipment' ? 'equipment' : 'overview'"
              @close="selectedId = null"
            />
            <p v-if="!loginPage.items.length" class="px-4 py-6 text-sm text-slate-500">
              {{
                loginPage.total ? "Não há logins nesta página. Volte à página anterior." : "Nenhum login vinculado a este contrato no IXC."
              }}
            </p>
            <LivePagination v-model:page="page" v-model:limit="limit" :total="loginPage.total" :queried-at="loginPage.queriedAt" />
          </template>
        </section>
        <p v-if="linkedLogin" class="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          O login selecionado está em outra página da listagem. Seus vínculos com este cliente e contrato foram validados no IXC.
        </p>
      </template>
    </section>
    <p role="status" aria-live="polite" class="mt-3 text-xs text-slate-500">{{ copied }}</p>
    <p class="mt-3 text-[11px] text-slate-400">
      Dados gerais consultados em {{ formatConsulted(data?.queriedAt) }} · Brasília · Consulta direta ao IXC
    </p>
  </template>
</template>
