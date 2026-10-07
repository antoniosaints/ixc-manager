<script setup lang="ts">
import { computed, ref } from "vue";
import { Network, KeyRound, Router, Copy, ArrowUpRight, Cable } from "lucide-vue-next";
import { useAuthStore } from "../stores/auth";
import { toast } from "../notifications/toast";
import { type UpgradeLogin, type LoginSecretField, formatIxcDateTime } from "../upgradesApi";
import { loginStatus } from "../supportApi";
import ContractFields from "./ContractFields.vue";
import LoginSecret from "./LoginSecret.vue";
import LoginAccessMenu from "./LoginAccessMenu.vue";
import TechnicalStatus from "./TechnicalStatus.vue";
const props = withDefaults(
  defineProps<{ login: UpgradeLogin; module: "support" | "upgrades"; contractId: string; initialTab?: "overview" | "equipment" }>(),
  { initialTab: "overview" }
);
const auth = useAuthStore();
const tab = ref<"overview" | "credentials" | "equipment">(props.initialTab);
const can = (permission: string) =>
  !!props.login.contractId && auth.can(`${props.module}.contract.view`) && auth.can(`${props.module}.${permission}`);
const tabs = [
  { id: "overview", label: "Visão geral", icon: Network },
  { id: "credentials", label: "Credenciais e Wi-Fi", icon: KeyRound },
  { id: "equipment", label: "Equipamento e fibra", icon: Router },
] as const;
const idLabel = (v: number | null) => (v ? `#${v}` : null);
const yesNo = (v: boolean | null) => (v === null ? "Não informado" : v ? "Sim" : "Não");
const secrets: { field: LoginSecretField; label: string }[] = [
  { field: "authentication", label: "Senha PPPoE / Hotspot" },
  { field: "router1", label: "Senha roteador 1" },
  { field: "router2", label: "Senha roteador 2" },
  { field: "wifi24", label: "Senha Wi-Fi 2.4 GHz" },
  { field: "wifi5", label: "Senha Wi-Fi 5 GHz" },
  { field: "wpa", label: "Senha WPA2-AES" },
];
const connectionFields = computed(() => [
  { label: "Última conexão", value: formatIxcDateTime(props.login.lastConnectedAt) },
  { label: "Última desconexão", value: formatIxcDateTime(props.login.lastDisconnectedAt) },
  { label: "Tempo conectado", value: props.login.connectedTime },
  { label: "Motivo da desconexão", value: props.login.disconnectReason },
  { label: "Desconexões", value: props.login.disconnectCount },
]);
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
  <div>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex min-w-0 items-center gap-2 text-xs font-semibold">
        <Network class="h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" /><span class="break-all">{{
          login.login ?? "Login não informado"
        }}</span
        ><span class="shrink-0 text-[10px] font-normal text-slate-500">#{{ login.id }}</span>
      </h3>
      <div class="flex flex-wrap gap-2">
        <button v-if="login.ip" type="button" class="button-secondary" @click="copy(login.ip)"><Copy aria-hidden="true" />Copiar IP</button>
        <button v-if="login.login" type="button" class="button-secondary" @click="copy(login.login)">
          <Copy aria-hidden="true" />Copiar login
        </button>
      </div>
    </div>
    <div class="support-case-snapshot">
      <div>
        <span class="support-case-caption">Conexão no IXC</span
        ><TechnicalStatus
          :label="loginStatus(login.status)"
          :tone="login.status === 'online' ? 'success' : login.status === 'offline' ? 'danger' : 'neutral'"
          connection
        />
      </div>
      <div>
        <span class="support-case-caption">Cadastro do login</span
        ><TechnicalStatus
          :label="login.active === null ? 'Sem status' : login.active ? 'Ativo' : 'Inativo'"
          :tone="login.active ? 'success' : 'neutral'"
        />
      </div>
      <div>
        <span class="support-case-caption">IPv4</span><strong class="break-all font-mono">{{ login.ip ?? "Não informado" }}</strong>
      </div>
      <div>
        <span class="support-case-caption">Autenticação</span><strong>{{ login.authentication ?? "Não informada" }}</strong>
      </div>
    </div>
    <div class="support-case-tabs mb-3 w-fit" role="tablist" :aria-label="`Informações do login ${login.id}`" @keydown="keyboard">
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
    <div :id="`login-panel-${module}-${login.id}`" role="tabpanel" :aria-labelledby="`login-${module}-${login.id}-${tab}`" tabindex="0">
      <div class="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div class="min-w-0 space-y-3">
          <template v-if="tab === 'overview'">
            <ContractFields
              title="Autenticação e roteador"
              :fields="[
                { label: 'Login de internet', value: login.login },
                { label: 'Autenticação', value: login.authentication },
                { label: 'Usuário do roteador', value: login.routerUsername },
                { label: 'Tipo de conexão (IXC)', value: login.connectionType },
              ]"
            />
            <ContractFields title="Conexão reportada pelo IXC" :fields="connectionFields" />
            <ContractFields
              title="Redes Wi-Fi"
              :fields="[
                { label: 'SSID 2.4 GHz', value: login.wifi24Ssid },
                { label: 'SSID 5 GHz', value: login.wifi5Ssid },
                { label: 'Usuário WPA2-AES', value: login.wpaUsername },
              ]"
            />
          </template>
          <template v-else-if="tab === 'credentials'">
            <ContractFields
              title="Redes Wi-Fi"
              :fields="[
                { label: 'SSID 2.4 GHz', value: login.wifi24Ssid },
                { label: 'SSID 5 GHz', value: login.wifi5Ssid },
                { label: 'Usuário WPA2-AES', value: login.wpaUsername },
                { label: 'Usuário do roteador', value: login.routerUsername },
              ]"
            />
            <section class="support-case-card">
              <h4 class="support-case-heading"><KeyRound aria-hidden="true" />Senhas do login e equipamento</h4>
              <p class="mb-3 text-[11px] text-slate-500">
                Senhas consultadas ao revelar ou copiar. Trocar de aba ou login oculta as senhas reveladas.
              </p>
              <div v-if="can('credentials.view')" :key="`${module}-${contractId}-${login.id}`" class="grid gap-2 sm:grid-cols-2">
                <LoginSecret
                  v-for="secret in secrets"
                  :key="secret.field"
                  :module="module"
                  :contract-id="contractId"
                  :login-id="login.id"
                  :field="secret.field"
                  :label="secret.label"
                  :available="login.secretAvailability[secret.field]"
                />
              </div>
              <p v-else class="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                Seu perfil não permite revelar ou copiar senhas deste contrato.
              </p>
            </section>
          </template>
          <template v-else>
            <ContractFields
              title="IP e MAC"
              :fields="[
                { label: 'IPv4', value: login.ip },
                { label: 'IP auxiliar', value: login.auxiliaryIp },
                { label: 'MAC', value: login.mac },
                { label: 'Prefixo IPv6', value: login.ipv6Prefix },
                { label: 'Framed IPv6', value: login.framedIpv6Prefix },
                { label: 'Protocolo de acesso', value: login.accessType },
                { label: 'Porta roteador 1', value: login.routerPort },
                { label: 'Porta roteador 2', value: login.router2Port },
                { label: 'Porta auxiliar', value: login.auxiliaryPort },
              ]"
            />
            <ContractFields
              title="Dados técnicos e fibra"
              :icon="Cable"
              :fields="[
                { label: 'Concentrador', value: login.concentrator ?? idLabel(login.concentratorId) },
                { label: 'Interface', value: login.interface },
                { label: 'Transmissor', value: idLabel(login.transmitterId) },
                { label: 'Interface de transmissão', value: login.transmissionInterface },
                { label: 'Caixa FTTH', value: idLabel(login.ftthBoxId) },
                { label: 'Porta FTTH', value: login.ftthPort },
                { label: 'VLAN', value: login.vlan },
                { label: 'Hardware', value: idLabel(login.hardwareId) },
                { label: 'MAC da ONU', value: login.onuMac },
                { label: 'Sinal do último atendimento', value: login.lastServiceSignal },
                { label: 'Tipo de equipamento (IXC)', value: login.equipmentType },
              ]"
            />
            <ContractFields
              title="Endereço cadastrado no login"
              :fields="[
                { label: 'Endereço', value: login.address },
                { label: 'Bairro', value: login.neighborhood },
                { label: 'CEP', value: login.zip },
                { label: 'Usa endereço do cliente', value: yesNo(login.usesCustomerAddress) },
              ]"
            />
          </template>
        </div>
        <aside class="min-w-0 space-y-3" aria-label="Acesso e vínculo do login">
          <section class="support-case-card">
            <h4 class="support-case-heading"><Router aria-hidden="true" />Acesso ao equipamento</h4>
            <p class="mb-3 break-all font-mono text-xs">{{ login.accessTargets[0]?.ip ?? login.ip ?? "Sem IP informado" }}</p>
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
            <p v-if="can('equipment.access')" class="mt-2 text-[10px] text-slate-500">
              Selecione protocolo e porta. A senha do roteador 1 é copiada antes de acessar.
            </p>
          </section>
          <ContractFields
            title="Identificação da rede"
            :icon="Network"
            :columns="1"
            :fields="[
              { label: 'MAC', value: login.mac },
              { label: 'IP auxiliar', value: login.auxiliaryIp },
              { label: 'Tipo de conexão (IXC)', value: login.connectionType },
            ]"
          />
          <section class="support-case-card">
            <h4 class="support-case-heading"><Network aria-hidden="true" />Contrato vinculado</h4>
            <RouterLink
              v-if="login.contractId && auth.can(`${module}.contract.view`)"
              :to="`/${module}/contracts/${login.contractId}`"
              class="support-case-link"
              >Contrato #{{ login.contractId }}<ArrowUpRight class="ml-auto" aria-hidden="true"
            /></RouterLink>
            <p v-else class="text-xs text-slate-500">
              {{ login.contractId ? `Contrato #${login.contractId}` : "Sem contrato vinculado no IXC" }}
            </p>
            <p class="mt-1 text-[10px] text-slate-500">{{ login.customerId ? `Cliente #${login.customerId}` : "Cliente não informado" }}</p>
          </section>
          <section v-if="tab === 'equipment' && can('equipment.access') && login.accessTargets.length" class="support-case-card">
            <h4 class="support-case-heading"><Router aria-hidden="true" />Acessos cadastrados no IXC</h4>
            <div
              v-for="target in login.accessTargets"
              :key="target.label"
              class="border-b border-slate-100 py-2 first:pt-0 last:border-0 last:pb-0"
            >
              <strong class="text-[11px]">{{ target.label }}</strong>
              <p class="mt-1 break-all font-mono text-[10px] text-slate-500">
                {{ target.ip ?? "Sem IP" }} · {{ target.port ?? "Sem porta" }}
              </p>
              <a
                v-if="target.url"
                :href="target.url"
                target="_blank"
                rel="noopener noreferrer"
                referrerpolicy="no-referrer"
                class="support-case-link"
                >Abrir equipamento<ArrowUpRight class="ml-auto" aria-hidden="true"
              /></a>
              <p v-else class="mt-1 text-[10px] text-slate-500">{{ target.reason }}</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>
