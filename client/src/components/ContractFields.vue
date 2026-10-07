<script setup lang="ts">
import type { Component } from "vue";
import { FileText, CalendarDays, UserRound, MapPin, KeyRound, Wifi, Network, Cable } from "lucide-vue-next";
defineProps<{ title: string; icon?: Component; columns?: 1 | 2; fields: { label: string; value: string | number | null | undefined }[] }>();
const icons: Record<string, Component> = {
  "Permanência e datas": CalendarDays,
  "Cadastro do cliente": UserRound,
  "Cadastro e instalação": MapPin,
  "Endereço de instalação": MapPin,
  "Endereço cadastrado no login": MapPin,
  "Autenticação e roteador": KeyRound,
  "Redes Wi-Fi": Wifi,
  "IP e MAC": Network,
  "Conexão reportada pelo IXC": Network,
  "Dados técnicos e fibra": Cable,
};
</script>
<template>
  <section class="support-case-card min-w-0">
    <h3 class="support-case-heading">
      <component :is="icon ?? icons[title] ?? FileText" class="h-4 w-4 shrink-0" aria-hidden="true" focusable="false" />{{ title }}
    </h3>
    <dl class="grid gap-x-4 gap-y-2 text-xs" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'">
      <div v-for="field in fields" :key="field.label" class="min-w-0">
        <dt class="support-case-caption">{{ field.label }}</dt>
        <dd class="mt-0.5 break-words font-medium">
          <slot name="field" :field="field">{{ field.value ?? "Não informado" }}</slot>
        </dd>
      </div>
    </dl>
  </section>
</template>
