<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Network,
  KeyRound,
  Router,
  Copy,
  ArrowUpRight,
  Cable,
  Wifi,
  Clock3,
  MapPin,
  Settings2,
  Info,
  ChartNoAxesCombined,
} from "lucide-vue-next";
import { useAuthStore } from "../stores/auth";
import { toast } from "../notifications/toast";
import { type UpgradeLogin, type LoginSecretField, formatIxcDateTime } from "../upgradesApi";
import { loginStatus } from "../supportApi";
import ContractFields from "./ContractFields.vue";
import LoginSecret from "./LoginSecret.vue";
import LoginAccessMenu from "./LoginAccessMenu.vue";
import RecordQuickLink from "./RecordQuickLink.vue";
import CustomerQuickLinks from "./CustomerQuickLinks.vue";
import TechnicalStatus from "./TechnicalStatus.vue";
import LoginActions from "./LoginActions.vue";
import LoginConsumption from "./LoginConsumption.vue";
import LoginSignalCard from "./LoginSignalCard.vue";
import NetworkMonitorStatus from "./NetworkMonitorStatus.vue";
import { useNetworkMonitor, applyConnectionUpdate, type ConnectionUpdate } from "../composables/useNetworkMonitor";
const props = withDefaults(
  defineProps<{ login: UpgradeLogin; module: "support" | "upgrades"; contractId: string; initialTab?: "overview" | "equipment" }>(),
  { initialTab: "overview" }
);
const auth = useAuthStore();
const liveConnection = ref<ConnectionUpdate | null>(null);
const login = computed(() => (liveConnection.value ? applyConnectionUpdate(props.login, liveConnection.value) : props.login));
const monitor = useNetworkMonitor({
  scope: () =>
    props.module === "support" && props.login.id && props.login.customerId && auth.can("support.customer.view")
      ? { scope: "customer", module: "support", customerId: props.login.customerId, loginIds: [props.login.id] }
      : props.login.id && Number(props.contractId) > 0
        ? { scope: "login", module: props.module, contractId: Number(props.contractId), loginId: props.login.id }
        : null,
  connections: (updates) => {
    const update = updates.find((item) => item.id === props.login.id);
    if (update) liveConnection.value = update;
  },
});
const tab = ref<"overview" | "credentials" | "equipment" | "consumption">(props.initialTab);
const can = (permission: string) =>
  !!props.login.contractId && auth.can(`${props.module}.contract.view`) && auth.can(`${props.module}.${permission}`);
const toolScope = computed(() => ({
  module: props.module,
  ...(Number(props.contractId) > 0 ? { contractId: Number(props.contractId) } : {}),
}));
const tabs = [
  { id: "overview", label: "Conexão", icon: Network, help: "Estado da sessão e identificação do acesso à internet." },
  {
    id: "credentials",
    label: "Roteador e Wi-Fi",
    icon: Wifi,
    help: "Usuário do roteador, redes sem fio e senhas separadas por finalidade.",
  },
  { id: "equipment", label: "Fibra e rede", icon: Cable, help: "Equipamento cadastrado, ponto de fibra e parâmetros de rede." },
  { id: "consumption", label: "Consumo", icon: ChartNoAxesCombined, help: "Histórico diário e mensal de download e upload deste login." },
] as const;
const idLabel = (v: number | null) => (v ? `#${v}` : null);
const yesNo = (v: boolean | null) => (v === null ? "Não informado" : v ? "Sim" : "Não");
const routerSecrets: { field: LoginSecretField; label: string }[] = [
  { field: "router1", label: "Senha do roteador principal" },
  { field: "router2", label: "Senha do segundo roteador" },
];
const wifiNetworks = computed(() => [
  { field: "wifi24" as const, label: "Wi-Fi 2.4 GHz", ssid: props.login.wifi24Ssid },
  { field: "wifi5" as const, label: "Wi-Fi 5 GHz", ssid: props.login.wifi5Ssid },
]);
const connectionFields = computed(() => [
  { label: "Última conexão", value: formatIxcDateTime(props.login.lastConnectedAt) },
  { label: "Tempo conectado", value: props.login.connectedTime },
  { label: "Última desconexão", value: formatIxcDateTime(props.login.lastDisconnectedAt) },
  { label: "Desconexões registradas", value: props.login.disconnectCount },
  { label: "Motivo da última desconexão", value: props.login.disconnectReason },
]);
const advancedFields = computed(() => [
  { label: "Concentrador", value: props.login.concentrator ?? idLabel(props.login.concentratorId) },
  { label: "Interface", value: props.login.interface },
  { label: "Transmissor", value: idLabel(props.login.transmitterId) },
  { label: "Interface de transmissão", value: props.login.transmissionInterface },
  { label: "Prefixo IPv6", value: props.login.ipv6Prefix },
  { label: "Framed IPv6", value: props.login.framedIpv6Prefix },
  { label: "IP auxiliar", value: props.login.auxiliaryIp },
  { label: "Porta auxiliar", value: props.login.auxiliaryPort },
]);
const additionalTargets = computed(() =>
  props.login.accessTargets.slice(1).filter((target) => target.port || (target.ip && target.ip !== props.login.ip))
);
async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Informação copiada");
  } catch {
    toast.error("Não foi possível copiar", "Selecione o texto e copie manualmente.");
  }
}
function keyboard(e: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  const i = tabs.findIndex((item) => item.id === tab.value);
  tab.value =
    tabs[
      e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length
    ]!.id;
  (e.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`#login-${props.module}-${props.login.id}-${tab.value}`)?.focus();
}
</script>
<template>
  <div class="login-workspace">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <RecordQuickLink
        v-if="login.contractId"
        :target="{ kind: 'contract', id: login.contractId, module }"
        :label="`Ver contrato #${login.contractId}`"
      />
      <RecordQuickLink
        v-if="login.ftthBoxId"
        :target="{ kind: 'box', id: login.ftthBoxId, name: login.ftthBoxName ?? undefined }"
        :label="`Ver caixa ${login.ftthBoxName ?? '#' + login.ftthBoxId}`"
      />
      <CustomerQuickLinks v-if="login.customerId" :customer-id="login.customerId" :contract-id="login.contractId ?? undefined" />
    </div>
    <div class="login-connection-summary">
      <div class="min-w-0">
        <span class="support-case-caption">Conexão informada pelo IXC</span>
        <TechnicalStatus
          :label="loginStatus(login.status)"
          :tone="login.status === 'online' ? 'success' : login.status === 'offline' ? 'danger' : 'neutral'"
          connection
        />
      </div>
      <div>
        <span class="support-case-caption">Cadastro do login</span
        ><strong>{{ login.active === null ? "Não informado" : login.active ? "Ativo" : "Inativo" }}</strong>
      </div>
      <div>
        <span class="support-case-caption">Autenticação</span><strong>{{ login.authentication ?? "Não informada" }}</strong>
      </div>
      <div>
        <span class="support-case-caption">IP principal</span><strong class="break-all font-mono">{{ login.ip ?? "Não informado" }}</strong>
      </div>
    </div>
    <div class="mb-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
      <NetworkMonitorStatus :state="monitor.state.value" :checked-at="monitor.checkedAt.value" :message="monitor.message.value" />
      <span>O status de conexão do IXC tem prioridade sobre o IP cadastrado. A potência óptica é consultada separadamente.</span>
    </div>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div class="max-w-full overflow-x-auto">
        <div class="support-case-tabs w-fit min-w-max" role="tablist" :aria-label="`Informações do login ${login.id}`" @keydown="keyboard">
          <button
            v-for="item in tabs"
            :id="`login-${module}-${login.id}-${item.id}`"
            :key="item.id"
            role="tab"
            type="button"
            :aria-selected="tab === item.id"
            :aria-controls="`login-panel-${module}-${login.id}`"
            :tabindex="tab === item.id ? 0 : -1"
            @click="tab = item.id"
          >
            <component :is="item.icon" class="h-3.5 w-3.5" aria-hidden="true" />{{ item.label }}
          </button>
        </div>
      </div>
      <div class="ml-auto"><LoginActions :login-id="login.id" :login="login.login" :scope="toolScope" /></div>
    </div>
    <div :id="`login-panel-${module}-${login.id}`" role="tabpanel" :aria-labelledby="`login-${module}-${login.id}-${tab}`" tabindex="0">
      <p class="mb-3 text-[11px] text-slate-500">{{ tabs.find((item) => item.id === tab)?.help }}</p>
      <div class="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div class="min-w-0 space-y-3">
          <LoginSignalCard
            v-if="login.technology?.kind !== 'radio' && (tab === 'overview' || tab === 'equipment') && can('logins.view')"
            :module="module"
            :login-id="login.id"
            :contract-id="contractId"
          />
          <template v-if="tab === 'overview'">
            <ContractFields title="Sessão de internet" :icon="Clock3" :fields="connectionFields" />
            <ContractFields
              title="Identificação do acesso"
              :icon="Network"
              :fields="[
                { label: 'Login de internet', value: login.login },
                { label: 'Tipo de conexão (IXC)', value: login.connectionType },
                { label: 'MAC cadastrado', value: login.mac },
                { label: 'Concentrador', value: login.concentrator ?? idLabel(login.concentratorId) },
              ]"
            />
            <p class="flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-500">
              <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />O estado e as datas vêm do IXC. Não é realizado um teste de
              conectividade do equipamento.
            </p>
          </template>
          <template v-else-if="tab === 'credentials'">
            <section class="support-case-card">
              <h3 class="support-case-heading"><Router aria-hidden="true" />Roteador do cliente</h3>
              <dl class="mb-3 grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt class="support-case-caption">Usuário de acesso</dt>
                  <dd class="mt-0.5 font-semibold">{{ login.routerUsername ?? "Não informado" }}</dd>
                </div>
                <div>
                  <dt class="support-case-caption">Porta principal cadastrada</dt>
                  <dd class="mt-0.5">{{ login.routerPort ?? "Não informada" }}</dd>
                </div>
                <div>
                  <dt class="support-case-caption">Protocolo cadastrado</dt>
                  <dd class="mt-0.5">{{ login.accessType ?? "Não informado" }}</dd>
                </div>
                <div>
                  <dt class="support-case-caption">Porta do segundo roteador</dt>
                  <dd class="mt-0.5">{{ login.router2Port ?? "Não informada" }}</dd>
                </div>
              </dl>
              <div v-if="can('credentials.view')" class="grid gap-2 sm:grid-cols-2">
                <LoginSecret
                  v-for="secret in routerSecrets"
                  :key="secret.field"
                  :module="module"
                  :contract-id="contractId"
                  :login-id="login.id"
                  :field="secret.field"
                  :label="secret.label"
                  :available="login.secretAvailability[secret.field]"
                />
              </div>
              <p v-else class="text-[11px] text-slate-500">Seu perfil não permite consultar senhas.</p>
            </section>
            <div class="grid gap-3 sm:grid-cols-2">
              <section v-for="wifi in wifiNetworks" :key="wifi.field" class="support-case-card min-w-0">
                <h3 class="support-case-heading"><Wifi aria-hidden="true" />{{ wifi.label }}</h3>
                <p class="support-case-caption">Nome da rede (SSID)</p>
                <p class="mb-3 mt-0.5 break-all text-xs font-semibold">{{ wifi.ssid ?? "Não informado" }}</p>
                <LoginSecret
                  v-if="can('credentials.view')"
                  :module="module"
                  :contract-id="contractId"
                  :login-id="login.id"
                  :field="wifi.field"
                  :label="`Senha ${wifi.label}`"
                  :available="login.secretAvailability[wifi.field]"
                />
              </section>
            </div>
            <details class="support-case-card login-advanced">
              <summary><KeyRound class="h-4 w-4" aria-hidden="true" />Autenticação de internet e WPA2</summary>
              <div class="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p class="support-case-caption">Login de internet</p>
                  <p class="mb-2 break-all text-xs">{{ login.login ?? "Não informado" }}</p>
                  <LoginSecret
                    v-if="can('credentials.view')"
                    :module="module"
                    :contract-id="contractId"
                    :login-id="login.id"
                    field="authentication"
                    label="Senha PPPoE / Hotspot"
                    :available="login.secretAvailability.authentication"
                  />
                </div>
                <div>
                  <p class="support-case-caption">Usuário WPA2-AES</p>
                  <p class="mb-2 break-all text-xs">{{ login.wpaUsername ?? "Não informado" }}</p>
                  <LoginSecret
                    v-if="can('credentials.view')"
                    :module="module"
                    :contract-id="contractId"
                    :login-id="login.id"
                    field="wpa"
                    label="Senha WPA2-AES"
                    :available="login.secretAvailability.wpa"
                  />
                </div>
              </div>
            </details>
            <p v-if="can('credentials.view')" class="text-[10px] text-slate-500">
              Revele ou copie apenas a senha necessária. As senhas reveladas são ocultadas ao trocar de aba ou fechar o login.
            </p>
          </template>
          <template v-else-if="tab === 'consumption'">
            <LoginConsumption :login-id="login.id" :scope="toolScope" />
          </template>
          <template v-else>
            <div class="grid gap-3 xl:grid-cols-2">
              <ContractFields
                title="Equipamento do cliente"
                :icon="Router"
                :fields="[
                  { label: 'Tipo cadastrado', value: login.equipmentType },
                  { label: 'MAC da ONU', value: login.onuMac },
                  { label: 'MAC do login', value: login.mac },
                  { label: 'Hardware', value: idLabel(login.hardwareId) },
                ]"
              />
              <ContractFields
                title="Ponto de fibra"
                :icon="Cable"
                :fields="[
                  {
                    label: 'Caixa FTTH',
                    value: login.ftthBoxName ? `${login.ftthBoxName} · ${idLabel(login.ftthBoxId)}` : idLabel(login.ftthBoxId),
                  },
                  { label: 'Porta FTTH', value: login.ftthPort },
                  { label: 'VLAN', value: login.vlan },
                  { label: 'Sinal do último atendimento', value: login.lastServiceSignal },
                ]"
              >
                <template #field="{ field }">
                  <RecordQuickLink
                    v-if="field.label === 'Caixa FTTH' && login.ftthBoxId && auth.can('network.boxes.view')"
                    :target="{ kind: 'box', id: login.ftthBoxId, name: login.ftthBoxName ?? undefined }"
                    :label="`Ver caixa ${field.value}`"
                    >{{ field.value }}</RecordQuickLink
                  >
                  <template v-else>{{ field.value ?? "Não informado" }}</template>
                </template>
              </ContractFields>
              <p v-if="login.ftthBoxSource === 'onu'" class="text-[10px] text-slate-500">
                Caixa e porta consultadas no cadastro da ONU vinculada; não estão preenchidas no cadastro do login.
              </p>
              <p v-if="login.ftthBoxAmbiguous" class="text-[11px] text-amber-700">
                Há ONUs vinculadas a caixas diferentes. Confira os vínculos no IXC antes de identificar a caixa.
              </p>
            </div>
            <p class="text-[10px] text-slate-500">
              O campo “Sinal do último atendimento” é um registro do atendimento e pode diferir da leitura óptica da ONU. Comodatos são
              consultados no contrato pelo menu de Suporte.
            </p>
            <ContractFields
              v-if="login.address || login.neighborhood || login.zip"
              title="Local de instalação do login"
              :icon="MapPin"
              :fields="[
                { label: 'Endereço', value: login.address },
                { label: 'Bairro', value: login.neighborhood },
                { label: 'CEP', value: login.zip },
                { label: 'Usa endereço do cliente', value: yesNo(login.usesCustomerAddress) },
              ]"
            />
            <section v-else class="support-case-card">
              <h3 class="support-case-heading"><MapPin aria-hidden="true" />Local de instalação</h3>
              <p class="text-[11px] text-slate-500">
                {{
                  login.usesCustomerAddress === true
                    ? "Este login utiliza o endereço do cadastro do cliente."
                    : "Endereço próprio não informado neste login."
                }}
              </p>
            </section>
            <details class="support-case-card login-advanced">
              <summary><Settings2 class="h-4 w-4" aria-hidden="true" />Parâmetros avançados de rede</summary>
              <dl class="mt-3 grid gap-x-4 gap-y-3 text-xs sm:grid-cols-2">
                <div v-for="field in advancedFields" :key="field.label" class="min-w-0">
                  <dt class="support-case-caption">{{ field.label }}</dt>
                  <dd class="mt-0.5 break-all font-medium">{{ field.value ?? "Não informado" }}</dd>
                </div>
              </dl>
            </details>
          </template>
        </div>
        <aside class="min-w-0 space-y-3" aria-label="Acesso rápido ao equipamento">
          <section class="support-case-card login-access-card">
            <h3 class="support-case-heading"><Router aria-hidden="true" />Acessar roteador</h3>
            <p class="support-case-caption">IP de acesso</p>
            <p class="mb-3 mt-1 break-all font-mono text-sm font-semibold">
              {{ login.accessTargets[0]?.ip ?? login.ip ?? "Não informado" }}
            </p>
            <LoginAccessMenu
              v-if="can('equipment.access')"
              :key="`${module}-${contractId}-${login.id}`"
              :module="module"
              :contract-id="contractId"
              :login-id="login.id"
              :ip="login.accessTargets[0]?.ip ?? null"
              :password-available="login.secretAvailability.router1"
            />
            <p v-else class="text-[11px] text-slate-500">Seu perfil não permite acessar o equipamento deste contrato.</p>
            <p v-if="can('equipment.access')" class="mt-2 text-[10px] leading-relaxed text-slate-500">
              Escolha protocolo e porta. A senha do roteador principal é copiada antes de abrir.
            </p>
            <div class="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              <button v-if="login.ip" type="button" class="button-secondary !px-2 !py-1.5 !text-[11px]" @click="copy(login.ip)">
                <Copy class="h-3.5 w-3.5" aria-hidden="true" />Copiar IP
              </button>
              <button v-if="login.login" type="button" class="button-secondary !px-2 !py-1.5 !text-[11px]" @click="copy(login.login)">
                <Copy class="h-3.5 w-3.5" aria-hidden="true" />Copiar login
              </button>
            </div>
          </section>
          <section v-if="tab === 'equipment' && can('equipment.access') && additionalTargets.length" class="support-case-card">
            <h3 class="support-case-heading"><Network aria-hidden="true" />Acessos adicionais do IXC</h3>
            <div
              v-for="target in additionalTargets"
              :key="target.label"
              class="border-b border-slate-100 py-2 first:pt-0 last:border-0 last:pb-0"
            >
              <strong class="text-[11px]">{{ target.label }}</strong>
              <p class="mt-1 break-all font-mono text-[10px] text-slate-500">
                {{ target.ip ?? "Sem IP" }} · Porta {{ target.port ?? "não informada" }}
              </p>
              <a
                v-if="target.url"
                :href="target.url"
                target="_blank"
                rel="noopener noreferrer"
                referrerpolicy="no-referrer"
                class="support-case-link"
                >Abrir acesso cadastrado<ArrowUpRight class="ml-auto" aria-hidden="true"
              /></a>
              <p v-else class="mt-1 text-[10px] text-slate-500">{{ target.reason }}</p>
            </div>
          </section>
          <p class="px-1 text-[10px] text-slate-500">
            Login #{{ login.id }} · {{ login.contractId ? `Contrato #${login.contractId}` : "Sem contrato vinculado"
            }}{{ login.customerId ? ` · Cliente #${login.customerId}` : "" }}
          </p>
        </aside>
      </div>
    </div>
  </div>
</template>
