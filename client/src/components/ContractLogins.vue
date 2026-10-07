<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Network, RefreshCw } from "lucide-vue-next";
import { supportApi } from "../supportApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import LoginRecordList from "./LoginRecordList.vue";
import LiveQueryState from "./LiveQueryState.vue";
import LivePagination from "./LivePagination.vue";
const props = defineProps<{ contractId: string }>();
const page = ref(1),
  limit = ref(10);
const params = computed(() => new URLSearchParams({ page: String(page.value), limit: String(limit.value) }));
const { data, loading, error, reload } = useLiveQuery((signal) => supportApi.logins(props.contractId, params.value, signal));
watch([page, limit], reload);
</script>
<template>
  <section class="support-case-card !p-0 overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
      <h4 class="support-case-heading !mb-0">
        <Network aria-hidden="true" />Logins do contrato<span v-if="data" class="text-[10px] font-normal text-slate-500"
          >{{ data.total }} encontrados</span
        >
      </h4>
      <button type="button" class="button-secondary" :disabled="loading" @click="reload">
        <RefreshCw aria-hidden="true" />Atualizar logins
      </button>
    </div>
    <LiveQueryState :loading="loading" :error="error" @retry="reload" />
    <template v-if="data && !loading && !error"
      ><LoginRecordList :items="data.items" module="support" />
      <p v-if="!data.items.length" class="p-6 text-center text-xs text-slate-500">Nenhum login nesta página do contrato.</p>
      <LivePagination v-model:page="page" v-model:limit="limit" :total="data.total" :queried-at="data.queriedAt"
    /></template>
  </section>
</template>
