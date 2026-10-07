<script setup lang="ts">
import { formatConsulted } from "../upgradesApi";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
defineProps<{ total: number; page: number; limit: number; queriedAt: string }>();
const emit = defineEmits<{ "update:page": [number]; "update:limit": [number] }>();
function change(event: Event) {
  emit("update:page", 1);
  emit("update:limit", Number((event.target as HTMLSelectElement).value));
}
</script>
<template>
  <footer class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-500">
    <span>Consultado em {{ formatConsulted(queriedAt) }} · Brasília</span>
    <div class="flex flex-wrap items-center gap-2">
      <select
        :value="limit"
        aria-label="Registros por página"
        class="rounded-md border border-slate-200 bg-white px-2 py-1"
        @change="change"
      >
        <option :value="10">10 por página</option>
        <option :value="25">25 por página</option>
      </select>
      <span>Página {{ page }} de {{ Math.max(1, Math.ceil(total / limit)) }}</span>
      <button type="button" class="button-secondary text-[11px]" :disabled="page === 1" @click="emit('update:page', page - 1)">
        <ChevronLeft class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />Anterior
      </button>
      <button type="button" class="button-secondary text-[11px]" :disabled="page * limit >= total" @click="emit('update:page', page + 1)">
        Próxima<ChevronRight class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />
      </button>
    </div>
  </footer>
</template>
