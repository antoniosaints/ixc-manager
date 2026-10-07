<script setup lang="ts">
import { computed } from "vue";
import { Headset, ChartNoAxesCombined, Layers3, TrendingUp, Settings2, Banknote } from "lucide-vue-next";
import { useRoute } from "vue-router";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const route = useRoute();
// Register new modules here and identify their routes with meta.module.
const modules = computed(() => [
  ...(auth.home !== "/no-access" &&
  ["churn.dashboard", "churn.analytics", "churn.attention.view", "churn.resolved.view", "churn.processes.view"].some((permission) =>
    auth.can(permission)
  )
    ? [
        {
          id: "churn",
          label: "Churn",
          description: "Prevenção de churn",
          icon: ChartNoAxesCombined,
          to: auth.can("churn.dashboard")
            ? "/"
            : auth.can("churn.analytics")
              ? "/analytics"
              : auth.can("churn.attention.view")
                ? "/attention"
                : auth.can("churn.resolved.view")
                  ? "/resolved"
                  : "/sync",
        },
      ]
    : []),
  ...(auth.can("upgrades.opportunities.view") || auth.can("upgrades.plans.view")
    ? [
        {
          id: "upgrades",
          label: "Upgrades",
          description: "Oportunidades de upgrade",
          icon: TrendingUp,
          to: auth.can("upgrades.opportunities.view") ? "/upgrades" : "/upgrades/plans",
        },
      ]
    : []),
  ...(auth.can("support.customers.view")
    ? [{ id: "support", label: "Suporte", description: "Consulta e validação de clientes", icon: Headset, to: "/support" }]
    : []),
  ...(auth.can("finance.dashboard.view")
    ? [{ id: "finance", label: "Financeiro", description: "Análise de receitas e despesas", icon: Banknote, to: "/finance" }]
    : []),
  ...(auth.isAdmin
    ? [{ id: "settings", label: "Configurações", description: "Administração do sistema", icon: Settings2, to: "/settings" }]
    : []),
]);
const activeModule = computed(() => route.meta.module ?? "churn");
</script>

<template>
  <aside class="app-sidebar" aria-label="Módulos do sistema">
    <div class="app-sidebar-heading" title="Módulos do sistema">
      <Layers3 class="h-5 w-5" aria-hidden="true" focusable="false" />
      <span class="sr-only">Módulos do sistema</span>
    </div>
    <nav class="app-module-list" aria-label="Funcionalidades">
      <RouterLink
        v-for="module in modules"
        :key="module.id"
        :to="module.to"
        :aria-label="module.label"
        :aria-current="activeModule === module.id ? 'true' : undefined"
        class="app-module-link"
        :class="{
          'app-module-active': activeModule === module.id,
          'app-module-support': activeModule === module.id && module.id === 'support',
          'app-module-finance': activeModule === module.id && module.id === 'finance',
          'app-module-upgrades': activeModule === module.id && module.id === 'upgrades',
        }"
      >
        <component :is="module.icon" class="h-5 w-5 shrink-0" aria-hidden="true" focusable="false" />
        <span class="app-module-label" aria-hidden="true">{{ module.label }}</span>
      </RouterLink>
    </nav>
  </aside>
</template>
