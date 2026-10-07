<script setup lang="ts">
import { LogIn } from "lucide-vue-next";

import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { useAuthStore } from "../stores/auth";
import { useAppearanceStore } from "../stores/appearance";
const appearance = useAppearanceStore();
const router = useRouter();
const auth = useAuthStore();
const email = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);
onMounted(async () => {
  if ((await api.setupStatus()).needsSetup) await router.replace("/setup");
});
const submit = async () => {
  loading.value = true;
  error.value = "";
  try {
    auth.setSession(await api.login(email.value, password.value));
    await router.replace(auth.home);
  } catch {
    error.value = "E-mail ou senha inválidos.";
  } finally {
    loading.value = false;
  }
};
</script>
<template>
  <main class="grid min-h-screen place-items-center bg-slate-50 p-5">
    <form @submit.prevent="submit" class="panel w-full max-w-md p-7">
      <img :src="appearance.value.logo" alt="CAS" class="mb-5 h-12 w-12 rounded-xl" />
      <h1 class="text-2xl font-extrabold">
        <LogIn class="mr-2 inline h-5 w-5 align-middle" aria-hidden="true" focusable="false" />Entrar no Retenção CAS
      </h1>
      <p class="mt-1 text-sm text-slate-500">Use suas credenciais de acesso.</p>
      <p v-if="error" role="alert" class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
      <label class="mt-5 block text-sm font-semibold"
        >E-mail<input
          v-model="email"
          type="email"
          required
          class="mt-1 w-full rounded-lg border border-slate-200 p-2.5 font-normal outline-cyan-500" /></label
      ><label class="mt-4 block text-sm font-semibold"
        >Senha<input
          v-model="password"
          type="password"
          required
          class="mt-1 w-full rounded-lg border border-slate-200 p-2.5 font-normal outline-cyan-500" /></label
      ><button :disabled="loading" class="mt-6 w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {{ loading ? "Entrando…" : "Entrar" }}
      </button>
    </form>
  </main>
</template>
