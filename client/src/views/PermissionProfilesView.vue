<script setup lang="ts">
import { toast } from "../notifications/toast";
import { ShieldCheck, Plus, Save, X, RotateCcw } from "lucide-vue-next";

import { computed, onMounted, reactive, ref } from "vue";

import { settingsApi, type AccessCatalog, type AccessProfile } from "../settingsApi";
const access = ref<AccessCatalog>(),
  error = ref(""),
  saving = ref(false),
  editing = ref(false),
  id = ref<number>();
const form = reactive({ name: "", description: "", permissions: [] as string[] });
const groups = computed(() => [...new Set(access.value?.catalog.map((item) => item.group) ?? [])]);
async function load() {
  try {
    access.value = await settingsApi.access();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Não foi possível carregar.";
  }
}
function edit(profile?: AccessProfile) {
  id.value = profile?.id;
  Object.assign(form, {
    name: profile?.name ?? "",
    description: profile?.description ?? "",
    permissions: [...(profile?.permissions ?? [])],
  });
  error.value = "";
  editing.value = true;
}
async function save() {
  saving.value = true;
  error.value = "";
  try {
    await settingsApi.saveProfile({ ...form }, id.value);
    toast.success(id.value ? "Perfil atualizado" : "Perfil criado");
    editing.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Não foi possível salvar.";
    toast.error("Falha ao salvar perfil", error.value);
  } finally {
    saving.value = false;
  }
}
function preset(key: string) {
  const preset = access.value?.presets.find((item) => item.key === key);
  form.permissions = [...(preset?.permissions ?? access.value?.defaults[key] ?? [])];
  if (!id.value && !form.name && preset) Object.assign(form, { name: preset.name, description: preset.description });
}
onMounted(load);
</script>
<template>
  <section class="panel overflow-hidden">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <div>
        <h2 class="text-sm font-bold">
          <ShieldCheck class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Perfis de acesso
        </h2>
        <p class="mt-1 text-xs text-slate-500">Permissões por tela e ação, reutilizáveis entre usuários.</p>
      </div>
      <button type="button" class="button-primary" @click="edit()">
        <Plus class="h-4 w-4" aria-hidden="true" focusable="false" />Novo perfil
      </button>
    </header>
    <div v-if="!access && !error" class="p-5 text-xs text-slate-500">Carregando perfis…</div>
    <div v-else-if="access" class="relative overflow-x-auto">
      <table class="compact-table min-w-[500px]">
        <thead>
          <tr>
            <th>Perfil</th>
            <th>Permissões</th>
            <th>Usuários</th>
            <th><span class="sr-only">Editar perfil</span></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="profile in access.profiles" :key="profile.id">
            <td>
              <strong>{{ profile.name }}</strong>
              <p class="compact-secondary">{{ profile.description }}</p>
            </td>
            <td>{{ profile.permissions.length }} de {{ access.catalog.length }}</td>
            <td>{{ profile.usersCount }}</td>
            <td class="text-right"><button type="button" class="button-secondary" @click="edit(profile)">Editar</button></td>
          </tr>
          <tr v-if="!access.profiles.length">
            <td colspan="4" class="!py-8 text-center text-slate-500">
              Crie um perfil personalizado ou use os papéis padrão na gestão de usuários.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
  <form v-if="editing && access" class="panel mt-4 p-4" @submit.prevent="save">
    <header class="mb-4 flex items-center justify-between">
      <h2 class="text-sm font-bold">
        <ShieldCheck class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />{{
          id ? "Editar perfil" : "Novo perfil"
        }}
      </h2>
      <button type="button" aria-label="Fechar edição de perfil" @click="editing = false">
        <X class="h-4 w-4" aria-hidden="true" focusable="false" />
      </button>
    </header>
    <fieldset :disabled="saving">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500"
          >Nome<input v-model.trim="form.name" class="input mt-1" required minlength="2" maxlength="80" /></label
        ><label class="text-xs text-slate-500">Descrição<input v-model.trim="form.description" class="input mt-1" maxlength="255" /></label>
      </div>
      <div class="my-4 flex flex-wrap items-center gap-2 text-xs">
        <span class="text-slate-500">Começar com:</span
        ><button
          v-for="item in access.presets"
          :key="item.key"
          type="button"
          class="button-secondary"
          :title="item.description"
          @click="preset(item.key)"
        >
          {{ item.name }}</button
        ><button type="button" class="text-slate-500 underline" @click="form.permissions = []">
          <RotateCcw class="inline h-3.5 w-3.5 shrink-0 align-middle" aria-hidden="true" focusable="false" /> Limpar
        </button>
      </div>
      <div class="grid gap-4 md:grid-cols-3">
        <fieldset v-for="group in groups" :key="group" class="rounded-xl border border-slate-200 p-3">
          <legend class="px-1 text-xs font-bold">{{ group }}</legend>
          <label
            v-for="item in access.catalog.filter((item) => item.group === group)"
            :key="item.key"
            class="my-2 flex items-start gap-2 text-xs"
            ><input v-model="form.permissions" type="checkbox" :value="item.key" class="mt-0.5 accent-cyan-600" />{{ item.label }}</label
          >
        </fieldset>
      </div>
    </fieldset>
    <p class="mt-3 text-[11px] text-slate-500">
      Anotar, resolver, reabrir e exportar o PDF de Churn exigem acesso aos detalhes do cliente; exportar listas de Upgrades exige acesso às
      oportunidades. Logins exigem detalhes do contrato; senhas e atalhos de equipamentos também exigem acesso aos logins. No Suporte, as
      abas do cliente exigem acesso ao cadastro; comodatos exigem acesso ao contrato. Acessar um equipamento exige também permissão de
      senhas. Em Rede, a lista geral exige sua própria permissão; os detalhes exigem também dados técnicos. Caixas e mapas dependem da
      permissão de caixas. Os modelos não concedem senhas ou acesso a equipamentos. Configurações é exclusiva de Administradores e não pode
      ser concedida por um perfil.
    </p>
    <p v-if="id" class="mt-2 text-[11px] text-amber-700">
      Salvar altera o acesso dos usuários vinculados a este perfil nas próximas requisições.
    </p>
    <footer class="mt-4 flex justify-end gap-2">
      <button type="button" class="button-secondary" :disabled="saving" @click="editing = false">Cancelar</button
      ><button class="button-primary" :disabled="saving">
        <Save class="h-4 w-4" aria-hidden="true" focusable="false" />{{ saving ? "Salvando…" : "Salvar perfil" }}
      </button>
    </footer>
  </form>
  <p v-if="error" role="alert" class="mt-3 text-sm text-red-600">{{ error }}</p>
</template>
