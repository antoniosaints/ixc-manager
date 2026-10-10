<script setup lang="ts">
import {
  LayoutDashboard,
  BarChart3,
  RefreshCw,
  Sun,
  Moon,
  LogOut,
  CheckCircle2,
  Siren,
  Users,
  TrendingUp,
  PackageOpen,
  Banknote,
  ReceiptText,
  ListFilter,
  Cable,
  Network,
  Wrench,
  FileText,
} from "lucide-vue-next";
import { useAuthStore } from "./stores/auth";
import AppSidebar from "./components/AppSidebar.vue";
import ToastHost from "./components/ToastHost.vue";
import { toast } from "./notifications/toast";
import { computed, provide, ref, watch } from "vue";
import { useRoute } from "vue-router";

import { upgradesRefreshKey } from "./composables/useLiveQuery";
import { useAppearanceStore } from "./stores/appearance";
const appearance = useAppearanceStore();
void appearance.initialize();
const auth = useAuthStore();
const route = useRoute();
watch(
  () => route.fullPath,
  () => toast.cancelConfirmations()
);
const isAnalytics = computed(() => route.meta.module === "analytics");
const isUpgrades = computed(() => route.meta.module === "upgrades");
const isNetwork = computed(() => route.meta.module === "network");
const isFinance = computed(() => route.meta.module === "finance");
const isCollections = computed(() => route.meta.module === "collections");
const isSupport = computed(() => route.meta.module === "support");
const isSettings = computed(() => route.meta.module === "settings");
watch(
  [isUpgrades, isSettings, isSupport, isFinance, isCollections, isNetwork, isAnalytics],
  ([upgrades, settings, support, finance, collections, network, analytics]) => {
    document.title = analytics
      ? "Analytics CAS"
      : network
        ? "Rede CAS"
        : collections
          ? "Cobranças CAS"
          : finance
            ? "Financeiro CAS"
            : settings
              ? "Configurações CAS"
              : support
                ? "Suporte CAS"
                : upgrades
                  ? "Upgrades CAS"
                  : "Retenção CAS";
  },
  { immediate: true }
);
const upgradesRefresh = ref(0);
provide(upgradesRefreshKey, upgradesRefresh);
const logout = async () => {
  await auth.signOut();
  window.location.assign("/login");
};
</script>
<template>
  <RouterView v-if="$route.meta.public" />
  <div
    v-else
    class="min-h-screen"
    :data-module="
      isAnalytics
        ? 'analytics'
        : isNetwork
          ? 'network'
          : isCollections
            ? 'collections'
            : isFinance
              ? 'finance'
              : isSettings
                ? 'settings'
                : isSupport
                  ? 'support'
                  : isUpgrades
                    ? 'upgrades'
                    : 'churn'
    "
  >
    <a href="#main-content" class="skip-link">Ir para o conteúdo principal</a>
    <header class="border-b border-slate-200 bg-white">
      <div class="app-header-inner">
        <RouterLink
          :to="
            isAnalytics
              ? '/overview'
              : isNetwork
                ? auth.can('network.boxes.view')
                  ? '/network'
                  : auth.can('network.logins.list')
                    ? '/network/logins'
                    : auth.can('network.onus.view')
                      ? '/network/onus'
                      : '/network/pon'
                : isCollections
                  ? '/collections'
                  : isFinance
                    ? '/finance'
                    : isSettings
                      ? '/settings'
                      : isSupport
                        ? auth.can('support.customers.view')
                          ? '/support'
                          : auth.can('support.contract.view')
                            ? '/support/contracts'
                            : auth.can('support.orders.view')
                              ? '/support/orders'
                              : auth.home
                        : isUpgrades
                          ? auth.can('upgrades.opportunities.view')
                            ? '/upgrades'
                            : auth.can('upgrades.plans.view')
                              ? '/upgrades/plans'
                              : auth.home
                          : auth.home
          "
          class="flex min-w-0 items-center gap-3"
          ><img :src="appearance.value.logo" alt="CAS" class="h-10 w-auto max-w-[112px] rounded-lg object-contain" /><span class="min-w-0"
            ><strong class="block truncate leading-4">{{
              isAnalytics
                ? "ANALYTICS"
                : isNetwork
                  ? "REDE"
                  : isCollections
                    ? "COBRANÇAS"
                    : isFinance
                      ? "FINANCEIRO"
                      : isSettings
                        ? "CONFIGURAÇÕES"
                        : isSupport
                          ? "SUPORTE"
                          : isUpgrades
                            ? "UPGRADES"
                            : "RETENÇÃO"
            }}</strong
            ><small class="block truncate text-slate-500">{{
              isAnalytics
                ? "CAS · gestão do provedor"
                : isNetwork
                  ? "CAS · infraestrutura e conexões"
                  : isCollections
                    ? "CAS · gestão de pendências"
                    : isFinance
                      ? "CAS · análise financeira"
                      : isSettings
                        ? "CAS · administração do sistema"
                        : isSupport
                          ? "CAS · atendimento e validação"
                          : isUpgrades
                            ? "CAS · evolução de planos"
                            : "CAS · inteligência de churn"
            }}</small></span
          ></RouterLink
        >
        <nav v-if="isAnalytics" class="app-header-nav flex items-center gap-2 text-sm font-medium" aria-label="Navegação de Analytics">
          <RouterLink
            to="/overview"
            class="rounded-lg px-3 py-2"
            :style="{ background: 'var(--appearance-primary-tint)', color: 'var(--appearance-primary-text)' }"
            aria-current="page"
            ><LayoutDashboard class="mr-1 inline h-4 w-4" aria-hidden="true" />Visão geral</RouterLink
          >
          <button type="button" class="button-primary ml-2 !px-3 !py-2" @click="upgradesRefresh++">
            <RefreshCw class="h-4 w-4" aria-hidden="true" />Atualizar consulta
          </button>
        </nav>
        <nav v-else-if="isNetwork" class="app-header-nav flex items-center gap-2 text-sm font-medium" aria-label="Navegação de Rede">
          <RouterLink
            v-if="auth.can('network.boxes.view')"
            to="/network"
            class="rounded-lg px-3 py-2"
            :class="route.path === '/network' ? 'network-nav-active' : ''"
            :aria-current="route.path === '/network' ? 'page' : undefined"
            ><Cable class="mr-1 inline h-4 w-4" aria-hidden="true" />Caixas de atendimento</RouterLink
          ><RouterLink
            v-if="auth.can('network.logins.list')"
            to="/network/logins"
            class="rounded-lg px-3 py-2"
            :class="route.path === '/network/logins' ? 'network-nav-active' : ''"
            :aria-current="route.path === '/network/logins' ? 'page' : undefined"
            ><Network class="mr-1 inline h-4 w-4" aria-hidden="true" />Logins</RouterLink
          ><RouterLink
            v-if="auth.can('network.onus.view')"
            to="/network/onus"
            class="rounded-lg px-3 py-2"
            :class="route.path === '/network/onus' ? 'network-nav-active' : ''"
            :aria-current="route.path === '/network/onus' ? 'page' : undefined"
            ><Cable class="mr-1 inline h-4 w-4" aria-hidden="true" />ONUs</RouterLink
          ><RouterLink
            v-if="auth.can('network.pon.view')"
            to="/network/pon"
            class="rounded-lg px-3 py-2"
            :class="route.path === '/network/pon' ? 'network-nav-active' : ''"
            :aria-current="route.path === '/network/pon' ? 'page' : undefined"
            ><Network class="mr-1 inline h-4 w-4" aria-hidden="true" />Monitor PON</RouterLink
          ><button type="button" class="button-primary ml-2 !px-3 !py-2" @click="upgradesRefresh++">
            <RefreshCw class="h-4 w-4" aria-hidden="true" />Atualizar consulta
          </button>
        </nav>
        <nav
          v-else-if="isCollections"
          class="app-header-nav flex items-center gap-2 text-sm font-medium"
          aria-label="Navegação de Cobranças"
        >
          <RouterLink to="/collections" class="collections-nav-active rounded-lg px-3 py-2"
            ><ReceiptText class="mr-1 inline h-4 w-4" aria-hidden="true" />Clientes</RouterLink
          >
          <button type="button" @click="upgradesRefresh++" class="button-primary ml-2 !px-3 !py-2">
            <RefreshCw class="h-4 w-4" aria-hidden="true" />Atualizar consulta
          </button>
        </nav>
        <nav v-else-if="isFinance" class="app-header-nav flex items-center gap-2 text-sm font-medium" aria-label="Navegação do Financeiro">
          <RouterLink
            :to="{ path: '/finance', query: route.query }"
            class="rounded-lg px-3 py-2 hover:bg-emerald-50"
            :class="route.path === '/finance' ? 'finance-nav-active' : ''"
            :aria-current="route.path === '/finance' ? 'page' : undefined"
            ><Banknote class="mr-1 inline h-4 w-4" aria-hidden="true" focusable="false" />Painel</RouterLink
          >
          <RouterLink
            :to="{ path: '/finance/list', query: route.query }"
            class="rounded-lg px-3 py-2 hover:bg-emerald-50"
            :class="route.path === '/finance/list' ? 'finance-nav-active' : ''"
            :aria-current="route.path === '/finance/list' ? 'page' : undefined"
            ><ListFilter class="mr-1 inline h-4 w-4" aria-hidden="true" focusable="false" />Lista</RouterLink
          >
          <button type="button" @click="upgradesRefresh++" class="button-primary ml-2 !px-3 !py-2">
            <RefreshCw class="h-4 w-4" aria-hidden="true" focusable="false" />Atualizar consulta
          </button>
        </nav>
        <nav v-else-if="isUpgrades" class="app-header-nav flex items-center gap-2 text-sm font-medium" aria-label="Navegação de Upgrades">
          <RouterLink
            v-if="auth.can('upgrades.opportunities.view')"
            to="/upgrades"
            class="rounded-lg px-3 py-2 hover:bg-violet-50"
            :class="route.path !== '/upgrades/plans' ? 'bg-violet-50 text-violet-700' : ''"
            ><TrendingUp class="mr-1 inline h-4 w-4" aria-hidden="true" focusable="false" />Oportunidades</RouterLink
          >
          <RouterLink
            v-if="auth.can('upgrades.plans.view')"
            to="/upgrades/plans"
            class="rounded-lg px-3 py-2 hover:bg-violet-50"
            :class="route.path === '/upgrades/plans' ? 'bg-violet-50 text-violet-700' : ''"
            ><PackageOpen class="mr-1 inline h-4 w-4" aria-hidden="true" focusable="false" />Planos</RouterLink
          >
          <button type="button" @click="upgradesRefresh++" class="button-upgrades ml-2 !px-3 !py-2">
            <RefreshCw class="h-4 w-4" aria-hidden="true" focusable="false" />Atualizar consulta
          </button>
        </nav>
        <nav v-else-if="isSupport" class="app-header-nav flex items-center gap-2 text-sm font-medium" aria-label="Navegação de Suporte">
          <RouterLink
            v-if="auth.can('support.customers.view')"
            to="/support"
            class="rounded-lg px-3 py-2 hover:bg-slate-100"
            :class="{ 'support-nav-active': route.path === '/support' || route.path.startsWith('/support/customers/') }"
            ><Users class="mr-1 inline h-4 w-4" aria-hidden="true" focusable="false" />Clientes</RouterLink
          >
          <RouterLink
            v-if="auth.can('support.contract.view')"
            to="/support/contracts"
            class="rounded-lg px-3 py-2 hover:bg-slate-100"
            :class="{ 'support-nav-active': route.path.startsWith('/support/contracts') }"
          >
            <FileText class="mr-1 inline h-4 w-4" aria-hidden="true" />Contratos
          </RouterLink>
          <RouterLink
            v-if="auth.can('support.orders.view')"
            to="/support/orders"
            class="rounded-lg px-3 py-2 hover:bg-slate-100"
            :class="{ 'support-nav-active': route.path === '/support/orders' }"
          >
            <Wrench class="mr-1 inline h-4 w-4" aria-hidden="true" />Ordens de serviço
          </RouterLink>
          <button type="button" @click="upgradesRefresh++" class="button-primary ml-2 !px-3 !py-2">
            <RefreshCw class="h-4 w-4" aria-hidden="true" focusable="false" />Atualizar consulta
          </button>
        </nav>
        <nav v-else-if="!isSettings" class="app-header-nav flex items-center gap-2 text-sm font-medium" aria-label="Navegação do Churn">
          <RouterLink v-if="auth.canViewDashboard" to="/" class="rounded-lg px-3 py-2 hover:bg-slate-100"
            ><LayoutDashboard class="mr-1 inline h-4 w-4" aria-hidden="true" focusable="false" /> Painel</RouterLink
          ><RouterLink v-if="auth.can('churn.analytics')" to="/analytics" class="rounded-lg px-3 py-2 hover:bg-slate-100"
            ><BarChart3 class="mr-1 inline h-4 w-4" aria-hidden="true" focusable="false" /> Análises</RouterLink
          ><RouterLink v-if="auth.can('churn.attention.view')" to="/attention" class="rounded-lg px-3 py-2 hover:bg-slate-100"
            ><Siren class="mr-1 inline h-4 w-4" aria-hidden="true" focusable="false" /> Atenção</RouterLink
          ><RouterLink v-if="auth.can('churn.resolved.view')" to="/resolved" class="rounded-lg px-3 py-2 hover:bg-slate-100"
            ><CheckCircle2 class="mr-1 inline h-4 w-4" aria-hidden="true" focusable="false" /> Resolvidos</RouterLink
          >
        </nav>
        <div class="app-header-actions flex shrink-0 items-center gap-1">
          <button
            type="button"
            @click="appearance.toggle()"
            :aria-label="appearance.dark ? 'Ativar modo claro' : 'Ativar modo escuro'"
            :title="appearance.dark ? 'Modo claro' : 'Modo escuro'"
            class="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <Sun v-if="appearance.dark" class="h-4 w-4" aria-hidden="true" focusable="false" /><Moon
              v-else
              class="h-4 w-4"
              aria-hidden="true"
              focusable="false"
            />
          </button>
          <button type="button" @click="logout" aria-label="Sair" title="Sair" class="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <LogOut class="h-4 w-4" aria-hidden="true" focusable="false" />
          </button>
        </div>
      </div>
    </header>
    <div class="app-workspace">
      <AppSidebar />
      <main id="main-content" class="app-main" tabindex="-1"><RouterView /></main>
    </div>
  </div>
  <ToastHost />
</template>
