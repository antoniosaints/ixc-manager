<script setup lang="ts">
import { Settings2, Palette, ShieldCheck, Users } from "lucide-vue-next";
</script>
<template>
  <div class="compact-view">
    <section class="mb-4">
      <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-cyan-700">Administração</p>
      <h1 class="text-2xl font-extrabold tracking-tight">
        <Settings2 class="mr-2 inline h-5 w-5 align-middle" aria-hidden="true" focusable="false" />Configurações
      </h1>
      <p class="mt-1 text-xs text-slate-500">Aparência, usuários e perfis de acesso. Área exclusiva do administrador.</p>
    </section>
    <nav class="mb-4 flex flex-wrap gap-2" aria-label="Configurações">
      <RouterLink to="/settings/appearance" class="settings-tab"
        ><Palette class="h-4 w-4" aria-hidden="true" focusable="false" />Aparência</RouterLink
      ><RouterLink to="/settings/users" class="settings-tab"
        ><Users class="h-4 w-4" aria-hidden="true" focusable="false" />Usuários</RouterLink
      ><RouterLink to="/settings/profiles" class="settings-tab"
        ><ShieldCheck class="h-4 w-4" aria-hidden="true" focusable="false" />Perfis e permissões</RouterLink
      >
    </nav>
    <RouterView />
  </div>
</template>
<style scoped>
.settings-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid var(--appearance-border);
  border-radius: 0.65rem;
  padding: 0.5rem 0.8rem;
  font-size: 0.75rem;
  background: var(--appearance-surface);
}
.settings-tab.router-link-active {
  background: var(--appearance-primary-tint);
  color: var(--appearance-primary-text);
  border-color: var(--appearance-primary);
}
</style>
