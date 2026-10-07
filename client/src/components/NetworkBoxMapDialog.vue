<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { Map as LeafletMap, TileLayer } from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, LocateFixed, RefreshCw, Copy } from "lucide-vue-next";
import type { NetworkBox } from "../networkApi";
import { toast } from "../notifications/toast";
import RecordDetailDialog from "./RecordDetailDialog.vue";

const props = defineProps<{ box: NetworkBox }>();
const emit = defineEmits<{ close: [] }>();
const container = ref<HTMLDivElement>();
const loading = ref(true),
  error = ref(""),
  tileError = ref(false);
const coordinates = computed(() => props.box.coordinates);
const address = computed(() => [props.box.address, props.box.neighborhood, props.box.city].filter(Boolean).join(" · "));
let map: LeafletMap | undefined, tiles: TileLayer | undefined, observer: ResizeObserver | undefined;
let disposed = false;
function center() {
  const point = coordinates.value;
  if (point && map) map.setView([point.latitude, point.longitude], 17, { animate: false });
}
function retryTiles() {
  tileError.value = false;
  tiles?.redraw();
}
async function copy() {
  const point = coordinates.value;
  if (!point) return;
  try {
    await navigator.clipboard.writeText(`${point.latitude}, ${point.longitude}`);
    toast.success("Coordenadas copiadas");
  } catch {
    toast.error("Não foi possível copiar as coordenadas");
  }
}
onMounted(async () => {
  try {
    await nextTick();
    const L = await import("leaflet");
    if (disposed || !container.value) return;
    const point = coordinates.value;
    if (!point) {
      error.value = "Esta caixa não possui coordenadas válidas cadastradas no IXC.";
      return;
    }
    // Immediate zoom avoids delayed Leaflet transition callbacks after a user
    // closes the native dialog, and keeps the compact map responsive.
    map = L.map(container.value, {
      zoomControl: false,
      scrollWheelZoom: false,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
      maxZoom: 19,
    });
    L.control.zoom({ zoomInTitle: "Aproximar", zoomOutTitle: "Afastar" }).addTo(map);
    tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    })
      .on("tileerror", () => {
        if (!disposed) tileError.value = true;
      })
      .addTo(map);
    const tooltip = document.createElement("span");
    // IXC names are data, never popup HTML.
    tooltip.textContent = `${props.box.name} · Caixa #${props.box.id}`;
    L.marker([point.latitude, point.longitude], {
      title: `Caixa ${props.box.name}`,
      icon: L.divIcon({
        className: "network-map-marker",
        html: '<span class="network-map-pin" aria-hidden="true"></span>',
        iconSize: [32, 40],
        iconAnchor: [16, 38],
        tooltipAnchor: [0, -34],
      }),
    })
      .addTo(map)
      .bindTooltip(tooltip, { direction: "top" });
    center();
    observer = new ResizeObserver(() => map?.invalidateSize({ pan: false }));
    observer.observe(container.value);
    map.invalidateSize({ pan: false });
  } catch {
    if (!disposed) error.value = "Não foi possível abrir o mapa. Feche e tente novamente.";
  } finally {
    if (!disposed) loading.value = false;
  }
});
onBeforeUnmount(() => {
  disposed = true;
  observer?.disconnect();
  tiles?.off();
  map?.remove();
  map = undefined;
});
</script>
<template>
  <RecordDetailDialog
    :title="box.name"
    :subtitle="`Localização da caixa #${box.id} · Rede`"
    :icon="MapPin"
    module="network"
    @close="emit('close')"
  >
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium">{{ address || "Endereço não informado no IXC" }}</p>
        <p v-if="coordinates" class="mt-1 text-[11px] text-slate-500">
          Latitude {{ coordinates.latitude }} · Longitude {{ coordinates.longitude }}
        </p>
      </div>
      <button v-if="coordinates" type="button" class="button-secondary" @click="copy">
        <Copy class="h-3.5 w-3.5" aria-hidden="true" />Copiar coordenadas
      </button>
      <button type="button" class="button-secondary" :disabled="loading || !!error" @click="center">
        <LocateFixed class="h-3.5 w-3.5" aria-hidden="true" />Centralizar caixa
      </button>
    </div>
    <p v-if="loading" class="mb-2 text-xs text-slate-500" role="status">Carregando mapa…</p>
    <p v-if="error" class="rounded-lg border border-slate-200 p-3 text-xs" role="alert">{{ error }}</p>
    <div
      v-if="tileError && !error"
      class="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"
      role="alert"
    >
      <span>Não foi possível carregar parte do mapa. A posição da caixa permanece indicada.</span>
      <button type="button" class="button-secondary" @click="retryTiles">
        <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Tentar novamente
      </button>
    </div>
    <div
      v-show="!error"
      ref="container"
      class="network-box-map"
      role="region"
      :aria-label="`Mapa da caixa ${box.name}. Use os controles de zoom e as setas para navegar.`"
    />
    <p class="mt-2 text-[11px] text-slate-500">Posição conforme as coordenadas cadastradas no IXC.</p>
  </RecordDetailDialog>
</template>
