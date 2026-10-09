<script setup lang="ts">
defineProps<{ fromPort: number; toPort: number; restoring?: boolean }>();
</script>

<template>
  <div class="my-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center" role="status" aria-live="polite">
    <p class="text-sm font-bold text-ink">{{ restoring ? "Restaurando portas…" : "Executando manobra…" }}</p>
    <svg class="mx-auto block w-full max-w-md" viewBox="0 0 480 225" fill="none" aria-hidden="true" focusable="false">
      <text x="150" y="22" text-anchor="middle" class="port-label">{{ fromPort ? `Porta ${fromPort}` : "Sem porta" }}</text>
      <text x="330" y="22" text-anchor="middle" class="port-label">Porta {{ toPort }}</text>
      <rect x="44" y="34" width="392" height="78" rx="14" class="patch-panel" />
      <rect x="52" y="42" width="376" height="62" rx="9" stroke="currentColor" stroke-opacity=".12" />
      <g v-for="x in [66, 414]" :key="x" stroke="currentColor" stroke-opacity=".3">
        <circle :cx="x" cy="73" r="5" />
        <path :d="`M${x - 2} 73h4`" />
      </g>
      <g v-for="x in [150, 330]" :key="x">
        <rect :x="x - 31" y="47" width="62" height="51" rx="8" fill="#059669" fill-opacity=".12" stroke="#34d399" />
        <rect :x="x - 17" y="53" width="34" height="38" rx="4" fill="#047857" />
        <rect :x="x - 10" y="60" width="20" height="26" rx="2" fill="#064e3b" />
        <path :d="`M${x - 7} 63h14`" stroke="#6ee7b7" stroke-width="2" stroke-linecap="round" />
      </g>
      <path d="M190 140c25 15 55 15 80 0m-8-2 8 2-4 8" stroke="currentColor" stroke-opacity=".25" stroke-width="2" stroke-linecap="round" />
      <g class="moving-connector">
        <path d="M0 28C0 67-76 48-76 82" stroke="#ca8a04" stroke-width="8" stroke-linecap="round" />
        <path d="M0 28C0 67-76 48-76 82" stroke="#fde047" stroke-width="4" stroke-linecap="round" />
        <rect x="-6" y="-20" width="12" height="21" rx="2" fill="#f8fafc" stroke="#94a3b8" />
        <rect x="-11" y="-5" width="22" height="23" rx="3" fill="#10b981" stroke="#047857" stroke-width="2" />
        <path d="M-6 1v10m6-10v10m6-10v10" stroke="#a7f3d0" stroke-width="2" stroke-linecap="round" />
        <rect x="-7" y="18" width="14" height="13" rx="3" fill="#059669" />
      </g>
    </svg>
    <p class="text-xs leading-5 text-slate-500">Aguarde a confirmação do IXC. As portas serão conferidas antes de concluir.</p>
  </div>
</template>

<style scoped>
.port-label {
  fill: currentColor;
  font-size: 13px;
  font-weight: 600;
}
.patch-panel {
  fill: currentColor;
  fill-opacity: 0.04;
  stroke: currentColor;
  stroke-opacity: 0.2;
}
.moving-connector {
  animation: move-connector 3.8s ease-in-out infinite;
  transform: translate(150px, 81px);
}
@keyframes move-connector {
  0%,
  12% {
    transform: translate(150px, 81px);
    opacity: 1;
  }
  27% {
    transform: translate(150px, 140px);
  }
  57% {
    transform: translate(330px, 140px);
  }
  72%,
  86% {
    transform: translate(330px, 81px);
    opacity: 1;
  }
  93% {
    transform: translate(330px, 81px);
    opacity: 0;
  }
  94% {
    transform: translate(150px, 81px);
    opacity: 0;
  }
  100% {
    transform: translate(150px, 81px);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .moving-connector {
    animation: none;
    transform: translate(330px, 81px);
  }
}
</style>
