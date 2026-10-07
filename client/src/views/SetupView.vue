<script setup lang="ts">
import { UserRoundPlus } from "lucide-vue-next";

import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { useAuthStore } from "../stores/auth";
import { useAppearanceStore } from "../stores/appearance";
const appearance = useAppearanceStore();
const router = useRouter();
const auth = useAuthStore();
const name = ref("");
const email = ref("");
const password = ref("");
const error = ref("");
const ready = ref(false);
const allowed = ref(false);
const loading = ref(false);
onMounted(async () => {
  try {
    allowed.value = (await api.setupStatus()).needsSetup;
  } finally {
    ready.value = true;
  }
});
const submit = async () => {
  loading.value = true;
  error.value = "";
  try {
    auth.setSession(await api.setup(name.value, email.value, password.value));
    await router.replace(auth.home);
  } catch (e) {
    error.value = e instanceof Error ? "Não foi possível concluir a configuração." : "Erro ao configurar.";
  } finally {
    loading.value = false;
  }
};
</script>
<template>
  <main class="grid min-h-screen place-items-center bg-slate-50 p-5">
    <form v-if="ready && allowed" @submit.prevent="submit" class="panel w-full max-w-md p-7">
      <img :src="appearance.value.logo" alt="CAS" class="mb-5 h-12 w-12 rounded-xl" />
      <h1 class="text-2xl font-extrabold">
        <UserRoundPlus class="mr-2 inline h-5 w-5 align-middle" aria-hidden="true" focusable="false" />Configurar administrador
      </h1>
      <p class="mt-1 text-sm text-slate-500">Crie a primeira conta administradora do sistema.</p>
      <p v-if="error" role="alert" class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
      <label class="mt-5 block text-sm font-semibold"
        >Nome<input
          v-model="name"
          required
          minlength="2"
          class="mt-1 w-full rounded-lg border border-slate-200 p-2.5 font-normal outline-cyan-500" /></label
      ><label class="mt-4 block text-sm font-semibold"
        >E-mail<input
          v-model="email"
          type="email"
          required
          class="mt-1 w-full rounded-lg border border-slate-200 p-2.5 font-normal outline-cyan-500" /></label
      ><label class="mt-4 block text-sm font-semibold"
        >Senha<input
          v-model="password"
          type="password"
          minlength="8"
          required
          class="mt-1 w-full rounded-lg border border-slate-200 p-2.5 font-normal outline-cyan-500" /></label
      ><button :disabled="loading" class="mt-6 w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {{ loading ? "Configurando…" : "Criar administrador" }}
      </button>
    </form>
    <p v-else-if="ready" class="text-slate-600">
      A configuração inicial já foi concluída. <RouterLink to="/login" class="font-semibold text-cyan-700">Entrar</RouterLink>
    </p>
  </main>
</template>
