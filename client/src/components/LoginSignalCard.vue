<script setup lang="ts">
import { computed, watch } from "vue";
import { Activity, RefreshCw, Info, AlertTriangle } from "lucide-vue-next";
import { useAuthStore } from "../stores/auth";
import { useLiveQuery } from "../composables/useLiveQuery";
import { upgradesApi, formatIxcDateTime, formatConsulted, type LoginSignalDetails } from "../upgradesApi";
import { supportApi } from "../supportApi";
import { networkApi } from "../networkApi";
import LiveQueryState from "./LiveQueryState.vue";
import TechnicalStatus from "./TechnicalStatus.vue";
import { rxSignalLevel } from "../opticalSignal";
const props = defineProps<{ module: "support" | "upgrades" | "network"; loginId: number; contractId?: string; boxId?: number }>();
const auth = useAuthStore();
const allowed = computed(() =>
  props.module === "network"
    ? !!props.boxId && auth.can("network.boxes.view") && auth.can("network.logins.view")
    : !!props.contractId && auth.can(`${props.module}.contract.view`) && auth.can(`${props.module}.logins.view`)
);
const { data, loading, error, reload } = useLiveQuery<LoginSignalDetails | null>(async (signal) => {
  if (!allowed.value) return null;
  return props.module === "network"
    ? networkApi.loginSignal(props.boxId!, props.loginId, signal)
    : (props.module === "support" ? supportApi : upgradesApi).loginSignal(props.contractId!, props.loginId, signal);
});
watch(() => [props.module, props.loginId, props.contractId, props.boxId, allowed.value], reload);
const number = (value: number | null, unit: string) =>
  value === null ? "Sem leitura" : `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unit}`;
</script>
<template>
  <section v-if="allowed" class="support-case-card" aria-label="Potência óptica da ONU">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 class="support-case-heading !mb-0"><Activity aria-hidden="true" />Potência óptica da ONU</h3>
      <button type="button" class="button-secondary" :disabled="loading" @click="reload">
        <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" aria-hidden="true" />Atualizar consulta
      </button>
    </div>
    <LiveQueryState :loading="loading" :error="error" @retry="reload" />
    <template v-if="data && !loading && !error">
      <p v-if="!data.readings.length" class="text-xs text-slate-500">
        Nenhuma ONU com vínculo compatível foi encontrada para este login. O sinal do último atendimento, quando informado, continua
        disponível abaixo.
      </p>
      <p v-if="data.readings.length > 1" class="mb-3 flex items-start gap-1.5 text-[11px] text-amber-700">
        <AlertTriangle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Há mais de uma ONU cadastrada para este login. Confira o serial e a
        PON antes de usar a leitura.
      </p>
      <article
        v-for="reading in data.readings"
        :key="reading.onuId"
        class="border-t border-slate-100 py-3 first:border-0 first:pt-0 last:pb-0"
      >
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <strong
            >ONU #{{ reading.onuId }}<span v-if="reading.model" class="font-normal text-slate-500"> · {{ reading.model }}</span></strong
          >
          <TechnicalStatus
            :label="
              reading.powerStatus === 'regular'
                ? 'Potência regular (IXC)'
                : reading.powerStatus === 'irregular'
                  ? 'Potência irregular (IXC)'
                  : 'Potência sem classificação'
            "
            :tone="
              reading.rxDbm === null && reading.txDbm === null
                ? 'neutral'
                : reading.powerStatus === 'regular'
                  ? 'success'
                  : reading.powerStatus === 'irregular'
                    ? 'danger'
                    : 'neutral'
            "
          />
        </div>
        <p v-if="reading.contractMismatch" class="mb-3 flex items-start gap-1.5 text-[11px] text-amber-700">
          <AlertTriangle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />A ONU ainda aponta para o contrato #{{
            reading.linkedContractId
          }}. Vínculo confirmado pelo login, pelo cliente e pelo serial do equipamento.
        </p>
        <dl class="grid gap-x-4 gap-y-3 text-xs sm:grid-cols-3">
          <div>
            <dt class="support-case-caption">RX · recebido pela ONU</dt>
            <dd class="mt-1 font-bold" :class="[reading.rxDbm === null ? 'text-xs' : 'text-base', rxSignalLevel(reading.rxDbm).className]">
              {{ number(reading.rxDbm, "dBm") }}
              <span v-if="reading.rxDbm !== null" class="ml-1 text-[11px] font-semibold">· {{ rxSignalLevel(reading.rxDbm).label }}</span>
            </dd>
          </div>
          <div>
            <dt class="support-case-caption">TX · transmitido pela ONU</dt>
            <dd class="mt-1 font-bold" :class="reading.txDbm === null ? 'text-xs text-slate-500' : 'text-base'">
              {{ number(reading.txDbm, "dBm") }}
            </dd>
          </div>
          <div>
            <dt class="support-case-caption">Data da leitura · Brasília</dt>
            <dd class="mt-1 font-semibold">{{ reading.measuredAt ? formatIxcDateTime(reading.measuredAt) : "Sem data válida" }}</dd>
          </div>
          <div>
            <dt class="support-case-caption">MAC / serial</dt>
            <dd class="mt-1 break-all font-mono text-[11px]">{{ reading.serial ?? "Não informado" }}</dd>
          </div>
          <div>
            <dt class="support-case-caption">PON</dt>
            <dd class="mt-1">{{ reading.pon ?? "Não informada" }}</dd>
          </div>
          <div>
            <dt class="support-case-caption">Autorização cadastrada</dt>
            <dd class="mt-1">
              {{
                reading.authorization === "authorized"
                  ? "Autorizada"
                  : reading.authorization === "unauthorized"
                    ? "Não autorizada"
                    : "Não informada"
              }}
            </dd>
          </div>
        </dl>
        <p v-if="reading.temperatureC !== null || reading.voltageV !== null" class="mt-2 text-[11px] text-slate-500">
          Temperatura: {{ number(reading.temperatureC, "°C") }} · Tensão: {{ number(reading.voltageV, "V") }}
        </p>
      </article>
      <p v-if="data.truncated" class="mt-2 text-[11px] text-amber-700">Exibição limitada a 10 ONUs. Confira os demais vínculos no IXC.</p>
      <p v-if="data.readings.length" class="mt-3 text-[10px] text-slate-500">
        RX: <span class="text-emerald-700">bom &gt; −27</span> · <span class="text-amber-700">atenção &gt; −29 até −27</span> ·
        <span class="text-red-600">crítico ≤ −29 dBm</span>. TX usa outra escala.
      </p>
      <p class="mt-3 flex items-start gap-1.5 border-t border-slate-100 pt-2 text-[10px] leading-relaxed text-slate-500">
        <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Última leitura registrada no IXC; pode estar desatualizada. Atualizar
        consulta apenas relê os dados e não mede a ONU. O badge de potência vem do IXC, conforme o limite configurado na OLT.
      </p>
      <p class="mt-1 text-[10px] text-slate-400">
        {{ data.source === "ixc-database" ? "Banco IXC" : "API IXC" }} · Consultado em {{ formatConsulted(data.queriedAt) }} · Brasília
      </p>
    </template>
  </section>
</template>
