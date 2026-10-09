<template>
  <div class="panel analytics-loading" role="status" aria-live="polite">
    <svg class="analytics-loading-art" viewBox="0 0 280 180" fill="none" aria-hidden="true">
      <circle cx="140" cy="90" r="72" class="loading-halo" />
      <circle cx="140" cy="90" r="58" class="loading-orbit" stroke-dasharray="3 9" />
      <g class="loading-phase loading-calculation">
        <rect x="102" y="35" width="76" height="110" rx="14" class="loading-surface" />
        <rect x="114" y="48" width="52" height="27" rx="5" class="loading-tint" />
        <path d="M122 58h8m-4-4v8m13-4h7m8-4h5l-5 8h5" class="loading-ink" />
        <g class="loading-keys">
          <rect x="115" y="87" width="11" height="11" rx="3" />
          <rect x="135" y="87" width="11" height="11" rx="3" />
          <rect x="155" y="87" width="11" height="11" rx="3" />
          <rect x="115" y="105" width="11" height="11" rx="3" />
          <rect x="135" y="105" width="11" height="11" rx="3" />
          <rect x="155" y="105" width="11" height="29" rx="3" />
          <rect x="115" y="123" width="31" height="11" rx="3" />
        </g>
        <path d="M79 64h10m-5-5v10m107 40h12m-12 6h12" class="loading-symbol" />
      </g>
      <g class="loading-phase loading-search">
        <rect x="89" y="43" width="83" height="94" rx="12" class="loading-surface" />
        <path d="M103 61h42m-42 14h29m-29 14h37m-37 14h21m-21 14h32" class="loading-document" />
        <g class="loading-lens">
          <circle cx="157" cy="89" r="25" class="loading-lens-glass" />
          <path d="m175 107 21 21" class="loading-lens-handle" />
          <path d="M146 86a12 12 0 0 1 11-9" class="loading-ink" />
        </g>
      </g>
      <g class="loading-phase loading-chart">
        <rect x="77" y="42" width="126" height="99" rx="12" class="loading-surface" />
        <path d="M92 66h96M92 87h96M92 108h96" class="loading-grid" />
        <g class="loading-bars">
          <rect x="96" y="102" width="14" height="24" rx="3" />
          <rect x="122" y="91" width="14" height="35" rx="3" />
          <rect x="148" y="79" width="14" height="47" rx="3" />
          <rect x="174" y="64" width="14" height="62" rx="3" />
        </g>
        <path d="M97 96 129 80 154 86 181 55" class="loading-trend" pathLength="1" />
        <circle cx="181" cy="55" r="4" class="loading-trend-dot" />
      </g>
      <g class="loading-dots">
        <circle cx="126" cy="166" r="3" />
        <circle cx="140" cy="166" r="3" />
        <circle cx="154" cy="166" r="3" />
      </g>
    </svg>
    <strong>Consultando os indicadores do provedor…</strong>
    <p>Reunindo os dados para sua análise.</p>
  </div>
</template>

<style scoped>
.analytics-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem 1rem 2rem;
  text-align: center;
  gap: 0.45rem;
  font-size: 0.8rem;
}
.analytics-loading p {
  color: var(--appearance-secondary);
  font-size: 0.75rem;
}
.analytics-loading-art {
  width: 280px;
  max-width: 100%;
  color: var(--appearance-primary-text);
  margin-bottom: 0.5rem;
}
.loading-halo,
.loading-tint {
  fill: currentColor;
  fill-opacity: 0.06;
}
.loading-orbit {
  stroke: currentColor;
  stroke-opacity: 0.18;
}
.loading-surface {
  fill: var(--appearance-surface);
  stroke: currentColor;
  stroke-width: 2;
  stroke-opacity: 0.65;
}
.loading-phase {
  opacity: 0;
  transform-origin: 140px 90px;
  animation: loading-phase 6s ease-in-out infinite;
}
.loading-search {
  animation-delay: 2s;
}
.loading-chart {
  animation-delay: 4s;
}
.loading-ink,
.loading-symbol,
.loading-document,
.loading-lens-handle,
.loading-trend {
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.loading-symbol,
.loading-document {
  stroke-opacity: 0.4;
}
.loading-keys rect,
.loading-dots circle {
  fill: currentColor;
  opacity: 0.3;
  animation: loading-pulse 1.2s ease-in-out infinite;
}
.loading-keys rect:nth-child(2n),
.loading-dots circle:nth-child(2) {
  animation-delay: 0.2s;
}
.loading-keys rect:nth-child(3n),
.loading-dots circle:nth-child(3) {
  animation-delay: 0.4s;
}
.loading-lens-glass {
  fill: var(--appearance-surface);
  fill-opacity: 0.9;
  stroke: currentColor;
  stroke-width: 4;
}
.loading-lens {
  animation: loading-scan 2s ease-in-out infinite;
}
.loading-lens-handle {
  stroke-width: 7;
}
.loading-grid {
  stroke: currentColor;
  stroke-opacity: 0.1;
}
.loading-bars {
  fill: currentColor;
  fill-opacity: 0.2;
  transform-origin: 140px 126px;
  animation: loading-bars 6s ease-out 4s infinite;
}
.loading-trend {
  stroke: #10b981;
  stroke-dasharray: 1;
  animation: loading-trend 6s ease-out 4s infinite;
}
.loading-trend-dot {
  fill: #10b981;
}
@keyframes loading-phase {
  0% {
    opacity: 0;
    transform: translateY(6px) scale(0.94);
  }
  5%,
  27% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  33%,
  100% {
    opacity: 0;
    transform: translateY(-6px) scale(1.04);
  }
}
@keyframes loading-pulse {
  50% {
    opacity: 0.85;
  }
}
@keyframes loading-scan {
  50% {
    transform: translate(-9px, 7px);
  }
}
@keyframes loading-bars {
  0% {
    transform: scaleY(0.15);
  }
  18%,
  100% {
    transform: scaleY(1);
  }
}
@keyframes loading-trend {
  0% {
    stroke-dashoffset: 1;
  }
  22%,
  100% {
    stroke-dashoffset: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .analytics-loading-art * {
    animation: none;
  }
  .loading-chart {
    opacity: 1;
  }
}
</style>
