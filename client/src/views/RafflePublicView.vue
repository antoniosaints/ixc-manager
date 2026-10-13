<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Radio, Trophy, RefreshCw } from "lucide-vue-next";
import { rafflesApi, type RafflePresentation } from "../rafflesApi";
import { useRaffleLive } from "../composables/useRaffleLive";
import RaffleStage from "../components/RaffleStage.vue";
const route = useRoute(),
  token = computed(() => String(route.params.token ?? "")),
  state = ref<RafflePresentation | null>(null),
  error = ref(""),
  loading = ref(true);
const { connected, unavailable, message } = useRaffleLive(token, state, true);
async function load() {
  const current = token.value;
  loading.value = true;
  error.value = "";
  try {
    const data = await rafflesApi.public(current);
    if (current === token.value && (!state.value || data.revision >= state.value.revision)) state.value = data;
  } catch (e) {
    if (current === token.value) error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
watch(
  token,
  () => {
    state.value = null;
    void load();
  },
  { immediate: true }
);
watch(state, (s) => {
  if (s) {
    document.title = `${s.name} · Sorteio ao vivo`;
    error.value = "";
  }
});
const results = computed(() => [...(state.value?.results ?? [])].reverse());
</script>
<template>
  <main class="raffle-public">
    <div v-if="(error && !state) || unavailable" class="raffle-public-message" role="alert">
      <Trophy :size="36" />
      <h1>Sorteio indisponível</h1>
      <p>{{ unavailable ? message : error }}</p>
      <button type="button" @click="load"><RefreshCw :size="16" />Tentar novamente</button>
    </div>
    <p v-else-if="!state && loading" class="raffle-public-message" role="status">Conectando ao sorteio…</p>
    <div v-else-if="state" class="raffle-public-layout">
      <div>
        <div class="raffle-public-status" :class="{ online: connected }">
          <Radio :size="13" />{{ connected ? "TRANSMISSÃO AO VIVO" : "RECONECTANDO" }}
        </div>
        <RaffleStage :raffle="state" :connected="connected" />
        <p v-if="message" class="raffle-public-note" role="status">{{ message }}</p>
      </div>
      <section class="raffle-public-history">
        <header>
          <h1>Quem já ganhou</h1>
          <span>{{ results.length }} sorteado(s)</span>
        </header>
        <p>Os momentos de sorte deste evento.</p>
        <div v-if="!results.length" class="raffle-public-empty">
          <Trophy :size="32" />
          <p>Os ganhadores aparecerão aqui<br />após cada rodada.</p>
        </div>
        <article v-for="r in results" :key="r.order">
          <span>{{ r.order }}º PRÊMIO · {{ r.prize }}</span>
          <h2>#{{ r.contractId }} · {{ r.customerName }}</h2>
          <p>{{ r.city ?? "Localidade não informada" }}</p>
          <time>{{ new Date(r.drawnAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) }}</time>
        </article>
      </section>
    </div>
  </main>
</template>
<style scoped>
.raffle-public {
  min-height: 100vh;
  background: #0c1423;
  color: #e5edf9;
  padding: 35px 24px;
  font-family: Inter, Arial, sans-serif;
}
.raffle-public-layout {
  max-width: 900px;
  margin: auto;
  display: grid;
  grid-template-columns: 390px minmax(0, 1fr);
  gap: 42px;
  align-items: start;
}
.raffle-public-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #aab8cb;
  letter-spacing: 2px;
  font-size: 10px;
  font-weight: 700;
  margin-bottom: 20px;
}
.raffle-public-status.online {
  color: #6ee7b7;
}
.raffle-public-history {
  margin-top: 34px;
  padding: 25px;
  border: 1px solid #2c3b51;
  border-radius: 20px;
  background: #162235;
}
.raffle-public-history header {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}
.raffle-public-history h1 {
  font-size: 19px;
  font-weight: 800;
}
.raffle-public-history header span {
  font-size: 10px;
  padding: 5px 8px;
  border-radius: 12px;
  background: #243752;
  color: #aac5ea;
  white-space: nowrap;
}
.raffle-public-history > p {
  font-size: 12px;
  color: #91a3bc;
  margin: 7px 0 22px;
}
.raffle-public-history article {
  padding: 16px;
  border: 1px solid #2a3b51;
  border-radius: 12px;
  background: #0d1728;
  margin-top: 12px;
}
.raffle-public-history article > span {
  font-size: 9px;
  letter-spacing: 1px;
  color: #7ad5f0;
}
.raffle-public-history h2 {
  font-size: 14px;
  font-weight: 700;
  margin: 8px 0 5px;
  overflow-wrap: anywhere;
}
.raffle-public-history article p,
.raffle-public-history time {
  font-size: 11px;
  color: #91a3bc;
}
.raffle-public-history time {
  display: block;
  margin-top: 9px;
}
.raffle-public-empty {
  text-align: center;
  color: #8295b2;
  padding: 40px 0;
  font-size: 12px;
  line-height: 1.7;
}
.raffle-public-empty svg {
  margin: auto auto 15px;
}
.raffle-public-message {
  text-align: center;
  max-width: 440px;
  margin: 15vh auto;
  display: grid;
  justify-items: center;
  gap: 15px;
}
.raffle-public-message h1 {
  font-size: 24px;
  font-weight: 800;
}
.raffle-public-message p,
.raffle-public-note {
  font-size: 13px;
  color: #a9bad1;
}
.raffle-public-message button {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #536685;
  padding: 10px 15px;
  border-radius: 10px;
}
.raffle-public-note {
  text-align: center;
  margin-top: 16px;
}
@media (max-width: 780px) {
  .raffle-public {
    padding: 22px 14px;
  }
  .raffle-public-layout {
    grid-template-columns: minmax(0, 390px);
    justify-content: center;
    gap: 15px;
  }
  .raffle-public-history {
    margin-top: 10px;
  }
}
</style>
