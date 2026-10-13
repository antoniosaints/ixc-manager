<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Trophy, Sparkles, Radio, Users, Gift } from "lucide-vue-next";
import type { RafflePresentation } from "../rafflesApi";
const props = withDefaults(defineProps<{ raffle: RafflePresentation; connected?: boolean; preview?: boolean }>(), {
  connected: false,
  preview: false,
});
const time = ref(Date.now()),
  offset = ref(0);
watch(
  () => props.raffle.serverNow,
  (v) => {
    const n = Date.parse(v);
    if (Number.isFinite(n)) offset.value = n - Date.now();
  },
  { immediate: true }
);
const timer = setInterval(() => {
  time.value = Date.now();
}, 100);
onBeforeUnmount(() => clearInterval(timer));
const countdown = computed(() =>
  props.raffle.countdownEndsAt
    ? Math.max(0, Math.min(3, Math.ceil((Date.parse(props.raffle.countdownEndsAt) - time.value - offset.value) / 1000)))
    : 0
);
const winner = computed(() => props.raffle.results.at(-1));
const prizeIndex = computed(() =>
  props.raffle.phase === "countdown" ? props.raffle.results.length : winner.value ? winner.value.order - 1 : 0
);
const ink = computed(() => {
  const hex = props.raffle.background;
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
  return c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722 > 0.179 ? "#10233d" : "#ffffff";
});
const date = computed(() =>
  new Date(time.value + offset.value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
);
</script>
<template>
  <div class="raffle-device" :style="{ '--raffle-bg': raffle.background, '--raffle-ink': ink }">
    <div class="raffle-device-speaker" aria-hidden="true"></div>
    <div class="raffle-screen">
      <header class="raffle-screen-header">
        <img v-if="raffle.logo" :src="raffle.logo" alt="Logo do sorteio" class="raffle-screen-logo" />
        <div class="raffle-screen-brand">
          <span
            ><Radio :size="11" aria-hidden="true" />{{
              preview ? "PRÉVIA DO EVENTO" : connected ? "EVENTO AO VIVO" : "AGUARDANDO CONEXÃO"
            }}</span
          >
          <h2>{{ raffle.name }}</h2>
        </div>
      </header>
      <div class="raffle-screen-meta">
        <span>{{ raffle.phase === "finished" ? "Sorteio concluído" : "Cliente premiado" }}</span
        ><time>{{ date }}</time>
      </div>
      <div class="raffle-prize">
        <div class="raffle-prize-icon"><Gift :size="29" aria-hidden="true" /></div>
        <div>
          <span>{{ prizeIndex + 1 }}º prêmio</span><strong>{{ raffle.prizes[prizeIndex] ?? "Todos os prêmios entregues" }}</strong>
        </div>
      </div>
      <div class="raffle-reveal" role="status" aria-live="polite" aria-atomic="true">
        <template v-if="raffle.phase === 'countdown'">
          <span class="raffle-reveal-eyebrow">BOA SORTE A TODOS</span>
          <Transition name="raffle-number" mode="out-in"
            ><strong :key="countdown" class="raffle-countdown">{{ countdown || "…" }}</strong></Transition
          >
          <h3>{{ countdown ? "Quem será o próximo?" : "Revelando o ganhador…" }}</h3>
          <p>{{ raffle.remaining.toLocaleString("pt-BR") }} contratos na rodada</p>
        </template>
        <template v-else-if="winner">
          <div class="raffle-trophy raffle-trophy-winner">
            <Trophy :size="42" aria-hidden="true" /><Sparkles class="raffle-spark" :size="19" aria-hidden="true" />
          </div>
          <span class="raffle-reveal-eyebrow">PARABÉNS AO GANHADOR</span>
          <h3 :key="winner.order" class="raffle-winner-name">{{ winner.customerName }}</h3>
          <p class="raffle-contract">
            Contrato <strong>#{{ winner.contractId }}</strong>
          </p>
          <div class="raffle-city">
            <span>LOCALIDADE</span><strong>{{ winner.city ?? "Localidade não informada" }}</strong>
          </div>
        </template>
        <template v-else>
          <div class="raffle-trophy"><Trophy :size="42" aria-hidden="true" /></div>
          <span class="raffle-reveal-eyebrow">SUA CHANCE ESTÁ AQUI</span>
          <h3>O próximo ganhador<br />pode ser você.</h3>
          <p>O sorteio começa em instantes.</p>
          <div class="raffle-city">
            <span>CONTRATOS PARTICIPANTES</span><strong>{{ raffle.total.toLocaleString("pt-BR") }}</strong>
          </div>
        </template>
      </div>
      <footer class="raffle-screen-footer">
        <div>
          <Users :size="15" aria-hidden="true" />{{ raffle.total.toLocaleString("pt-BR") }} contratos<span>·</span
          >{{ raffle.results.length }}/{{ raffle.prizes.length }} prêmios
        </div>
        <p>{{ raffle.phase === "finished" ? "Obrigado por fazer parte desta história." : "Acompanhe cada rodada aqui, em tempo real." }}</p>
      </footer>
    </div>
  </div>
</template>
<style scoped>
.raffle-device {
  width: 390px;
  max-width: 100%;
  padding: 13px;
  background: #cad5e4;
  border-radius: 45px;
  box-shadow: 0 25px 70px #0003;
  position: relative;
  color: var(--raffle-ink);
  margin: auto;
}
.raffle-device-speaker {
  position: absolute;
  z-index: 1;
  left: calc(50% - 27px);
  top: 19px;
  width: 54px;
  height: 5px;
  border-radius: 9px;
  background: #10233d33;
}
.raffle-screen {
  background: var(--raffle-bg);
  border-radius: 34px;
  min-height: 622px;
  padding: 30px 22px 22px;
  position: relative;
  overflow: hidden;
}
.raffle-screen-header {
  display: flex;
  gap: 12px;
  align-items: center;
}
.raffle-screen-logo {
  width: 46px;
  height: 46px;
  background: #fff;
  border-radius: 13px;
  padding: 5px;
  object-fit: contain;
  flex-shrink: 0;
}
.raffle-screen-brand {
  min-width: 0;
}
.raffle-screen-brand span {
  display: flex;
  gap: 5px;
  align-items: center;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.4px;
}
.raffle-screen-brand h2 {
  font-size: 17px;
  line-height: 1.2;
  font-weight: 800;
  margin-top: 5px;
  overflow-wrap: anywhere;
}
.raffle-screen-meta {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin: 19px 0 16px;
  font-size: 10px;
  font-weight: 600;
  opacity: 0.8;
}
.raffle-prize {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px;
  background: #fff9;
  color: #172033;
  border: 1px solid #fffb;
  border-radius: 18px;
  min-height: 87px;
}
.raffle-prize-icon {
  height: 49px;
  width: 49px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 13px;
  color: #df8500;
  background: #fff6d4;
}
.raffle-prize span {
  display: block;
  font-size: 11px;
  color: #506075;
  font-weight: 600;
}
.raffle-prize strong {
  display: block;
  font-size: 17px;
  line-height: 1.25;
  margin-top: 4px;
  overflow-wrap: anywhere;
}
.raffle-reveal {
  margin-top: 18px;
  background: #ffffffde;
  color: #13263d;
  border-radius: 29px;
  min-height: 325px;
  padding: 24px 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 2px 9px #10233d08;
}
.raffle-reveal-eyebrow {
  display: block;
  letter-spacing: 1.3px;
  font-size: 9px;
  font-weight: 800;
  color: #55728b;
  margin-top: 12px;
}
.raffle-trophy {
  height: 77px;
  width: 77px;
  border: 1px solid #ffdf7a;
  background: #fff9e5;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #ec9800;
  position: relative;
  box-shadow: 0 0 44px #efbf4c40;
}
.raffle-trophy-winner {
  animation: raffle-celebrate 0.55s ease-out;
}
.raffle-spark {
  position: absolute;
  right: -7px;
  bottom: 7px;
}
.raffle-reveal h3 {
  font-size: 24px;
  line-height: 1.25;
  font-weight: 800;
  margin-top: 10px;
  overflow-wrap: anywhere;
  max-width: 100%;
}
.raffle-reveal p {
  font-size: 12px;
  color: #62758b;
  margin-top: 11px;
}
.raffle-reveal .raffle-contract {
  margin: 7px 0 0;
  font-size: 11px;
}
.raffle-city {
  width: 100%;
  text-align: left;
  border-radius: 11px;
  background: var(--raffle-bg);
  color: var(--raffle-ink);
  padding: 10px 13px;
  margin-top: 19px;
}
.raffle-city span {
  display: block;
  font-size: 9px;
  letter-spacing: 1.4px;
  font-weight: 800;
}
.raffle-city strong {
  display: block;
  font-size: 15px;
  margin-top: 3px;
  overflow-wrap: anywhere;
}
.raffle-countdown {
  font-size: 112px;
  font-weight: 900;
  line-height: 1.3;
  color: #13263d;
}
.raffle-screen-footer {
  margin-top: 23px;
  text-align: center;
  font-size: 10px;
  font-weight: 600;
}
.raffle-screen-footer > div {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}
.raffle-screen-footer p {
  margin: 12px 0 0;
  font-size: 11px;
  line-height: 1.5;
  opacity: 0.8;
}
.raffle-number-enter-active,
.raffle-number-leave-active {
  transition:
    opacity 0.12s,
    transform 0.12s;
}
.raffle-number-enter-from {
  opacity: 0;
  transform: scale(1.15);
}
.raffle-number-leave-to {
  opacity: 0;
  transform: scale(0.85);
}
@keyframes raffle-celebrate {
  from {
    transform: scale(0.5) rotate(-25deg);
    opacity: 0;
  }
  to {
    transform: scale(1) rotate(0);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .raffle-trophy-winner {
    animation: none;
  }
  .raffle-number-enter-active,
  .raffle-number-leave-active {
    transition: none;
  }
}
@media (max-width: 400px) {
  .raffle-screen {
    padding: 28px 16px 19px;
  }
  .raffle-reveal h3 {
    font-size: 21px;
  }
  .raffle-screen-footer > div {
    gap: 4px;
    font-size: 9px;
  }
}
</style>
