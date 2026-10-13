<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Trophy,
  Plus,
  Play,
  Radio,
  Copy,
  Download,
  Link,
  Unlink,
  Users,
  SlidersHorizontal,
  Gift,
  ChevronUp,
  ChevronDown,
  X,
  Check,
  RefreshCw,
  Smartphone,
  ArrowUpRight,
  ImagePlus,
} from "lucide-vue-next";
import {
  rafflesApi,
  raffleResultsText,
  type RaffleAdmin,
  type RaffleConfig,
  type RaffleListItem,
  type RaffleParticipant,
  type RafflePresentation,
} from "../rafflesApi";
import { useAuthStore } from "../stores/auth";
import { useRaffleLive } from "../composables/useRaffleLive";
import SearchableSelect from "../components/SearchableSelect.vue";
import RaffleStage from "../components/RaffleStage.vue";
import { toast } from "../notifications/toast";

const auth = useAuthStore(),
  route = useRoute(),
  router = useRouter();
const selectedId = ref(""),
  state = ref<RaffleAdmin | null>(null),
  items = ref<RaffleListItem[]>([]);
const options = ref<{ plans: { id: number; name: string }[]; products: { id: number; name: string }[] }>({ plans: [], products: [] });
const defaults = (): RaffleConfig => ({
  name: "Cliente premiado",
  background: "#00afe8",
  logo: "/cas-logo.png",
  prizes: ["PIX de R$ 500"],
  oncePerCustomer: false,
  filters: { startFrom: "", startTo: "", status: "A", planIds: [], productIds: [], productMatch: "any" },
});
const draft = reactive(defaults()),
  tab = ref("participants"),
  error = ref(""),
  notice = ref(""),
  busy = ref(false),
  loading = ref(false),
  catalogError = ref("");
const preview = ref<{ total: number; items: RaffleParticipant[] } | null>(null),
  checkedFilters = ref(""),
  publicUrl = ref("");
const { connected, unavailable, message } = useRaffleLive(selectedId, state);
const rulesLocked = computed(() => !!selectedId.value),
  started = computed(() => !!state.value && (state.value.phase === "countdown" || state.value.results.length > 0));
const dirty = computed(() => !!state.value && JSON.stringify(draft) !== JSON.stringify(state.value.config));
const results = computed(() => [...(state.value?.results ?? [])].reverse());
const checked = computed(() => checkedFilters.value === JSON.stringify(draft.filters));
const pool = computed(() => (state.value ? { total: state.value.total, items: state.value.sample } : checked.value ? preview.value : null));
const livePreview = computed<RafflePresentation>(
  () =>
    state.value ?? {
      id: "preview",
      name: draft.name || "Seu sorteio",
      background: draft.background,
      logo: draft.logo,
      prizes: draft.prizes,
      total: pool.value?.total ?? 0,
      remaining: pool.value?.total ?? 0,
      revision: 0,
      phase: "ready",
      countdownEndsAt: null,
      serverNow: new Date().toISOString(),
      results: [],
    }
);
const nextPrize = computed(() => state.value?.prizes[state.value.results.length] ?? "Todos os prêmios foram entregues");
const canDraw = computed(
  () =>
    state.value &&
    state.value.phase === "ready" &&
    state.value.remaining > 0 &&
    !busy.value &&
    !dirty.value &&
    connected.value &&
    !unavailable.value
);
let loadGeneration = 0;
let drawRequest: { id: string; requestId: string } | null = null;
function applyState(value: RaffleAdmin) {
  if (value.id !== selectedId.value) return;
  if (!state.value || state.value.id !== value.id || value.revision >= state.value.revision) state.value = value;
}
async function list() {
  try {
    items.value = (await rafflesApi.list()).items;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function catalogs() {
  catalogError.value = "";
  try {
    options.value = await rafflesApi.options();
  } catch (e) {
    catalogError.value = (e as Error).message;
  }
}
async function select(id: string) {
  const generation = ++loadGeneration;
  error.value = "";
  notice.value = "";
  publicUrl.value = "";
  preview.value = null;
  drawRequest = null;
  selectedId.value = "";
  state.value = null;
  if (!id) {
    Object.assign(draft, defaults());
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const s = await rafflesApi.get(id);
    if (generation !== loadGeneration) return;
    state.value = s;
    Object.assign(draft, JSON.parse(JSON.stringify(s.config)));
    selectedId.value = id;
  } catch (e) {
    if (generation === loadGeneration) error.value = (e as Error).message;
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}
watch(
  () => route.query.id,
  (id) => {
    void select(typeof id === "string" ? id : "");
  },
  { immediate: true }
);
watch(state, (s, old) => {
  if (!s || !old || s.id !== old.id) return;
  // Preserve unsaved edits, but follow configuration changes made by another administrator.
  if (JSON.stringify(draft) === JSON.stringify(old.config)) Object.assign(draft, JSON.parse(JSON.stringify(s.config)));
  if (s.results.length > old.results.length) drawRequest = null;
  const item = items.value.find((item) => item.id === s.id);
  if (item) {
    item.drawn = s.results.length;
    item.name = s.name;
  }
});
function tabKeyboard(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const element = event.currentTarget as HTMLElement;
  tab.value =
    event.key === "Home" ? "participants" : event.key === "End" ? "design" : tab.value === "participants" ? "design" : "participants";
  void nextTick(() => element.querySelector<HTMLButtonElement>('button[aria-selected="true"]')?.focus());
}
onMounted(() => {
  void list();
  if (auth.can("raffles.manage")) void catalogs();
});
async function action(work: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    await work();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
function routeTo(id: string) {
  void router.replace({ query: id ? { id } : {} });
}
async function newRaffle() {
  if (dirty.value) {
    if (
      !(await toast.confirm({
        title: "Descartar alterações?",
        message: "A apresentação editada ainda não foi salva.",
        type: "warning",
        confirmLabel: "Novo sorteio",
        cancelLabel: "Continuar editando",
      }))
    )
      return;
  }
  if (route.query.id) routeTo("");
  else await select("");
}
function addFilter(kind: "plans" | "products", value: string | number) {
  const id = Number(value),
    field = kind === "plans" ? draft.filters.planIds : draft.filters.productIds;
  if (id > 0 && !field.includes(id) && field.length < 50) field.push(id);
}
const choices = (kind: "plans" | "products") => [
  { value: 0, label: kind === "plans" ? "Adicionar plano…" : "Adicionar produto…" },
  ...options.value[kind].map((o) => ({ value: o.id, label: `${o.name} · #${o.id}` })),
];
const label = (kind: "plans" | "products", id: number) => options.value[kind].find((i) => i.id === id)?.name ?? `#${id}`;
function movePrize(index: number, offset: number) {
  const target = index + offset;
  if (target < 0 || target >= draft.prizes.length) return;
  [draft.prizes[index], draft.prizes[target]] = [draft.prizes[target]!, draft.prizes[index]!];
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  error.value = "";
  try {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 256 * 1024)
      throw new Error("Use uma imagem PNG, JPEG ou WebP de até 256 KB.");
    const src = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      r.readAsDataURL(file);
    });
    // Normalize WebP for the PDF renderer; keep all images bounded to the server limit.
    if (file.type === "image/webp") {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Imagem inválida."));
        image.src = src;
      });
      const canvas = document.createElement("canvas"),
        scale = Math.min(1, 512 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
      const normalized = canvas.toDataURL("image/png");
      if (normalized.length > 349000) throw new Error("A imagem convertida é muito grande. Use uma logo menor.");
      draft.logo = normalized;
    } else draft.logo = src;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    input.value = "";
  }
}
async function checkPool() {
  await action(async () => {
    const filters = JSON.parse(JSON.stringify(draft.filters));
    const result = await rafflesApi.preview(filters);
    preview.value = result;
    checkedFilters.value = JSON.stringify(filters);
    notice.value = `${result.total.toLocaleString("pt-BR")} contratos encontrados.`;
  });
}
async function prepare() {
  await action(async () => {
    const result = await rafflesApi.create(JSON.parse(JSON.stringify(draft)));
    await list();
    routeTo(result.id);
  });
}
async function save() {
  await action(async () => {
    applyState(await rafflesApi.update(selectedId.value, JSON.parse(JSON.stringify(draft))));
    if (state.value) Object.assign(draft, JSON.parse(JSON.stringify(state.value.config)));
    notice.value = "Apresentação salva.";
    await list();
  });
}
async function draw() {
  if (!canDraw.value) return;
  await action(async () => {
    if (!drawRequest || drawRequest.id !== selectedId.value) drawRequest = { id: selectedId.value, requestId: crypto.randomUUID() };
    const pendingRequest = drawRequest;
    applyState(await rafflesApi.draw(pendingRequest.id, pendingRequest.requestId));
  });
}
async function share(enabled: boolean) {
  await action(async () => {
    const result = await rafflesApi.share(selectedId.value, enabled);
    if (result.raffle.id !== selectedId.value) return;
    applyState(result.raffle);
    publicUrl.value = result.token ? new URL(`/sorteios/ao-vivo/${result.token}`, location.origin).toString() : "";
    notice.value = enabled ? "Link criado. Qualquer pessoa com o link poderá acompanhar os ganhadores." : "Link público revogado.";
  });
}
async function copy(text: string, feedback: string) {
  await action(async () => {
    await navigator.clipboard.writeText(text);
    notice.value = feedback;
  });
}
const formatDate = (v: string) =>
  new Date(v).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
</script>
<template>
  <div class="raffles-page">
    <header class="raffles-heading">
      <div>
        <span class="raffles-eyebrow">RELACIONAMENTO COM CLIENTES</span>
        <h1><Trophy :size="25" aria-hidden="true" />Sorteios</h1>
        <p>Transforme contratos em chances. Crie um momento para os seus clientes.</p>
      </div>
      <div class="raffles-header-actions">
        <button v-if="auth.can('raffles.manage')" class="button-primary" type="button" :disabled="busy || loading" @click="newRaffle">
          <Plus :size="15" />Novo sorteio</button
        ><button class="button-secondary" type="button" :disabled="busy" @click="list">
          <RefreshCw :size="14" /><span class="sr-only">Atualizar sorteios</span>
        </button>
      </div>
    </header>
    <div class="raffles-toolbar">
      <label for="raffle-selected">Evento</label
      ><select
        id="raffle-selected"
        :value="selectedId"
        :disabled="busy || loading"
        @change="routeTo(($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ auth.can("raffles.manage") ? "Preparar um novo sorteio" : "Selecione um sorteio" }}</option>
        <option v-for="item in items" :key="item.id" :value="item.id">
          {{ item.name }} · {{ item.drawn }} resultado(s) · {{ formatDate(item.createdAt) }}
        </option></select
      ><span v-if="selectedId" class="raffles-live-pill" :class="{ online: connected }"
        ><Radio :size="12" />{{ connected ? "Sincronizado" : "Reconectando" }}</span
      >
    </div>
    <p v-if="loading" class="raffles-feedback" role="status">Carregando o evento…</p>
    <p v-if="error" class="raffles-feedback error" role="alert">{{ error }}</p>
    <p v-if="notice" class="raffles-feedback success" role="status"><Check :size="15" />{{ notice }}</p>
    <p v-if="message && selectedId" class="raffles-feedback" role="status">{{ message }}</p>
    <div v-if="!loading && (state || auth.can('raffles.manage'))" class="raffles-layout">
      <div class="raffles-controls">
        <section v-if="auth.can('raffles.manage')" class="panel raffles-config">
          <div class="raffles-config-tabs" role="tablist" aria-label="Configuração do sorteio" @keydown="tabKeyboard">
            <button
              type="button"
              role="tab"
              id="raffle-participants-tab"
              aria-controls="raffle-participants-panel"
              :aria-selected="tab === 'participants'"
              :tabindex="tab === 'participants' ? 0 : -1"
              @click="tab = 'participants'"
            >
              <SlidersHorizontal :size="15" />Participantes</button
            ><button
              type="button"
              role="tab"
              id="raffle-design-tab"
              aria-controls="raffle-design-panel"
              :aria-selected="tab === 'design'"
              :tabindex="tab === 'design' ? 0 : -1"
              @click="tab = 'design'"
            >
              <Gift :size="15" />Prêmios e visual
            </button>
          </div>
          <div
            v-if="tab === 'participants'"
            id="raffle-participants-panel"
            role="tabpanel"
            aria-labelledby="raffle-participants-tab"
            class="raffles-config-body"
          >
            <div class="raffles-section-title">
              <span>01</span>
              <div>
                <h2>Quem participa?</h2>
                <p>Uma chance por contrato elegível.</p>
              </div>
            </div>
            <p v-if="!rulesLocked" class="raffles-hint">
              O período de ativação e o status limitam todos os resultados. Dentro desses limites, basta atender a um plano OU à regra de
              produtos selecionada. Critérios não preenchidos são ignorados.
            </p>
            <p v-if="rulesLocked" class="raffles-hint">
              Lista congelada em {{ formatDate(state!.createdAt) }}. Para aplicar outros filtros, prepare um novo sorteio.
            </p>
            <fieldset :disabled="rulesLocked || busy">
              <legend class="sr-only">Filtros dos contratos</legend>
              <div class="raffles-field">
                <label for="raffle-status">Status do contrato</label
                ><select id="raffle-status" v-model="draft.filters.status">
                  <option value="A">Ativos</option>
                  <option value="all">Todos os status</option>
                  <option value="I">Inativos</option>
                  <option value="P">Pré-contratos</option>
                  <option value="N">Negativados</option>
                  <option value="D">Desistentes</option>
                </select>
              </div>
              <div class="raffles-field-row">
                <div class="raffles-field">
                  <label for="raffle-from">Ativação a partir de</label
                  ><input id="raffle-from" v-model="draft.filters.startFrom" type="date" />
                </div>
                <div class="raffles-field">
                  <label for="raffle-to">Ativação até</label
                  ><input id="raffle-to" v-model="draft.filters.startTo" type="date" :min="draft.filters.startFrom || undefined" />
                </div>
              </div>
              <div class="raffles-field">
                <SearchableSelect
                  :model-value="0"
                  :options="choices('plans')"
                  label="Planos dos contratos"
                  :disabled="rulesLocked || busy"
                  @update:model-value="addFilter('plans', $event)"
                />
                <div class="raffles-chips">
                  <span v-for="id in draft.filters.planIds" :key="id"
                    >{{ label("plans", id)
                    }}<button
                      type="button"
                      :aria-label="`Remover plano ${label('plans', id)}`"
                      @click="draft.filters.planIds = draft.filters.planIds.filter((v) => v !== id)"
                    >
                      <X :size="12" /></button
                  ></span>
                </div>
                <p class="raffles-hint">
                  {{ draft.filters.planIds.length ? "Contratos com qualquer um dos planos selecionados." : "Nenhum plano selecionado." }}
                </p>
              </div>
              <div class="raffles-field">
                <SearchableSelect
                  :model-value="0"
                  :options="choices('products')"
                  label="Produtos do contrato"
                  :disabled="rulesLocked || busy"
                  @update:model-value="addFilter('products', $event)"
                />
                <div class="raffles-chips">
                  <span v-for="id in draft.filters.productIds" :key="id"
                    >{{ label("products", id)
                    }}<button
                      type="button"
                      :aria-label="`Remover produto ${label('products', id)}`"
                      @click="draft.filters.productIds = draft.filters.productIds.filter((v) => v !== id)"
                    >
                      <X :size="12" /></button
                  ></span>
                </div>
                <select
                  v-if="draft.filters.productIds.length > 1"
                  v-model="draft.filters.productMatch"
                  aria-label="Combinação dos produtos"
                >
                  <option value="any">Com qualquer produto selecionado</option>
                  <option value="all">Com todos os produtos selecionados</option>
                </select>
                <p class="raffles-hint">Inclui produtos vinculados diretamente ao contrato e ao plano.</p>
              </div>
              <label class="raffles-checkbox"
                ><input v-model="draft.oncePerCustomer" type="checkbox" /><span
                  ><strong>Limitar a um prêmio por cliente</strong
                  ><small>Após ganhar, todos os contratos desse cliente saem das próximas rodadas.</small></span
                ></label
              >
            </fieldset>
            <p v-if="catalogError" class="raffles-feedback error">
              {{ catalogError }}<button type="button" class="raffles-text-button" @click="catalogs">Recarregar opções</button>
            </p>
            <button v-if="!rulesLocked" type="button" class="button-secondary raffles-full" :disabled="busy" @click="checkPool">
              <Users :size="15" />{{ busy ? "Consultando…" : "Conferir participantes" }}
            </button>
          </div>
          <div v-else id="raffle-design-panel" role="tabpanel" aria-labelledby="raffle-design-tab" class="raffles-config-body">
            <div class="raffles-section-title">
              <span>02</span>
              <div>
                <h2>Crie o momento</h2>
                <p>Prêmios na ordem em que serão sorteados.</p>
              </div>
            </div>
            <p v-if="started" class="raffles-hint">A configuração fica congelada depois da primeira rodada.</p>
            <fieldset :disabled="started || busy">
              <legend class="sr-only">Prêmios e apresentação</legend>
              <div class="raffles-field">
                <label for="raffle-name">Nome do sorteio</label
                ><input id="raffle-name" v-model="draft.name" maxlength="100" placeholder="Ex.: Cliente premiado CAS" />
              </div>
              <div class="raffles-field">
                <label>Prêmios</label>
                <div v-for="(_, i) in draft.prizes" :key="i" class="raffles-prize-row">
                  <span>{{ i + 1 }}</span
                  ><input
                    v-model="draft.prizes[i]"
                    :aria-label="`${i + 1}º prêmio`"
                    maxlength="120"
                    placeholder="Ex.: PIX de R$ 500"
                  /><button type="button" :disabled="i === 0" :aria-label="`Antecipar prêmio ${i + 1}`" @click="movePrize(i, -1)">
                    <ChevronUp :size="15" /></button
                  ><button
                    type="button"
                    :disabled="i === draft.prizes.length - 1"
                    :aria-label="`Adiar prêmio ${i + 1}`"
                    @click="movePrize(i, 1)"
                  >
                    <ChevronDown :size="15" /></button
                  ><button
                    type="button"
                    :disabled="draft.prizes.length === 1"
                    :aria-label="`Remover prêmio ${i + 1}`"
                    @click="draft.prizes.splice(i, 1)"
                  >
                    <X :size="15" />
                  </button>
                </div>
                <button class="raffles-text-button" type="button" :disabled="draft.prizes.length >= 200" @click="draft.prizes.push('')">
                  <Plus :size="14" />Adicionar prêmio
                </button>
              </div>
              <div class="raffles-field">
                <label for="raffle-color">Cor do evento</label>
                <div class="raffles-colors">
                  <button
                    v-for="color in ['#00afe8', '#2563eb', '#7c3aed', '#059669', '#e78613', '#172033']"
                    :key="color"
                    type="button"
                    :style="{ background: color }"
                    :aria-label="`Cor ${color}`"
                    :aria-pressed="draft.background === color"
                    @click="draft.background = color"
                  >
                    <Check v-if="draft.background === color" :size="15" /></button
                  ><input id="raffle-color" v-model="draft.background" type="color" />
                </div>
              </div>
              <div class="raffles-field">
                <label for="raffle-logo">Logo do evento</label>
                <div class="raffles-logo-upload">
                  <img v-if="draft.logo" :src="draft.logo" alt="Logo selecionada" /><label class="button-secondary" for="raffle-logo"
                    ><ImagePlus :size="15" />Escolher imagem</label
                  ><input id="raffle-logo" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp" @change="upload" /><button
                    v-if="draft.logo"
                    type="button"
                    class="raffles-text-button"
                    @click="draft.logo = ''"
                  >
                    Remover
                  </button>
                </div>
                <p class="raffles-hint">PNG, JPEG ou WebP · até 256 KB.</p>
              </div>
            </fieldset>
            <button v-if="state && !started" type="button" class="button-primary raffles-full" :disabled="busy || !dirty" @click="save">
              Salvar apresentação
            </button>
          </div>
        </section>
        <section v-if="pool" class="panel raffles-pool">
          <div class="raffles-pool-heading">
            <div class="raffles-stat-icon"><Users :size="21" /></div>
            <div>
              <strong>{{ pool.total.toLocaleString("pt-BR") }}</strong
              ><span>contratos {{ state ? "participando" : "encontrados" }}</span>
            </div>
            <span v-if="state" class="raffles-frozen"><Check :size="12" />Lista preparada</span>
          </div>
          <details>
            <summary>Conferir amostra de {{ pool.items.length }} contratos</summary>
            <ul>
              <li v-for="p in pool.items" :key="p.contractId">
                <strong>#{{ p.contractId }} · {{ p.customerName }}</strong
                ><span>{{ p.plan ?? "Sem plano informado" }} · {{ p.city ?? "Sem localidade" }}</span>
              </li>
            </ul>
            <p class="raffles-hint">
              Esta amostra permite conferir os filtros. O sorteio utiliza todos os {{ pool.total.toLocaleString("pt-BR") }} contratos
              elegíveis.
            </p>
          </details>
        </section>
        <button
          v-if="!state && auth.can('raffles.manage')"
          type="button"
          class="button-primary raffles-prepare"
          :disabled="busy || !draft.name.trim() || draft.prizes.some((p) => !p.trim())"
          @click="prepare"
        >
          <Check :size="18" />{{ busy ? "Preparando…" : "Preparar sorteio" }}<span>{{ draft.prizes.length }} prêmio(s)</span>
        </button>
        <section v-if="state" class="panel raffles-run">
          <span class="raffles-eyebrow">{{ state.phase === "finished" ? "EVENTO CONCLUÍDO" : "PRÓXIMA RODADA" }}</span>
          <h2>{{ nextPrize }}</h2>
          <p>
            {{
              state.phase === "finished"
                ? "Todos os ganhadores estão registrados abaixo."
                : `${state.remaining.toLocaleString("pt-BR")} contratos disponíveis · ${state.results.length + 1}º prêmio`
            }}
          </p>
          <button v-if="auth.can('raffles.draw')" type="button" class="raffles-draw" :disabled="!canDraw" @click="draw">
            <Play :size="18" fill="currentColor" />{{
              state.phase === "countdown"
                ? "Sorteio em andamento…"
                : state.phase === "finished"
                  ? "Sorteio concluído"
                  : busy
                    ? "Iniciando…"
                    : drawRequest
                      ? "Retomar solicitação"
                      : "Sortear agora"
            }}<span v-if="state.phase === 'ready'">3 segundos</span>
          </button>
          <p v-if="dirty" class="raffles-hint">Salve a apresentação antes de sortear.</p>
          <p v-else-if="!connected && state.phase === 'ready'" class="raffles-hint">Aguarde a conexão para iniciar uma rodada.</p>
          <p v-if="!auth.can('raffles.draw')" class="raffles-hint">
            Você possui acesso de visualização. A rodada será iniciada pelo operador autorizado.
          </p>
        </section>
        <section v-if="state && auth.can('raffles.share')" class="panel raffles-sharing">
          <div class="raffles-section-title">
            <Link :size="18" />
            <div>
              <h2>Leve o evento ao público</h2>
              <p>O mesmo card, sincronizado em tempo real.</p>
            </div>
          </div>
          <template v-if="publicUrl"
            ><div class="raffles-link-field">
              <input :value="publicUrl" readonly aria-label="Link público do sorteio" /><button
                type="button"
                aria-label="Copiar link público"
                @click="copy(publicUrl, 'Link copiado.')"
              >
                <Copy :size="16" />
              </button>
            </div>
            <a :href="publicUrl" target="_blank" rel="noopener noreferrer" class="raffles-text-button"
              >Abrir tela pública<ArrowUpRight :size="14" /></a></template
          ><button v-else type="button" class="button-secondary raffles-full" :disabled="busy" @click="share(true)">
            <Link :size="15" />{{ state.sharing ? "Gerar novo link público" : "Criar link público" }}
          </button>
          <p v-if="state.sharing && !publicUrl" class="raffles-hint">Existe um link ativo. Gerar um novo link revoga o anterior.</p>
          <button v-if="state.sharing" type="button" class="raffles-text-button raffles-revoke" :disabled="busy" @click="share(false)">
            <Unlink :size="13" />Revogar acesso público
          </button>
          <p class="raffles-hint">O link exibe nome, contrato e localidade dos ganhadores. Não permite controlar as rodadas.</p>
        </section>
      </div>
      <div class="raffles-display">
        <section class="raffles-stage-panel">
          <header>
            <div>
              <span class="raffles-eyebrow">TELA DO EVENTO</span>
              <h2>Um palco para cada ganhador</h2>
              <p>{{ state ? "Essa composição também aparece no link público." : "Personalize o visual na aba Prêmios e visual." }}</p>
            </div>
            <Smartphone :size="19" aria-hidden="true" />
          </header>
          <RaffleStage :raffle="livePreview" :connected="connected" :preview="!state" />
        </section>
        <section class="panel raffles-history">
          <header>
            <div>
              <h2>Últimos resultados</h2>
              <p>Os mais recentes aparecem primeiro.</p>
            </div>
            <span>{{ results.length }} sorteado(s)</span>
          </header>
          <div v-if="state" class="raffles-results-actions">
            <button
              type="button"
              class="button-secondary"
              :disabled="busy || !results.length"
              @click="copy(raffleResultsText(state!), 'Resultados copiados.')"
            >
              <Copy :size="13" />Copiar resultados</button
            ><button
              v-if="auth.can('raffles.export')"
              type="button"
              class="button-secondary"
              :disabled="busy"
              @click="action(() => rafflesApi.pdf(selectedId))"
            >
              <Download :size="13" />Exportar PDF
            </button>
          </div>
          <div v-if="!results.length" class="raffles-history-empty">
            <Trophy :size="25" />
            <p>O primeiro momento de sorte está por vir.</p>
          </div>
          <ol v-else>
            <li v-for="r in results" :key="r.order">
              <div class="raffles-result-place">{{ r.order }}</div>
              <div>
                <span>{{ r.prize }}</span
                ><strong>#{{ r.contractId }} · {{ r.customerName }}</strong
                ><small>{{ r.city ?? "Sem localidade" }} · {{ formatDate(r.drawnAt) }}</small>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </div>
    <p v-else-if="!loading && !error" class="raffles-empty">Selecione um evento para acompanhar os sorteios e os resultados.</p>
  </div>
</template>
<style scoped>
.raffles-page {
  max-width: 1450px;
  margin: auto;
}
.raffles-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 22px;
}
.raffles-eyebrow {
  font-size: 9px;
  letter-spacing: 1.8px;
  font-weight: 800;
  color: #63758e;
}
.raffles-heading h1 {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 27px;
  font-weight: 800;
  letter-spacing: -1px;
  margin: 4px 0;
}
.raffles-heading h1 svg {
  color: #d38b19;
}
.raffles-heading p {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}
.raffles-header-actions {
  display: flex;
  gap: 8px;
}
.raffles-toolbar {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 12px 16px;
  background: var(--appearance-surface, #fff);
  border: 1px solid var(--appearance-border, #e2e8f0);
  border-radius: 13px;
  margin-bottom: 20px;
}
.raffles-toolbar > label {
  font-size: 11px;
  font-weight: 700;
}
.raffles-toolbar select {
  flex: 1;
  min-width: 0;
  max-width: 600px;
}
.raffles-page select,
.raffles-page input:not([type="checkbox"]):not([type="color"]):not([type="file"]) {
  width: 100%;
  border: 1px solid var(--appearance-border, #dce4ef);
  border-radius: 8px;
  min-height: 36px;
  padding: 7px 10px;
  font-size: 12px;
  background: var(--appearance-surface, #fff);
  color: inherit;
}
.raffles-page select:focus,
.raffles-page input:focus {
  outline: 2px solid #00afe877;
  outline-offset: 1px;
}
.raffles-page fieldset:disabled {
  opacity: 0.7;
}
.raffles-layout {
  display: grid;
  grid-template-columns: minmax(350px, 0.95fr) minmax(390px, 1.05fr);
  gap: 24px;
  align-items: start;
}
.raffles-controls,
.raffles-display {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.raffles-config {
  overflow: visible;
}
.raffles-config-tabs {
  display: flex;
  padding: 7px;
  border-bottom: 1px solid var(--appearance-border, #e2e8f0);
  gap: 6px;
}
.raffles-config-tabs button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 8px;
  padding: 11px 6px;
  color: #718095;
  font-size: 12px;
  font-weight: 700;
}
.raffles-config-tabs button[aria-selected="true"] {
  background: #e8f8fd;
  color: #087697;
}
.raffles-config-body {
  padding: 23px;
}
.raffles-section-title {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 21px;
}
.raffles-section-title > span {
  font-size: 10px;
  font-weight: 800;
  background: #edf5fa;
  color: #57809b;
  border-radius: 8px;
  padding: 9px;
}
.raffles-section-title h2,
.raffles-history h2 {
  font-size: 14px;
  font-weight: 800;
}
.raffles-section-title p,
.raffles-history header p {
  font-size: 11px;
  color: #76849a;
  margin-top: 4px;
}
.raffles-field {
  margin-bottom: 18px;
}
.raffles-field > label {
  display: block;
  font-weight: 700;
  font-size: 11px;
  margin-bottom: 7px;
}
.raffles-field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.raffles-hint {
  font-size: 10px;
  line-height: 1.6;
  color: #718198;
  margin-top: 7px;
}
.raffles-config-body > p.raffles-hint {
  margin: 0 0 15px;
  padding: 10px;
  border: 1px dashed #b8cbdb;
  border-radius: 8px;
}
.raffles-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}
.raffles-chips > span {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  font-size: 10px;
  background: #edf6fb;
  color: #2b637f;
  border-radius: 7px;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.raffles-chips button {
  padding: 2px;
}
.raffles-checkbox {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 13px;
  background: var(--appearance-muted, #f3f7fa);
  border-radius: 10px;
  margin-bottom: 17px;
}
.raffles-checkbox input {
  margin-top: 2px;
  accent-color: #089dc4;
}
.raffles-checkbox strong {
  font-size: 11px;
  display: block;
}
.raffles-checkbox small {
  display: block;
  font-size: 10px;
  color: #718198;
  margin-top: 5px;
  line-height: 1.5;
}
.raffles-full {
  width: 100%;
  justify-content: center;
}
.raffles-prize-row {
  display: flex;
  gap: 4px;
  align-items: center;
  margin: 8px 0;
}
.raffles-prize-row > span {
  font-size: 10px;
  font-weight: 800;
  padding: 4px;
  min-width: 18px;
  color: #8693a6;
}
.raffles-prize-row input {
  min-width: 0;
  flex: 1;
}
.raffles-prize-row button {
  padding: 4px;
  color: #7988a0;
}
.raffles-prize-row button:disabled {
  opacity: 0.25;
}
.raffles-text-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #138eb0;
  margin-top: 8px;
  padding: 4px 0;
}
.raffles-colors {
  display: flex;
  align-items: center;
  gap: 9px;
}
.raffles-colors button {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: white;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px #dce4ef;
}
.raffles-colors button[aria-pressed="true"] {
  box-shadow: 0 0 0 2px #4a7795;
}
.raffles-colors input {
  height: 30px;
  width: 35px;
  background: none;
  border: none;
  cursor: pointer;
}
.raffles-logo-upload {
  display: flex;
  align-items: center;
  gap: 10px;
}
.raffles-logo-upload img {
  width: 43px;
  height: 43px;
  object-fit: contain;
  background: #fff;
  border: 1px solid #dce4ef;
  border-radius: 8px;
  padding: 4px;
}
.raffles-logo-upload .button-secondary {
  font-size: 11px;
  cursor: pointer;
}
.raffles-pool {
  padding: 17px 21px;
}
.raffles-pool-heading {
  display: flex;
  align-items: center;
  gap: 13px;
}
.raffles-stat-icon {
  padding: 12px;
  background: #e8f8fd;
  color: #1191b3;
  border-radius: 12px;
}
.raffles-pool-heading strong {
  display: block;
  font-size: 25px;
  font-weight: 800;
  line-height: 1.1;
}
.raffles-pool-heading span {
  font-size: 10px;
  color: #6d7f97;
}
.raffles-pool-heading .raffles-frozen {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 9px;
  color: #138568;
  background: #e6faf2;
  border-radius: 13px;
  padding: 5px 7px;
}
.raffles-pool details {
  font-size: 11px;
  margin-top: 15px;
}
.raffles-pool summary {
  cursor: pointer;
  color: #66809b;
  font-weight: 600;
}
.raffles-pool ul {
  max-height: 230px;
  overflow: auto;
  margin-top: 10px;
}
.raffles-pool li {
  padding: 9px 0;
  border-top: 1px solid var(--appearance-border, #eef2f7);
}
.raffles-pool li strong {
  display: block;
  font-size: 11px;
}
.raffles-pool li span {
  display: block;
  font-size: 10px;
  color: #8290a4;
  margin-top: 3px;
}
.raffles-prepare {
  justify-content: center;
  min-height: 51px;
}
.raffles-prepare > span {
  font-size: 10px;
  opacity: 0.65;
  margin-left: auto;
}
.raffles-run {
  padding: 22px;
}
.raffles-run h2 {
  font-size: 20px;
  font-weight: 800;
  margin-top: 9px;
  overflow-wrap: anywhere;
}
.raffles-run p {
  color: #718198;
  font-size: 11px;
  margin-top: 7px;
}
.raffles-draw {
  margin-top: 20px;
  width: 100%;
  background: #0b95b9;
  color: #fff;
  border-radius: 11px;
  padding: 16px 17px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  font-size: 14px;
  font-weight: 800;
  box-shadow: 0 6px 19px #089dc422;
}
.raffles-draw > span {
  margin-left: auto;
  font-size: 10px;
  font-weight: 500;
}
.raffles-draw:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.raffles-sharing {
  padding: 21px;
}
.raffles-link-field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.raffles-link-field input {
  font-size: 10px !important;
}
.raffles-link-field button {
  padding: 8px;
  color: #198dae;
}
.raffles-revoke {
  color: #b45863;
  display: flex;
  margin-top: 12px;
}
.raffles-stage-panel {
  padding: 25px 24px;
  background: #1b293e;
  border: 1px solid #31415a;
  border-radius: 19px;
  color: #f1f6ff;
}
.raffles-stage-panel > header {
  display: flex;
  align-items: center;
  gap: 14px;
  justify-content: space-between;
  margin-bottom: 24px;
}
.raffles-stage-panel > header .raffles-eyebrow {
  color: #91a5c0;
}
.raffles-stage-panel > header h2 {
  font-weight: 800;
  font-size: 16px;
  margin-top: 6px;
}
.raffles-stage-panel > header p {
  color: #9bacc4;
  font-size: 11px;
  line-height: 1.6;
  margin-top: 5px;
}
.raffles-stage-panel > header svg {
  color: #8ea9d0;
  flex-shrink: 0;
}
.raffles-live-pill {
  display: flex;
  gap: 5px;
  align-items: center;
  font-size: 10px;
  color: #9a6f30;
  white-space: nowrap;
  margin-left: auto;
}
.raffles-live-pill.online {
  color: #07956d;
}
.raffles-history {
  padding: 22px;
}
.raffles-history > header {
  display: flex;
  gap: 10px;
  justify-content: space-between;
  align-items: center;
}
.raffles-history > header > span {
  font-size: 10px;
  background: #e8f4fa;
  color: #4b7294;
  border-radius: 15px;
  padding: 5px 9px;
}
.raffles-history-empty {
  text-align: center;
  padding: 26px 12px;
  color: #95a4b8;
  font-size: 11px;
}
.raffles-history-empty svg {
  margin: 0 auto 12px;
}
.raffles-results-actions {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 17px;
}
.raffles-results-actions button {
  font-size: 10px;
}
.raffles-history ol {
  margin-top: 17px;
  display: grid;
  gap: 9px;
  max-height: 460px;
  overflow: auto;
}
.raffles-history li {
  display: flex;
  gap: 11px;
  border: 1px solid var(--appearance-border, #e2e8f0);
  border-radius: 11px;
  padding: 13px 12px;
}
.raffles-result-place {
  width: 27px;
  height: 27px;
  border-radius: 8px;
  background: #fff5dc;
  color: #b88222;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 11px;
  flex-shrink: 0;
}
.raffles-history li span {
  display: block;
  font-size: 10px;
  color: #9a7a36;
}
.raffles-history li strong {
  display: block;
  font-size: 12px;
  margin-top: 4px;
  overflow-wrap: anywhere;
}
.raffles-history li small {
  display: block;
  font-size: 10px;
  color: #7a8a9e;
  margin-top: 5px;
}
.raffles-feedback {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  border: 1px solid #d4dfe9;
  border-radius: 9px;
  padding: 11px 14px;
  background: #eff5fb;
  margin-bottom: 14px;
  color: #365674;
}
.raffles-feedback.error {
  background: #fff3ef;
  border-color: #f4c6b4;
  color: #b84d32;
}
.raffles-feedback.success {
  background: #effbf7;
  border-color: #c2ecdf;
  color: #168469;
}
.raffles-empty {
  padding: 70px 20px;
  text-align: center;
  color: #7b8ba1;
  font-size: 13px;
}
@media (min-width: 1300px) {
  .raffles-layout {
    grid-template-columns: minmax(450px, 1fr) minmax(480px, 1fr);
    gap: 32px;
  }
  .raffles-stage-panel {
    padding: 28px 35px;
  }
}
@media (max-width: 960px) {
  .raffles-layout {
    grid-template-columns: minmax(0, 1fr);
    max-width: 650px;
    margin: auto;
  }
  .raffles-heading {
    align-items: flex-start;
  }
  .raffles-heading h1 {
    font-size: 25px;
  }
  .raffles-heading p {
    max-width: 330px;
  }
  .raffles-stage-panel {
    padding: 23px 20px;
  }
}
@media (max-width: 500px) {
  .raffles-toolbar {
    flex-wrap: wrap;
    gap: 7px;
  }
  .raffles-toolbar select {
    min-width: 80%;
    font-size: 11px;
  }
  .raffles-config-body {
    padding: 18px;
  }
  .raffles-field-row {
    gap: 8px;
  }
  .raffles-stage-panel {
    padding: 20px 14px;
  }
  .raffles-heading .button-primary {
    font-size: 10px;
    padding: 9px;
  }
  .raffles-heading p {
    font-size: 10px;
  }
  .raffles-header-actions {
    gap: 4px;
  }
}
</style>
