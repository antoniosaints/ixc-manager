<script setup lang="ts">
import { computed, ref, useId } from "vue";
import {
  UserRound,
  FileText,
  Wifi,
  Wrench,
  Headset,
  Wallet,
  Router,
  LockKeyhole,
  ZoomIn,
  ZoomOut,
  Maximize,
  RotateCcw,
} from "lucide-vue-next";
import { graphAreas, graphRelations, groupCaption, type CustomerGraph, type GraphRecord, type GraphArea } from "../customerGraph/model";
const props = defineProps<{ data: CustomerGraph; selected: string; search: string; attentionOnly: boolean; showRelations: boolean }>();
const emit = defineEmits<{ select: [key: string] }>();
const patternId = `graph-grid-${useId()}`;
const icons = { contracts: FileText, logins: Wifi, orders: Wrench, tickets: Headset, financial: Wallet, equipment: Router };
const zoom = ref(1),
  pan = ref({ x: 0, y: 0 });
let drag: { x: number; y: number; px: number; py: number; ratio: number } | null = null;
const center = { x: 490, y: 270 };
const hubs = graphAreas.map((area) => ({
  ...area,
  x: center.x + Math.cos((area.angle * Math.PI) / 180) * 310,
  y: center.y + Math.sin((area.angle * Math.PI) / 180) * 130,
}));
const allRecords = computed(() => graphAreas.flatMap((area) => props.data.groups[area.key].records));
const allRelations = computed(() => graphRelations(allRecords.value));
const relatedKeys = computed(
  () => new Set(allRelations.value.filter((l) => l.from === props.selected || l.to === props.selected).flatMap((l) => [l.from, l.to]))
);
const connectedAreas = computed(() => new Set(allRecords.value.filter((r) => relatedKeys.value.has(r.key)).map((r) => r.kind)));
function dimArea(key: GraphArea) {
  return !!selectedArea.value && selectedArea.value !== key && !connectedAreas.value.has(key);
}
const leaves = computed(() =>
  hubs.flatMap((hub) => {
    let records = props.data.groups[hub.key].records.filter(
      (r) =>
        (!props.attentionOnly || r.tone === "danger" || r.tone === "warning") &&
        (!props.search ||
          `${r.title} ${r.id} ${r.subtitle ?? ""} ${r.facts.map((f) => f.value).join(" ")}`
            .toLocaleLowerCase("pt-BR")
            .includes(props.search.toLocaleLowerCase("pt-BR")))
    );
    const maximum = 3;
    const priority = records.filter((r) => r.key === props.selected || relatedKeys.value.has(r.key));
    records = [...priority, ...records.filter((r) => !priority.includes(r))].slice(0, Math.max(maximum, Math.min(priority.length, 3)));
    return records.map((record, i) => {
      const angle = ((hub.angle + (records.length === 1 ? 0 : -35 + (i * 70) / (records.length - 1))) * Math.PI) / 180;
      return {
        record,
        area: hub.key,
        color: hub.color,
        x: hub.x + Math.cos(angle) * 105,
        y: hub.y + Math.sin(angle) * 105,
        hub,
        labelAbove: Math.sin(angle) < -0.25 && hub.y + Math.sin(angle) * 105 > 60,
      };
    });
  })
);
const visibleRelations = computed(() => {
  const nodes = new Map(leaves.value.map((n) => [n.record.key, n]));
  return allRelations.value
    .filter((l) => props.showRelations || l.from === props.selected || l.to === props.selected)
    .flatMap((l) => {
      const from = nodes.get(l.from),
        to = nodes.get(l.to);
      return from && to ? [{ ...l, fromNode: from, toNode: to }] : [];
    });
});
const selectedArea = computed(() =>
  props.selected.startsWith("area:") ? props.selected.slice(5) : allRecords.value.find((r) => r.key === props.selected)?.kind
);
const toneColor = (record: GraphRecord) => ({ danger: "#ef4444", warning: "#f59e0b", success: "#10b981", neutral: "#94a3b8" })[record.tone];
const short = (text: string, max = 18) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
function startPan(e: PointerEvent) {
  if ((e.target as Element).closest('[role="button"]') || e.button !== 0) return;
  const svg = e.currentTarget as SVGSVGElement;
  drag = { x: e.clientX, y: e.clientY, px: pan.value.x, py: pan.value.y, ratio: 980 / svg.getBoundingClientRect().width };
  svg.setPointerCapture(e.pointerId);
}
function movePan(e: PointerEvent) {
  if (drag) pan.value = { x: drag.px + (e.clientX - drag.x) * drag.ratio, y: drag.py + (e.clientY - drag.y) * drag.ratio };
}
function reset() {
  zoom.value = 1;
  pan.value = { x: 0, y: 0 };
}
function endPan() {
  drag = null;
}
function changeZoom(delta: number) {
  zoom.value = Math.max(0.65, Math.min(1.8, zoom.value + delta));
}
</script>
<template>
  <section class="relationship-map" aria-label="Mapa de relações do cliente">
    <div class="relationship-map-toolbar">
      <span
        ><span class="map-live-dot" />Mapa de relações
        <small>{{ leaves.length }} {{ leaves.length === 1 ? "registro" : "registros" }} no mapa</small></span
      >
      <div class="map-zoom-controls">
        <button type="button" aria-label="Diminuir zoom" :disabled="zoom <= 0.65" @click="changeZoom(-0.15)"><ZoomOut /></button>
        <span>{{ Math.round(zoom * 100) }}%</span>
        <button type="button" aria-label="Aumentar zoom" :disabled="zoom >= 1.8" @click="changeZoom(0.15)"><ZoomIn /></button>
        <button type="button" aria-label="Centralizar mapa" title="Centralizar mapa" @click="reset"><Maximize /></button>
      </div>
    </div>
    <div class="relationship-map-canvas">
      <svg
        viewBox="0 0 980 580"
        role="group"
        aria-label="Cliente no centro, conectado a seis áreas; selecione uma área ou um registro para explorar"
        @pointerdown="startPan"
        @pointermove="movePan"
        @pointerup="endPan"
        @pointercancel="endPan"
      >
        <defs>
          <pattern :id="patternId" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r=".8" class="map-grid-dot" />
          </pattern>
        </defs>
        <rect width="980" height="580" :fill="`url(#${patternId})`" />
        <g :transform="`translate(${pan.x} ${pan.y}) translate(490 270) scale(${zoom}) translate(-490 -270)`">
          <ellipse cx="490" cy="270" rx="310" ry="130" class="map-orbit" />
          <ellipse cx="490" cy="270" rx="415" ry="205" class="map-orbit map-orbit-outer" />
          <g v-for="hub in hubs" :key="`edge-${hub.key}`" :class="{ 'map-dimmed': dimArea(hub.key) }">
            <path
              :d="`M 490 270 Q ${490 + (hub.x - 490) * 0.5 - 25} ${270 + (hub.y - 270) * 0.5 + 25} ${hub.x} ${hub.y}`"
              :stroke="hub.color"
              class="map-hub-edge"
              :class="{ 'map-edge-selected': selectedArea === hub.key }"
            />
          </g>
          <g v-for="leaf in leaves" :key="`branch-${leaf.record.key}`">
            <path
              :d="`M ${leaf.hub.x} ${leaf.hub.y} Q ${leaf.hub.x} ${leaf.y} ${leaf.x} ${leaf.y}`"
              :stroke="leaf.color"
              class="map-leaf-edge"
              :class="{ 'map-dimmed': selectedArea && selectedArea !== leaf.area && !relatedKeys.has(leaf.record.key) }"
            />
          </g>
          <path
            v-for="link in visibleRelations"
            :key="`${link.from}-${link.to}`"
            class="map-relation-edge"
            :d="`M ${link.fromNode.x} ${link.fromNode.y} Q 490 270 ${link.toNode.x} ${link.toNode.y}`"
          >
            <title>{{ link.label }}</title>
          </path>
          <g
            role="button"
            tabindex="0"
            aria-label="Ver panorama do cliente"
            :aria-pressed="selected === 'customer'"
            class="map-customer-node"
            @click.stop="emit('select', 'customer')"
            @keydown.enter.prevent="emit('select', 'customer')"
            @keydown.space.prevent="emit('select', 'customer')"
          >
            <circle cx="490" cy="270" r="88" class="map-center-ring" />
            <circle cx="490" cy="270" r="75" class="map-center" />
            <UserRound x="476" y="216" width="28" height="28" stroke-width="1.6" />
            <text x="490" y="264" class="map-center-name">{{ short(data.customer.name, 22) }}</text>
            <text x="490" y="285" class="map-center-id">Cliente #{{ data.customer.id }}</text>
            <text x="490" y="310" class="map-center-status">
              {{ data.customer.active === true ? "CADASTRO ATIVO" : data.customer.active === false ? "CADASTRO INATIVO" : "SEM STATUS" }}
            </text>
          </g>
          <g
            v-for="hub in hubs"
            :key="hub.key"
            role="button"
            tabindex="0"
            class="map-area-node"
            :class="{ 'map-area-selected': selectedArea === hub.key, 'map-dimmed': dimArea(hub.key) }"
            :aria-label="`${hub.label}: ${data.groups[hub.key].total ?? 'não disponível'}. ${groupCaption(hub.key, data.groups[hub.key])}`"
            :aria-pressed="selected === `area:${hub.key}`"
            @click.stop="emit('select', `area:${hub.key}`)"
            @keydown.enter.prevent="emit('select', `area:${hub.key}`)"
            @keydown.space.prevent="emit('select', `area:${hub.key}`)"
          >
            <rect :x="hub.x - 78" :y="hub.y - 40" width="156" height="80" rx="18" class="map-area-card" :stroke="hub.color" />
            <component
              :is="data.groups[hub.key].state === 'restricted' ? LockKeyhole : icons[hub.key]"
              :x="hub.x - 58"
              :y="hub.y - 25"
              width="17"
              height="17"
              :stroke="hub.color"
            />
            <text :x="hub.x - 32" :y="hub.y - 12" class="map-area-label">{{ hub.label }}</text>
            <text :x="hub.x - 58" :y="hub.y + 17" class="map-area-count" :fill="hub.color">{{ data.groups[hub.key].total ?? "—" }}</text>
            <text :x="hub.x - 58" :y="hub.y + 32" class="map-area-caption">
              {{ short(groupCaption(hub.key, data.groups[hub.key]), 26) }}
            </text>
            <circle v-if="data.groups[hub.key].state === 'unavailable'" :cx="hub.x + 64" :cy="hub.y - 26" r="4" fill="#f59e0b" />
          </g>
          <g
            v-for="leaf in leaves"
            :key="leaf.record.key"
            role="button"
            tabindex="0"
            class="map-record-node"
            :class="{
              'map-record-selected': selected === leaf.record.key,
              'map-dimmed': selectedArea && selectedArea !== leaf.area && !relatedKeys.has(leaf.record.key),
            }"
            :aria-label="`${leaf.record.title}, ${leaf.record.status ?? ''}. Ver detalhes`"
            :aria-pressed="selected === leaf.record.key"
            @click.stop="emit('select', leaf.record.key)"
            @keydown.enter.prevent="emit('select', leaf.record.key)"
            @keydown.space.prevent="emit('select', leaf.record.key)"
          >
            <circle :cx="leaf.x" :cy="leaf.y" r="17" class="map-record-circle" :stroke="toneColor(leaf.record)" />
            <component :is="icons[leaf.area]" :x="leaf.x - 7" :y="leaf.y - 7" width="14" height="14" :stroke="leaf.color" />
            <text :x="leaf.x" :y="leaf.labelAbove ? leaf.y - 33 : leaf.y + 34" class="map-record-title">
              {{ short(leaf.record.title, 17) }}
            </text>
            <text :x="leaf.x" :y="leaf.labelAbove ? leaf.y - 19 : leaf.y + 49" class="map-record-id">#{{ short(leaf.record.id, 12) }}</text>
            <title>{{ leaf.record.title }}</title>
          </g>
        </g>
      </svg>
    </div>
    <div class="map-legend">
      <span><i class="legend-danger" />Atenção</span><span><i class="legend-warning" />Pendência</span
      ><span><i class="legend-success" />Ativo / concluído</span><span><i class="legend-neutral" />Informativo</span
      ><span class="map-link-legend">- - Vínculo registrado</span><button type="button" @click="reset"><RotateCcw />Restaurar visão</button>
    </div>
  </section>
</template>
<style scoped>
.relationship-map {
  border: 1px solid var(--appearance-border);
  border-radius: 18px;
  overflow: hidden;
  background: var(--appearance-surface);
}
.relationship-map-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--appearance-border);
  font-size: 12px;
  font-weight: 600;
  gap: 12px;
}
.relationship-map-toolbar > span {
  display: flex;
  align-items: center;
  gap: 7px;
}
.relationship-map-toolbar small {
  font-size: 10px;
  font-weight: 400;
  color: var(--appearance-secondary);
  margin-left: 4px;
}
.map-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}
.map-zoom-controls {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--appearance-secondary);
  font-size: 10px;
}
.map-zoom-controls button {
  padding: 5px;
  border-radius: 5px;
}
.map-zoom-controls button:hover {
  background: var(--appearance-muted);
}
.map-zoom-controls button:disabled {
  opacity: 0.35;
}
.map-zoom-controls svg {
  width: 15px;
  height: 15px;
}
.relationship-map-canvas {
  overflow: auto;
  height: clamp(340px, calc(100dvh - 340px), 580px);
  background: radial-gradient(
    ellipse at center,
    color-mix(in srgb, var(--appearance-primary) 7%, var(--appearance-surface)),
    var(--appearance-surface) 70%
  );
}
.relationship-map-canvas > svg {
  display: block;
  width: 100%;
  height: 100%;
  min-width: 740px;
  touch-action: none;
  user-select: none;
}
.map-grid-dot {
  fill: var(--appearance-border);
  opacity: 0.7;
}
.map-orbit {
  fill: none;
  stroke: var(--appearance-border);
  stroke-dasharray: 3 9;
  opacity: 0.5;
}
.map-orbit-outer {
  opacity: 0.3;
}
.map-hub-edge {
  fill: none;
  stroke-width: 2;
  opacity: 0.25;
}
.map-edge-selected {
  opacity: 0.9;
  stroke-width: 3;
}
.map-leaf-edge {
  fill: none;
  stroke-width: 1.3;
  opacity: 0.4;
}
.map-relation-edge {
  fill: none;
  stroke: var(--appearance-primary-text);
  stroke-width: 1.7;
  stroke-dasharray: 5 7;
  opacity: 0.7;
}
.map-dimmed {
  opacity: 0.35;
  transition: opacity 0.2s;
}
.map-customer-node,
.map-area-node,
.map-record-node {
  cursor: pointer;
  outline: none;
}
.map-center-ring {
  fill: none;
  stroke: #6366f1;
  stroke-width: 1;
  stroke-dasharray: 3 5;
  opacity: 0.35;
}
.map-center {
  fill: #4338ca;
  stroke: #818cf8;
  stroke-width: 3;
}
.map-customer-node > svg {
  color: #e0e7ff;
}
.map-center-name {
  fill: white;
  text-anchor: middle;
  font-size: 17px;
  font-weight: 700;
}
.map-center-id {
  fill: #c7d2fe;
  text-anchor: middle;
  font-size: 11px;
}
.map-center-status {
  fill: #c7d2fe;
  text-anchor: middle;
  font-size: 8px;
  letter-spacing: 1px;
}
.map-area-card {
  fill: var(--appearance-surface);
  stroke-width: 1;
  filter: drop-shadow(0 4px 8px #00000009);
}
.map-area-selected .map-area-card,
.map-area-node:focus-visible .map-area-card {
  stroke-width: 3;
}
.map-area-label {
  fill: var(--appearance-text);
  font-size: 13px;
  font-weight: 700;
}
.map-area-count {
  font-size: 22px;
  font-weight: 800;
}
.map-area-caption {
  fill: var(--appearance-secondary);
  font-size: 11px;
}
.map-record-circle {
  fill: var(--appearance-surface);
  stroke-width: 2;
}
.map-record-selected .map-record-circle,
.map-record-node:focus-visible .map-record-circle {
  stroke-width: 4;
  r: 20px;
}
.map-customer-node:focus-visible .map-center {
  stroke: white;
  stroke-width: 5;
}
.map-record-title {
  fill: var(--appearance-text);
  font-size: 13px;
  text-anchor: middle;
  font-weight: 600;
}
.map-record-id {
  fill: var(--appearance-secondary);
  font-size: 10px;
  text-anchor: middle;
}
.map-legend {
  padding: 11px 14px;
  display: flex;
  align-items: center;
  gap: 13px;
  flex-wrap: wrap;
  border-top: 1px solid var(--appearance-border);
  font-size: 10px;
  color: var(--appearance-secondary);
}
.map-legend span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.map-legend i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.legend-danger {
  background: #ef4444;
}
.legend-warning {
  background: #f59e0b;
}
.legend-success {
  background: #10b981;
}
.legend-neutral {
  background: #94a3b8;
}
.map-legend button {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-left: auto;
}
.map-legend svg {
  width: 11px;
  height: 11px;
}
@media (max-width: 800px) {
  .relationship-map-toolbar {
    flex-wrap: wrap;
  }
  .relationship-map-toolbar small {
    display: none;
  }
  .relationship-map-canvas {
    max-height: 480px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .map-dimmed {
    transition: none;
  }
}
</style>
