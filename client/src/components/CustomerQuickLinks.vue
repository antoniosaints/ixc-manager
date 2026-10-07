<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { UserRound, BarChart3, Banknote } from "lucide-vue-next";
import { useAuthStore } from "../stores/auth";
import RecordQuickLink from "./RecordQuickLink.vue";
const props = withDefaults(defineProps<{ customerId: number; contractId?: number; showCollections?: boolean }>(), {
  showCollections: true,
});
const auth = useAuthStore(),
  route = useRoute();
const valid = computed(() => Number.isSafeInteger(props.customerId) && props.customerId > 0);
const available = computed(
  () =>
    valid.value &&
    ((auth.can("support.customer.view") && route.path !== `/support/customers/${props.customerId}`) ||
      (auth.can("churn.customer.view") && route.path !== `/customers/${props.customerId}`) ||
      (props.showCollections && auth.can("collections.customer.view") && route.meta.module !== "collections") ||
      (auth.can("finance.dashboard.view") && route.meta.module !== "finance"))
);
</script>
<template>
  <nav v-if="available" class="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Acessos rápidos do cliente">
    <RouterLink
      v-if="auth.can('support.customer.view') && route.path !== `/support/customers/${customerId}`"
      :to="`/support/customers/${customerId}`"
      class="record-quick-link"
      ><UserRound aria-hidden="true" />Cliente no Suporte</RouterLink
    >
    <RouterLink
      v-if="auth.can('churn.customer.view') && route.path !== `/customers/${customerId}`"
      :to="{ path: `/customers/${customerId}`, query: contractId ? { contractId } : {} }"
      class="record-quick-link"
      ><BarChart3 aria-hidden="true" />Análise de churn</RouterLink
    >
    <RecordQuickLink
      v-if="showCollections && route.meta.module !== 'collections'"
      :target="{ kind: 'collection', id: customerId }"
      label="Ver cobranças"
    />
    <RouterLink
      v-if="auth.can('finance.dashboard.view') && route.meta.module !== 'finance'"
      :to="{
        path: '/finance/list',
        query: {
          tab: 'pending',
          kind: 'receivable',
          scope: 'aging',
          searchBy: 'partyId',
          search: String(customerId),
          receivableScope: 'active',
        },
      }"
      class="record-quick-link"
      ><Banknote aria-hidden="true" />Títulos no Financeiro</RouterLink
    >
  </nav>
</template>
