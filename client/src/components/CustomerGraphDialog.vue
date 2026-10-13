<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  Orbit,
  RefreshCw,
  Search,
  ArrowUpRight,
  ChevronRight,
  Sparkles,
  LockKeyhole,
  AlertTriangle,
  Network,
  MapPin,
  UserRound,
  FileText,
  Wallet,
  Wifi,
  Wrench,
  Headset,
  Router,
  CalendarDays,
  CircleCheck,
  Focus,
} from "lucide-vue-next";
import { supportApi, caseStatus, contractStatus } from "../supportApi";
import { financialTitleStatus } from "../financialTitleStatus";
import {
  graphAreas,
  graphInsights,
  graphRelations,
  groupCaption,
  recordTarget,
  type GraphArea,
  type GraphRecord,
} from "../customerGraph/model";
import { useAuthStore } from "../stores/auth";
import { useLiveQuery } from "../composables/useLiveQuery";
import { formatConsulted, internetStatus } from "../upgradesApi";
import RecordDetailDialog from "./RecordDetailDialog.vue";
import LiveQueryState from "./LiveQueryState.vue";
import RecordQuickLink from "./RecordQuickLink.vue";
import CustomerRelationshipMap from "./CustomerRelationshipMap.vue";
const props = defineProps<{ customerId: number; customerName: string }>();
const emit = defineEmits<{ close: [] }>();
const auth = useAuthStore(),
  router = useRouter();
const selected = ref("customer"),
  search = ref(""),
  attentionOnly = ref(false),
  showRelations = ref(false);
const { data, loading, error, reload } = useLiveQuery((signal) => supportApi.graph(String(props.customerId), signal));
const icons = { contracts: FileText, logins: Wifi, orders: Wrench, tickets: Headset, financial: Wallet, equipment: Router };
const records = computed(() => graphAreas.flatMap((a) => data.value?.groups[a.key].records ?? []));
const currentRecord = computed(() => records.value.find((r) => r.key === selected.value));
const areaKey = computed(() => (selected.value.startsWith("area:") ? (selected.value.slice(5) as GraphArea) : currentRecord.value?.kind));
const area = computed(() => graphAreas.find((a) => a.key === areaKey.value));
const group = computed(() => (areaKey.value ? data.value?.groups[areaKey.value] : null));
const insights = computed(() => (data.value ? graphInsights(data.value) : []));
const related = computed(() =>
  graphRelations(records.value)
    .filter((l) => l.from === selected.value || l.to === selected.value)
    .map((l) => ({
      label:
        l.from === selected.value
          ? l.label
          : l.label === "Contrato vinculado"
            ? "Vinculado a este contrato"
            : l.label === "Login vinculado"
              ? "Vinculado a este login"
              : "Vinculado a este atendimento",
      record: records.value.find((r) => r.key === (l.from === selected.value ? l.to : l.from))!,
    }))
);
const visibleList = computed(() =>
  (group.value?.records ?? []).filter(
    (r) =>
      (!attentionOnly.value || ["danger", "warning"].includes(r.tone)) &&
      (!search.value ||
        `${r.title} ${r.id} ${r.subtitle ?? ""} ${r.facts.map((f) => f.value).join(" ")}`
          .toLocaleLowerCase("pt-BR")
          .includes(search.value.toLocaleLowerCase("pt-BR")))
  )
);
const available = computed(() => (data.value ? graphAreas.filter((a) => data.value!.groups[a.key].state === "ok").length : 0));
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null) => (value ? value.slice(0, 10).split("-").reverse().join("/") : "Não informada");
function statusLabel(r: GraphRecord) {
  if (r.kind === "contracts") return contractStatus(r.status ?? "");
  if (r.kind === "logins") return { online: "Online", offline: "Offline", inactive: "Inativo" }[r.status as "online"] ?? "Sem status";
  if (r.kind === "financial") return financialTitleStatus(r.status).label;
  if (r.kind === "orders" || r.kind === "tickets") return caseStatus(r.status ?? "", r.kind);
  return "Em posse";
}
function factValue(fact: { label: string; value: string }) {
  if (fact.label === "Permanência até" && fact.value !== "Não informada") return date(fact.value);
  if (fact.label === "Acesso") return internetStatus(fact.value);
  if (fact.label === "Prioridade")
    return ({ A: "Alta", C: "Crítica", N: "Normal", B: "Baixa" } as Record<string, string>)[fact.value] ?? fact.value;
  return fact.value;
}
function viewAll(key: GraphArea | "customer") {
  emit("close");
  if (key === "financial")
    void router.push({
      path: "/finance/list",
      query: {
        tab: "pending",
        kind: "receivable",
        scope: "aging",
        searchBy: "partyId",
        search: String(props.customerId),
        receivableScope: "all",
      },
    });
  else void router.push({ path: `/support/customers/${props.customerId}`, query: { tab: key === "equipment" ? "contracts" : key } });
}
watch(
  () => auth.can("support.customer.view"),
  (allowed) => {
    if (!allowed) emit("close");
  }
);
watch(
  () => JSON.stringify([auth.user?.role, auth.user?.permissions]),
  () => {
    if (auth.can("support.customer.view")) {
      selected.value = "customer";
      void reload();
    }
  }
);
watch([search, attentionOnly], () => {
  if (currentRecord.value) selected.value = `area:${currentRecord.value.kind}`;
});
</script>
<template>
  <RecordDetailDialog
    title="Mapa 360° do cliente"
    :subtitle="`${customerName} · Cliente #${customerId}`"
    :icon="Orbit"
    module="support"
    @close="emit('close')"
  >
    <div class="customer-graph-intro">
      <div>
        <span class="graph-eyebrow"><Network />INTELIGÊNCIA DE RELACIONAMENTO</span>
        <h3>Todas as conexões. Um único panorama.</h3>
        <p>Explore as áreas e selecione um registro para entender os vínculos do cliente.</p>
      </div>
      <button type="button" class="button-secondary" :disabled="loading" @click="reload">
        <RefreshCw class="h-3.5 w-3.5" />Atualizar mapa
      </button>
    </div>
    <LiveQueryState :loading="loading" :error="error" @retry="reload" />
    <template v-if="data && !loading && !error">
      <div v-if="data.partial" role="status" class="graph-partial">
        <AlertTriangle />Algumas áreas estão indisponíveis. Seus dados não foram tratados como zero; você pode atualizar a consulta.
      </div>
      <div class="graph-summary-strip">
        <div>
          <UserRound /><span
            >Cadastro<strong>{{
              data.customer.active === true ? "Ativo" : data.customer.active === false ? "Inativo" : "Não informado"
            }}</strong></span
          >
        </div>
        <div>
          <MapPin /><span
            >Localidade<strong>{{ data.customer.city ?? "Não informada" }}</strong></span
          >
        </div>
        <div>
          <CircleCheck /><span
            >Fontes disponíveis<strong>{{ available }} de {{ graphAreas.length }} áreas</strong></span
          >
        </div>
        <div>
          <Focus /><span
            >Pontos para revisar<strong>{{ insights.length }}</strong></span
          >
        </div>
      </div>
      <div class="graph-controls">
        <label class="graph-search"
          ><Search /><span class="sr-only">Buscar registros no mapa</span
          ><input v-model="search" placeholder="Buscar nos registros carregados…" type="search"
        /></label>
        <label><input v-model="attentionOnly" type="checkbox" />Só pontos de atenção</label>
        <label><input v-model="showRelations" type="checkbox" />Vínculos entre áreas</label>
      </div>
      <div class="graph-workspace">
        <div class="graph-visual-column">
          <CustomerRelationshipMap
            :data="data"
            :selected="selected"
            :search="search"
            :attention-only="attentionOnly"
            :show-relations="showRelations"
            @select="selected = $event"
          />
          <nav class="graph-area-shortcuts" aria-label="Explorar áreas do cliente">
            <button
              v-for="a in graphAreas"
              :key="a.key"
              type="button"
              :class="{ 'shortcut-selected': areaKey === a.key }"
              :aria-pressed="areaKey === a.key"
              @click="selected = `area:${a.key}`"
            >
              <component :is="icons[a.key]" :style="{ color: a.color }" />{{ a.label }}<span>{{ data.groups[a.key].total ?? "—" }}</span>
            </button>
          </nav>
          <p class="graph-scope-note">
            Contagens consideram todo o histórico disponível. O mapa exibe uma amostra; cada área carrega até
            {{ data.previewLimit }} registros, priorizando pendências. Arraste o fundo para mover a visão.
          </p>
        </div>
        <aside class="graph-inspector" aria-label="Detalhes da seleção" aria-live="polite">
          <template v-if="currentRecord">
            <button type="button" class="graph-back" @click="selected = `area:${currentRecord.kind}`">
              ← Voltar para {{ area?.label }}
            </button>
            <span class="graph-eyebrow">{{ area?.label }} · #{{ currentRecord.id }}</span>
            <h3>{{ currentRecord.title }}</h3>
            <span class="graph-status" :class="`tone-${currentRecord.tone}`">{{ statusLabel(currentRecord) }}</span>
            <p v-if="currentRecord.subtitle" class="graph-muted">{{ currentRecord.subtitle }}</p>
            <dl class="graph-record-facts">
              <div>
                <dt>{{ currentRecord.kind === "financial" ? "Vencimento" : "Data do registro" }}</dt>
                <dd>{{ date(currentRecord.date) }}</dd>
              </div>
              <div v-for="fact in currentRecord.facts" :key="fact.label">
                <dt>{{ fact.label }}</dt>
                <dd>{{ factValue(fact) }}</dd>
              </div>
            </dl>
            <RecordQuickLink
              v-if="recordTarget(currentRecord, customerId)"
              :target="recordTarget(currentRecord, customerId)!"
              label="Abrir detalhes completos"
              class="graph-detail-link"
            />
            <h4 class="graph-section-title"><Network />Conexões deste registro</h4>
            <button
              v-for="link in related"
              :key="`${link.label}-${link.record.key}`"
              type="button"
              class="graph-related-record"
              @click="selected = link.record.key"
            >
              <component :is="icons[link.record.kind]" /><span
                ><small>{{ link.label }}</small
                ><strong>{{ link.record.title }}</strong></span
              ><ChevronRight />
            </button>
            <p v-if="!related.length" class="graph-muted">
              Nenhum vínculo com os outros registros carregados. Outros vínculos podem existir fora desta amostra.
            </p>
          </template>
          <template v-else-if="area && group">
            <span class="graph-eyebrow">EXPLORAR ÁREA</span>
            <h3><component :is="icons[area.key]" :style="{ color: area.color }" />{{ area.label }}</h3>
            <p class="graph-muted">{{ area.description }}</p>
            <div v-if="group.state === 'restricted'" class="graph-source-message">
              <LockKeyhole /><strong>Acesso restrito</strong>
              <p>Seu perfil não permite consultar esta área.</p>
            </div>
            <div v-else-if="group.state === 'unavailable'" class="graph-source-message">
              <AlertTriangle /><strong>Fonte indisponível</strong>
              <p>Não foi possível consultar esta área no IXC. Atualize o mapa para tentar novamente.</p>
            </div>
            <template v-else>
              <div class="graph-area-total">
                <strong>{{ group.total?.toLocaleString("pt-BR") }}</strong
                ><span>{{ groupCaption(area.key, group) }}</span>
              </div>
              <div v-if="area.key === 'financial'" class="graph-money-summary">
                <div>
                  <span>Saldo em aberto</span><strong>{{ money(group.metrics.openBalance ?? 0) }}</strong>
                </div>
                <div>
                  <span>Saldo vencido</span><strong class="graph-danger-text">{{ money(group.metrics.overdueBalance ?? 0) }}</strong>
                </div>
              </div>
              <p v-if="group.detailsRestricted" class="graph-muted">
                <LockKeyhole class="inline h-3 w-3" />Seu perfil permite os indicadores financeiros. Os títulos individuais exigem acesso ao
                Financeiro.
              </p>
              <p v-else class="graph-list-caption">
                {{ visibleList.length }} de {{ group.total }} registros · amostra priorizada{{
                  search || attentionOnly ? " com filtros locais" : ""
                }}
              </p>
              <div class="graph-record-list">
                <button v-for="r in visibleList" :key="r.key" type="button" class="graph-record-row" @click="selected = r.key">
                  <i :class="`tone-dot-${r.tone}`" /><span
                    ><strong>{{ r.title }}</strong
                    ><small>#{{ r.id }} · {{ statusLabel(r) }}</small></span
                  ><ChevronRight />
                </button>
              </div>
              <p v-if="!group.total" class="graph-muted">Nenhum registro encontrado nesta área.</p>
              <p v-else-if="!visibleList.length && !group.detailsRestricted" class="graph-muted">
                Nenhum registro da amostra corresponde aos filtros locais.
              </p>
              <button
                v-if="
                  ['contracts', 'orders', 'tickets', 'logins'].includes(area.key) ||
                  (area.key === 'equipment' && auth.can('support.contract.view')) ||
                  (area.key === 'financial' && auth.can('finance.dashboard.view'))
                "
                type="button"
                class="graph-view-all"
                @click="viewAll(area.key)"
              >
                {{
                  area.key === "financial"
                    ? "Ver títulos em aberto"
                    : area.key === "equipment"
                      ? "Ver equipamentos nos contratos"
                      : "Abrir lista completa"
                }}<ArrowUpRight />
              </button>
            </template>
          </template>
          <template v-else>
            <span class="graph-eyebrow">PANORAMA DO CLIENTE</span>
            <h3>O que merece atenção</h3>
            <p class="graph-muted">Sinais observados nas áreas consultadas, para orientar a próxima conversa.</p>
            <div v-if="insights.length" class="graph-insights">
              <button v-for="insight in insights" :key="insight.key" type="button" @click="selected = `area:${insight.area}`">
                <span class="insight-icon" :class="`tone-${insight.tone}`"><component :is="icons[insight.area]" /></span>
                <div>
                  <strong>{{ insight.title }}</strong>
                  <p>{{ insight.description }}</p>
                </div>
                <ChevronRight />
              </button>
            </div>
            <div v-else class="graph-no-alerts">
              <CircleCheck /><strong>Sem sinais prioritários nas fontes consultadas</strong>
              <p>Explore as áreas para revisar o histórico e confirmar a experiência atual do cliente.</p>
            </div>
            <div class="graph-customer-context">
              <h4 class="graph-section-title"><UserRound />Contexto do cliente</h4>
              <p><CalendarDays />Cadastro: {{ date(data.customer.registeredAt) }}</p>
              <p>
                <MapPin />{{ [data.customer.city, data.customer.neighborhood].filter(Boolean).join(" · ") || "Localidade não informada" }}
              </p>
              <p>
                <Sparkles />Satisfação no IXC:
                {{ data.customer.satisfaction == null ? "não informada" : `${data.customer.satisfaction}/5` }}
              </p>
            </div>
            <button type="button" class="graph-view-all" @click="viewAll('customer')">Abrir cadastro do cliente<ArrowUpRight /></button>
          </template>
        </aside>
      </div>
      <footer class="graph-footer">
        <span><span class="map-live-status" />Consulta ao IXC · {{ formatConsulted(data.queriedAt) }} · Brasília</span
        ><span>Linhas tracejadas representam vínculos cadastrados, sem inferir causa.</span>
      </footer>
    </template>
  </RecordDetailDialog>
</template>
<style scoped>
.customer-graph-intro {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}
.graph-eyebrow {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.13em;
  color: var(--appearance-primary-text);
  text-transform: uppercase;
}
.graph-eyebrow svg {
  width: 13px;
  height: 13px;
}
.customer-graph-intro h3 {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.025em;
  margin-top: 5px;
}
.customer-graph-intro p {
  font-size: 11px;
  color: var(--appearance-secondary);
  margin-top: 5px;
}
.graph-partial {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f59e0b15;
  font-size: 11px;
  margin-bottom: 12px;
}
.graph-partial svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.graph-summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 10px;
}
.graph-summary-strip > div {
  display: flex;
  gap: 10px;
  align-items: center;
  background: var(--appearance-surface);
  border: 1px solid var(--appearance-border);
  border-radius: 12px;
  padding: 8px 12px;
}
.graph-summary-strip svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--appearance-primary-text);
}
.graph-summary-strip span {
  font-size: 10px;
  color: var(--appearance-secondary);
}
.graph-summary-strip strong {
  display: block;
  font-size: 12px;
  color: var(--appearance-text);
  margin-top: 3px;
}
.graph-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  margin-bottom: 10px;
  font-size: 11px;
  color: var(--appearance-secondary);
}
.graph-controls > label {
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
}
.graph-controls input[type="checkbox"] {
  accent-color: var(--appearance-primary);
  width: 13px;
  height: 13px;
}
.graph-search {
  display: flex;
  gap: 7px;
  align-items: center;
  background: var(--appearance-surface);
  border: 1px solid var(--appearance-border);
  border-radius: 9px;
  padding: 9px 11px;
  flex: 1;
  min-width: 230px;
}
.graph-search svg {
  width: 14px;
  height: 14px;
}
.graph-search input {
  background: transparent;
  color: var(--appearance-text);
  width: 100%;
  outline: none;
}
.graph-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 14px;
  align-items: start;
}
.graph-visual-column {
  min-width: 0;
}
.graph-inspector {
  border: 1px solid var(--appearance-border);
  border-radius: 16px;
  padding: 18px;
  background: var(--appearance-surface);
  min-height: 460px;
  max-height: 680px;
  overflow-y: auto;
}
.graph-inspector h3 {
  font-size: 18px;
  font-weight: 800;
  line-height: 1.4;
  margin: 8px 0;
  display: flex;
  align-items: center;
  gap: 7px;
  overflow-wrap: anywhere;
}
.graph-inspector h3 svg {
  width: 19px;
  height: 19px;
  flex-shrink: 0;
}
.graph-muted {
  font-size: 11px;
  line-height: 1.7;
  color: var(--appearance-secondary);
}
.graph-insights {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 18px;
}
.graph-insights > button {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  border: 1px solid var(--appearance-border);
  border-radius: 11px;
  padding: 11px;
  text-align: left;
}
.graph-insights > button:hover {
  background: var(--appearance-muted);
}
.insight-icon {
  padding: 6px;
  border-radius: 8px;
  flex-shrink: 0;
}
.insight-icon svg {
  width: 14px;
  height: 14px;
}
.graph-insights strong {
  font-size: 11px;
  line-height: 1.5;
  display: block;
}
.graph-insights p {
  font-size: 10px;
  line-height: 1.6;
  margin-top: 4px;
  color: var(--appearance-secondary);
}
.graph-insights > button > svg {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  margin-top: 5px;
  color: var(--appearance-secondary);
}
.graph-area-shortcuts {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.graph-area-shortcuts button {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 7px 9px;
  border: 1px solid var(--appearance-border);
  border-radius: 8px;
  font-size: 10px;
  background: var(--appearance-surface);
}
.graph-area-shortcuts svg {
  width: 12px;
  height: 12px;
}
.graph-area-shortcuts span {
  font-weight: 700;
  margin-left: 3px;
}
.graph-area-shortcuts .shortcut-selected {
  border-color: var(--appearance-primary-text);
  background: var(--appearance-muted);
}
.graph-scope-note {
  font-size: 10px;
  line-height: 1.6;
  color: var(--appearance-secondary);
  margin-top: 9px;
}
.graph-status {
  display: inline-flex;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  margin-bottom: 10px;
}
.tone-danger {
  background: #ef444414;
  color: #dc2626;
}
.tone-warning {
  background: #f59e0b18;
  color: #b45309;
}
.tone-success {
  background: #10b98114;
  color: #059669;
}
.tone-neutral {
  background: var(--appearance-muted);
  color: var(--appearance-secondary);
}
.graph-danger-text {
  color: #dc2626;
}
.graph-back {
  font-size: 10px;
  color: var(--appearance-primary-text);
  margin-bottom: 18px;
}
.graph-record-facts {
  margin: 15px 0;
}
.graph-record-facts div {
  border-bottom: 1px solid var(--appearance-border);
  padding: 9px 0;
}
.graph-record-facts dt {
  font-size: 9px;
  color: var(--appearance-secondary);
}
.graph-record-facts dd {
  font-size: 12px;
  font-weight: 600;
  margin-top: 3px;
  overflow-wrap: anywhere;
}
.graph-detail-link {
  font-size: 11px;
}
.graph-section-title {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  margin: 20px 0 10px;
}
.graph-section-title svg {
  width: 14px;
  height: 14px;
}
.graph-related-record {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 0;
  text-align: left;
  border-bottom: 1px solid var(--appearance-border);
}
.graph-related-record > svg {
  width: 15px;
  height: 15px;
  color: var(--appearance-primary-text);
  flex-shrink: 0;
}
.graph-related-record > svg:last-child {
  margin-left: auto;
  width: 12px;
}
.graph-related-record span {
  min-width: 0;
}
.graph-related-record small {
  display: block;
  font-size: 9px;
  color: var(--appearance-secondary);
}
.graph-related-record strong {
  display: block;
  font-size: 11px;
  margin-top: 3px;
  overflow-wrap: anywhere;
}
.graph-source-message {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  text-align: center;
  margin: 40px 0;
  color: var(--appearance-secondary);
}
.graph-source-message svg {
  width: 25px;
  height: 25px;
}
.graph-source-message strong {
  font-size: 12px;
}
.graph-source-message p {
  font-size: 11px;
  line-height: 1.7;
}
.graph-area-total {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 18px 0;
}
.graph-area-total > strong {
  font-size: 32px;
  letter-spacing: -0.04em;
}
.graph-area-total span {
  font-size: 10px;
  color: var(--appearance-secondary);
}
.graph-money-summary {
  border: 1px solid var(--appearance-border);
  border-radius: 10px;
  padding: 11px;
  margin-bottom: 15px;
}
.graph-money-summary div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 6px 0;
}
.graph-money-summary span {
  font-size: 10px;
  color: var(--appearance-secondary);
}
.graph-money-summary strong {
  font-size: 15px;
}
.graph-list-caption {
  font-size: 9px;
  color: var(--appearance-secondary);
  margin: 15px 0 6px;
}
.graph-record-row {
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  width: 100%;
  padding: 10px 5px;
  border-bottom: 1px solid var(--appearance-border);
}
.graph-record-row:hover {
  background: var(--appearance-muted);
}
.graph-record-row span {
  flex: 1;
  min-width: 0;
}
.graph-record-row strong {
  display: block;
  font-size: 11px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.graph-record-row small {
  display: block;
  font-size: 9px;
  color: var(--appearance-secondary);
  margin-top: 4px;
}
.graph-record-row > svg {
  width: 12px;
  height: 12px;
  color: var(--appearance-secondary);
}
.graph-record-row i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tone-dot-danger {
  background: #ef4444;
}
.tone-dot-warning {
  background: #f59e0b;
}
.tone-dot-success {
  background: #10b981;
}
.tone-dot-neutral {
  background: #94a3b8;
}
.graph-view-all {
  display: flex;
  gap: 7px;
  align-items: center;
  font-size: 11px;
  color: var(--appearance-primary-text);
  font-weight: 600;
  margin-top: 18px;
  text-align: left;
}
.graph-view-all svg {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}
.graph-customer-context {
  margin-top: 25px;
  border-top: 1px solid var(--appearance-border);
}
.graph-customer-context p {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  line-height: 1.8;
  color: var(--appearance-secondary);
  margin: 6px 0;
}
.graph-customer-context p svg {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}
.graph-no-alerts {
  padding: 20px 12px;
  text-align: center;
  margin-top: 15px;
  background: var(--appearance-muted);
  border-radius: 10px;
}
.graph-no-alerts svg {
  width: 24px;
  height: 24px;
  margin: 0 auto 10px;
  color: #10b981;
}
.graph-no-alerts strong {
  font-size: 12px;
  display: block;
}
.graph-no-alerts p {
  font-size: 11px;
  line-height: 1.7;
  color: var(--appearance-secondary);
  margin-top: 8px;
}
.graph-footer {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 9px;
  color: var(--appearance-secondary);
  border-top: 1px solid var(--appearance-border);
  margin-top: 16px;
  padding-top: 12px;
}
.graph-footer > span:first-child {
  display: flex;
  align-items: center;
  gap: 5px;
}
.map-live-status {
  width: 5px;
  height: 5px;
  background: #10b981;
  border-radius: 50%;
}
@media (max-width: 1050px) {
  .graph-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
  .graph-inspector {
    min-height: 0;
    max-height: none;
  }
  .graph-insights {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  .graph-summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .customer-graph-intro {
    align-items: flex-start;
    flex-direction: column;
  }
  .customer-graph-intro h3 {
    font-size: 18px;
  }
  .graph-insights {
    grid-template-columns: 1fr;
  }
  .graph-controls {
    gap: 10px;
  }
  .graph-summary-strip > div {
    padding: 10px;
  }
}
</style>
