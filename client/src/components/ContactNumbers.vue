<script setup lang="ts">
import { Phone, MessageSquareText } from "lucide-vue-next";
import type { ContractContact } from "../upgradesApi";
defineProps<{ numbers: ContractContact[] }>();
</script>
<template>
  <div class="grid gap-x-4 sm:grid-cols-2">
    <div
      v-for="contact in numbers"
      :key="contact.telUrl"
      class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-1.5 text-xs"
    >
      <div class="min-w-0">
        <a
          :href="contact.telUrl"
          :aria-label="`Ligar para ${contact.number}`"
          class="inline-flex items-center gap-1 font-semibold hover:underline"
          ><Phone class="h-3 w-3" aria-hidden="true" />{{ contact.number }}</a
        >
        <p class="text-[10px] text-slate-500">
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
        class="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600"
        ><MessageSquareText class="h-3 w-3" aria-hidden="true" />WhatsApp ↗</a
      >
    </div>
  </div>
  <p v-if="!numbers.length" class="text-xs text-slate-500">Nenhum telefone informado no IXC.</p>
</template>
