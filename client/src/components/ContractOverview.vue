<script setup lang="ts">
import { computed } from "vue";
import { CalendarDays, FileText, MapPin, Phone, StickyNote } from "lucide-vue-next";
import { type UpgradeContractDetails, formatDate, formatIxcDateTime, internetStatus } from "../upgradesApi";
import { contractStatus } from "../supportApi";
import ContractFields from "./ContractFields.vue";
import TechnicalStatus from "./TechnicalStatus.vue";
import PermanenceBadge from "./PermanenceBadge.vue";
const props = defineProps<{ contract: UpgradeContractDetails }>();
const yesNo = (v: boolean | null) => (v === null ? "Não informado" : v ? "Sim" : "Não");
const dates = computed(() => [
  { label: "Ativação", value: formatDate(props.contract.activatedAt) },
  { label: "Primeira assinatura", value: formatDate(props.contract.signedAt) },
  { label: "Renovação cadastrada", value: formatDate(props.contract.renewedAt) },
  { label: "Pago até", value: formatIxcDateTime(props.contract.paidUntil) },
  { label: "Cadastro no IXC", value: formatIxcDateTime(props.contract.createdAt) },
  { label: "Atualização no IXC", value: formatIxcDateTime(props.contract.updatedAt) },
]);
</script>
<template>
  <div class="support-case-snapshot">
    <div>
      <span class="support-case-caption">Contrato</span
      ><TechnicalStatus
        :label="contractStatus(contract.contractStatus)"
        :tone="contract.contractStatus === 'A' ? 'success' : contract.contractStatus === 'N' ? 'danger' : 'neutral'"
      />
    </div>
    <div>
      <span class="support-case-caption">Acesso à internet</span
      ><TechnicalStatus
        :label="internetStatus(contract.internetStatus)"
        :tone="
          contract.internetStatus === 'A' ? 'success' : ['CA', 'CM', 'FA', 'D'].includes(contract.internetStatus) ? 'danger' : 'neutral'
        "
      />
    </div>
    <div>
      <span class="support-case-caption"><CalendarDays aria-hidden="true" />Fim da permanência</span
      ><strong>{{ formatDate(contract.expiresAt) }}</strong>
    </div>
    <div><span class="support-case-caption">Permanência</span><PermanenceBadge :contract="contract" /></div>
  </div>
  <div class="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
    <div class="min-w-0 space-y-3">
      <ContractFields
        title="Plano e contrato"
        :fields="[
          { label: 'Plano atual', value: contract.planName },
          { label: 'ID do plano', value: contract.planId ? `#${contract.planId}` : null },
          { label: 'Fidelidade', value: contract.fidelityMonths === null ? null : `${contract.fidelityMonths} meses` },
          { label: 'Dia de vencimento', value: contract.billingDay },
          { label: 'Renovação automática', value: yesNo(contract.autoRenew) },
          { label: 'Suspenso', value: yesNo(contract.suspended) },
          { label: 'Filial', value: contract.branchId ? `#${contract.branchId}` : null },
          { label: 'Cadastro do cliente', value: contract.customerActive === null ? null : contract.customerActive ? 'Ativo' : 'Inativo' },
        ]"
      />
      <ContractFields title="Permanência e datas" :fields="dates" />
      <section v-for="note in contract.notes" :key="note.label" class="support-case-card">
        <h3 class="support-case-heading"><StickyNote aria-hidden="true" />{{ note.label }}</h3>
        <p class="support-case-text" :tabindex="note.content.length > 600 ? 0 : undefined">{{ note.content }}</p>
      </section>
    </div>
    <aside class="min-w-0 space-y-3" aria-label="Contexto do contrato">
      <ContractFields
        title="Endereço de instalação"
        :icon="MapPin"
        :columns="1"
        :fields="[
          { label: 'Cidade / bairro', value: [contract.city, contract.neighborhood].filter(Boolean).join(' · ') || null },
          { label: 'Endereço', value: contract.address },
          { label: 'CEP', value: contract.installation.zip },
          { label: 'Referência', value: contract.installation.reference },
          {
            label: 'Bloco / apartamento',
            value: [contract.installation.building, contract.installation.apartment].filter(Boolean).join(' / ') || null,
          },
          { label: 'Usa endereço do cliente', value: yesNo(contract.installation.usesCustomerAddress) },
        ]"
      />
      <ContractFields
        title="Contato principal"
        :icon="Phone"
        :columns="1"
        :fields="[
          { label: 'Pessoa de contato', value: contract.contactName },
          { label: 'Telefone', value: contract.phone },
          { label: 'E-mail', value: contract.email },
        ]"
      />
      <section v-if="!contract.customerAvailable" class="support-case-card text-xs text-amber-700">
        <FileText class="mb-2 h-4 w-4" aria-hidden="true" />Cadastro do cliente indisponível no IXC. Os contatos podem estar incompletos.
      </section>
    </aside>
  </div>
</template>
