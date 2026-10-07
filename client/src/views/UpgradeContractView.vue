<script setup lang="ts">
import { toast } from "../notifications/toast";
import {
  FileText,
  Network,
  Router,
  UserRound,
  ArrowLeft,
  ArrowUpRight,
  Copy,
  Phone,
  RefreshCw,
  LayoutDashboard,
  Package,
  ChevronLeft,
} from "lucide-vue-next";

import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useAuthStore } from "../stores/auth";
import { useLiveQuery } from "../composables/useLiveQuery";
import { upgradesApi, formatConsulted, internetStatus, type UpgradeLogin, type LivePage } from "../upgradesApi";
import { supportApi, contractStatus } from "../supportApi";
import SupportComodato from "../components/SupportComodato.vue";
import LiveQueryState from "../components/LiveQueryState.vue";
import PermanenceBadge from "../components/PermanenceBadge.vue";
import ContractFields from "../components/ContractFields.vue";
import ContractOverview from "../components/ContractOverview.vue";
import LoginDetails from "../components/LoginDetails.vue";
import LoginAccessMenu from "../components/LoginAccessMenu.vue";
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const module = computed(() => (route.meta.module === "support" ? "support" : "upgrades"));
const isSupport = computed(() => module.value === "support");
const technicalApi = computed(() => (isSupport.value ? supportApi : upgradesApi));
const can = (permission: string) => auth.can(`${module.value}.${permission}`);
const contractId = computed(() => String(route.params.id));
const { data, loading, error, reload } = useLiveQuery((signal) => technicalApi.value.contract(contractId.value, signal));
const contract = computed(() => data.value?.contract);
const tab = ref(isSupport.value && route.query.tab === "logins" && can("logins.view") ? "logins" : "overview");
function chooseTab(id: string) {
  tab.value = id;
  if (isSupport.value)
    router.replace({ query: { ...route.query, tab: id, loginId: ["logins", "equipment"].includes(id) ? route.query.loginId : undefined } });
}
function chooseLogin(id: number) {
  selectedId.value = id;
  if (isSupport.value) router.replace({ query: { ...route.query, tab: tab.value, loginId: String(id) } });
}
const tabs = computed(() => [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "contacts", label: "Contatos", icon: Phone, count: contract.value?.contacts.length },
  ...(isSupport.value && can("comodato.view") ? [{ id: "comodato", label: "Comodatos", icon: Package }] : []),
  ...(can("logins.view")
    ? [
        { id: "logins", label: "Logins", icon: Network },
        { id: "equipment", label: "Conexão e equipamento", icon: Router },
      ]
    : []),
]);
const technical = computed(() => ["logins", "equipment"].includes(tab.value));
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
      selectedId.value = requested ?? result.items[0]?.id ?? null;
    }
  } catch (reason) {
    if (current === version && !controller.signal.aborted)
      loginError.value = reason instanceof Error ? reason.message : "Falha ao consultar os logins.";
  } finally {
    if (current === version) loginLoading.value = false;
  }
}
watch([contractId, module], () => {
  tab.value = isSupport.value && route.query.tab === "logins" && can("logins.view") ? "logins" : "overview";
  page.value = 1;
  clearLogins();
  reload();
});
watch(data, (value) => {
  clearLogins();
  if (value && isSupport.value && typeof route.query.tab === "string")
    tab.value = tabs.value.find((item) => item.id === route.query.tab)?.id ?? "overview";
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
    tab.value = tabs.value.find((item) => item.id === route.query.tab)?.id ?? "overview";
    if (technical.value && contract.value) loadLogins();
  }
);
watch(tabs, (value) => {
  if (!value.some((item) => item.id === tab.value)) {
    clearLogins();
    tab.value = "overview";
  }
});
watch(page, loadLogins);
function changeLimit() {
  if (page.value !== 1) page.value = 1;
  else loadLogins();
}
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
const statusLabel = (value: UpgradeLogin["status"]) => ({ online: "Online", offline: "Offline", unknown: "Sem status" })[value];
</script>
<template>
  <RouterLink
    :to="
      isSupport
        ? contract && auth.can('support.customer.view')
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
      isSupport ? "Voltar ao cliente" : "Voltar às oportunidades"
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
      <SupportComodato v-else-if="isSupport && tab === 'comodato' && can('comodato.view')" :key="contractId" :contract-id="contractId" />
      <template v-else-if="technical && can('logins.view')">
        <section class="panel mb-4 overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <h3 class="text-sm font-bold">
                Logins vinculados ao contrato<span v-if="loginPage" class="ml-2 text-xs font-normal text-slate-400"
                  >{{ loginPage.total }} encontrados</span
                >
              </h3>
              <p class="mt-1 text-[11px] text-slate-500">Inclui ativos e inativos. Selecione um login para consultar seus dados.</p>
            </div>
            <button type="button" class="button-secondary text-xs" :disabled="loginLoading" @click="loadLogins">Atualizar logins</button>
          </div>
          <div v-if="loginLoading || loginError" class="p-4">
            <LiveQueryState :loading="loginLoading" :error="loginError" @retry="loadLogins" />
          </div>
          <template v-else-if="loginPage">
            <div v-if="tab === 'logins'" class="overflow-x-auto">
              <table class="w-full min-w-[650px] text-left text-xs">
                <thead class="bg-slate-50 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th class="px-4 py-2">Login / ID</th>
                    <th class="px-3 py-2">Cadastro</th>
                    <th class="px-3 py-2">Conexão</th>
                    <th class="px-3 py-2">Autenticação</th>
                    <th class="px-3 py-2">IP</th>
                    <th class="px-3 py-2">MAC</th>
                    <th v-if="can('equipment.access')" class="px-4 py-2 text-right">Acesso</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="login in loginPage.items"
                    :key="login.id"
                    class="border-t border-slate-100"
                    :class="selectedId === login.id ? 'bg-violet-50' : ''"
                  >
                    <td class="px-4 py-2">
                      <button
                        type="button"
                        :aria-pressed="selectedId === login.id"
                        :aria-label="`Selecionar login ${login.login ?? login.id}`"
                        class="text-left font-semibold text-violet-700 hover:underline"
                        @click="chooseLogin(login.id)"
                      >
                        {{ login.login ?? "Login não informado"
                        }}<span class="ml-1.5 text-[10px] font-normal text-slate-400">#{{ login.id }}</span>
                      </button>
                    </td>
                    <td class="px-3 py-2">{{ login.active === null ? "Não informado" : login.active ? "Ativo" : "Inativo" }}</td>
                    <td class="px-3 py-2">
                      <span class="inline-flex items-center gap-1.5"
                        ><span
                          class="h-1.5 w-1.5 rounded-full"
                          :class="
                            login.status === 'online' ? 'bg-emerald-500' : login.status === 'offline' ? 'bg-amber-500' : 'bg-slate-400'
                          "
                        />{{ statusLabel(login.status) }}</span
                      >
                    </td>
                    <td class="px-3 py-2">{{ login.authentication ?? "—" }}</td>
                    <td class="whitespace-nowrap px-3 py-2 font-mono">{{ login.ip ?? "Não informado" }}</td>
                    <td class="whitespace-nowrap px-3 py-2 font-mono">{{ login.mac ?? "—" }}</td>
                    <td v-if="can('equipment.access')" class="px-4 py-1.5 text-right">
                      <LoginAccessMenu
                        :module="module"
                        :contract-id="contractId"
                        :login-id="login.id"
                        :ip="login.accessTargets[0]?.ip ?? null"
                        :password-available="login.secretAvailability.router1"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else-if="loginPage.items.length" class="flex flex-wrap items-center gap-3 px-4 py-3">
              <label class="flex min-w-0 flex-1 items-center gap-3 text-xs text-slate-500">
                Login
                <select
                  v-model.number="selectedId"
                  class="input max-w-md"
                  aria-label="Login para consultar equipamento"
                  @change="selectedId && chooseLogin(selectedId)"
                >
                  <option v-if="linkedLogin" :value="linkedLogin.id">
                    {{ linkedLogin.login ?? "Login não informado" }} · #{{ linkedLogin.id }} · vínculo selecionado
                  </option>
                  <option v-for="login in loginPage.items" :key="login.id" :value="login.id">
                    {{ login.login ?? "Login não informado" }} · #{{ login.id }} · {{ statusLabel(login.status) }}
                  </option>
                </select>
              </label>
              <span v-if="selectedLogin" class="text-xs text-slate-500">{{
                selectedLogin.active === null ? "Cadastro não informado" : selectedLogin.active ? "Login ativo" : "Login inativo"
              }}</span>
            </div>
            <p v-if="!loginPage.items.length" class="px-4 py-6 text-sm text-slate-500">
              {{
                loginPage.total ? "Não há logins nesta página. Volte à página anterior." : "Nenhum login vinculado a este contrato no IXC."
              }}
            </p>
            <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-500">
              <span>Consultado em {{ formatConsulted(loginPage.queriedAt) }} · Brasília</span>
              <div class="flex items-center gap-2">
                <select
                  v-model.number="limit"
                  aria-label="Logins por página"
                  class="rounded-md border border-slate-200 bg-white px-2 py-1"
                  @change="changeLimit"
                >
                  <option :value="10">10 por página</option>
                  <option :value="25">25 por página</option></select
                ><span>Página {{ page }} de {{ Math.max(1, Math.ceil(loginPage.total / limit)) }}</span
                ><button type="button" class="button-secondary text-[11px]" :disabled="page === 1" @click="page--">
                  <ChevronLeft class="inline h-3.5 w-3.5 shrink-0 align-middle" aria-hidden="true" focusable="false" /> Anterior</button
                ><button type="button" class="button-secondary text-[11px]" :disabled="page * limit >= loginPage.total" @click="page++">
                  Próxima
                </button>
              </div>
            </div>
          </template>
        </section>
        <p v-if="linkedLogin" class="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          O login selecionado está em outra página da listagem. Seus vínculos com este cliente e contrato foram validados no IXC.
        </p>
        <LoginDetails
          v-if="selectedLogin"
          :key="`${module}-${contractId}-${selectedLogin.id}-${tab}`"
          :module="module"
          :contract-id="contractId"
          :login="selectedLogin"
          :initial-tab="tab === 'equipment' ? 'equipment' : 'overview'"
        />
      </template>
    </section>
    <p role="status" aria-live="polite" class="mt-3 text-xs text-slate-500">{{ copied }}</p>
    <p class="mt-3 text-[11px] text-slate-400">
      Dados gerais consultados em {{ formatConsulted(data?.queriedAt) }} · Brasília · Consulta direta ao IXC
    </p>
  </template>
</template>
