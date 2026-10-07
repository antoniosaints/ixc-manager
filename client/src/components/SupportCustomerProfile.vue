<script setup lang="ts">
import { computed } from "vue";
import { UserRound, MapPin, Phone, CalendarClock, MapPinned, UsersRound, CircleAlert, NotebookPen } from "lucide-vue-next";
import type { SupportCustomerDetails } from "../supportApi";
import { formatDate, formatIxcDateTime, internetStatus } from "../upgradesApi";
import ContractFields from "./ContractFields.vue";
import ContactNumbers from "./ContactNumbers.vue";
const props = defineProps<{ customer: SupportCustomerDetails }>();
const yesNo = (value: boolean | null) => (value === null ? null : value ? "Sim" : "Não");
const identified = (name: string | null, id: number | null) => (name ? `${name}${id ? ` · #${id}` : ""}` : id ? `#${id}` : null);
const personType = computed(() =>
  props.customer.personType === "F"
    ? "Pessoa física"
    : props.customer.personType === "J"
      ? "Pessoa jurídica"
      : props.customer.personType
        ? `Tipo ${props.customer.personType}`
        : null
);
const billingAddressPresent = computed(() => Object.values(props.customer.billingAddress).some(Boolean));
</script>
<template>
  <div class="grid gap-3 lg:grid-cols-2">
    <ContractFields
      title="Identificação e cadastro"
      :icon="UserRound"
      :fields="[
        { label: 'Cadastro', value: customer.active === null ? 'Sem status' : customer.active ? 'Ativo' : 'Inativo' },
        { label: 'CPF / CNPJ', value: customer.document },
        { label: 'Nome fantasia', value: customer.tradeName },
        { label: 'Tipo de pessoa', value: personType },
        ...(customer.socialName ? [{ label: 'Nome social', value: customer.socialName }] : []),
        { label: 'Tipo de cliente', value: identified(customer.category, customer.categoryId) },
        { label: 'Filial do cadastro', value: identified(customer.branch, customer.branchId) },
        { label: 'Vendedor', value: identified(customer.salesperson, customer.salespersonId) },
        { label: 'Cadastro em', value: formatDate(customer.registeredAt) },
        { label: 'Última atualização', value: formatIxcDateTime(customer.updatedAt) },
        { label: 'Acesso no cadastro', value: customer.internetStatus ? internetStatus(customer.internetStatus) : null },
      ]"
    />
    <section class="support-case-card min-w-0">
      <h3 class="support-case-heading"><Phone class="h-4 w-4" aria-hidden="true" />Contatos do cadastro</h3>
      <p class="mb-2 break-words text-xs text-slate-500">
        {{ [customer.contactName, customer.email].filter(Boolean).join(" · ") || "Sem contato ou e-mail cadastrado." }}
      </p>
      <ContactNumbers :numbers="customer.contacts" />
    </section>
    <ContractFields
      title="Endereço e localização"
      :icon="MapPin"
      :fields="[
        { label: 'Cidade / UF', value: [customer.city, customer.state].filter(Boolean).join(' / ') || null },
        { label: 'Bairro', value: customer.neighborhood },
        { label: 'Endereço', value: customer.address },
        { label: 'CEP', value: customer.zip },
        { label: 'Referência', value: customer.reference },
        {
          label: 'Localidade',
          value: customer.localityType === 'R' ? 'Rural' : customer.localityType === 'U' ? 'Urbana' : customer.localityType,
        },
        ...(customer.block ? [{ label: 'Bloco', value: customer.block }] : []),
        ...(customer.apartment ? [{ label: 'Apartamento', value: customer.apartment }] : []),
      ]"
    />
    <section class="support-case-card min-w-0">
      <h3 class="support-case-heading"><CalendarClock class="h-4 w-4" aria-hidden="true" />Parâmetros de cobrança</h3>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div
          v-for="field in [
            { label: 'Vencimento no cadastro', value: customer.billing.dueDay ? `Dia ${customer.billing.dueDay}` : null },
            { label: 'Bloqueio automático', value: yesNo(customer.billing.automaticBlock) },
            { label: 'Aviso de atraso', value: yesNo(customer.billing.overdueNotice) },
            { label: 'Não bloquear até', value: customer.billing.doNotBlockUntil ? formatDate(customer.billing.doNotBlockUntil) : null },
            { label: 'Não avisar até', value: customer.billing.doNotNotifyUntil ? formatDate(customer.billing.doNotNotifyUntil) : null },
            { label: 'Envio por e-mail', value: yesNo(customer.billing.email) },
            { label: 'Envio por SMS', value: yesNo(customer.billing.sms) },
          ]"
          :key="field.label"
        >
          <dt class="support-case-caption">{{ field.label }}</dt>
          <dd class="mt-0.5 font-medium">{{ field.value ?? "Não informado" }}</dd>
        </div>
      </dl>
      <p class="mt-2 text-[10px] text-slate-500">Regras do cadastro. Cada contrato pode ter vencimento e bloqueio próprios.</p>
    </section>
    <ContractFields
      v-if="billingAddressPresent"
      title="Endereço de cobrança"
      :icon="MapPinned"
      :fields="[
        { label: 'Cidade / UF', value: [customer.billingAddress.city, customer.billingAddress.state].filter(Boolean).join(' / ') || null },
        { label: 'Bairro', value: customer.billingAddress.neighborhood },
        { label: 'Endereço', value: customer.billingAddress.address },
        { label: 'CEP', value: customer.billingAddress.zip },
        { label: 'Referência', value: customer.billingAddress.reference },
      ]"
    />
    <section v-if="customer.relatedContacts.length || customer.contactsTruncated" class="support-case-card min-w-0">
      <h3 class="support-case-heading">
        <UsersRound class="h-4 w-4" aria-hidden="true" />Contatos adicionais
        <span class="text-[10px] font-normal text-slate-500">{{ customer.relatedContacts.length }} cadastrados</span>
      </h3>
      <details v-for="contact in customer.relatedContacts" :key="contact.id ?? contact.name" class="border-t border-slate-100 py-1.5">
        <summary class="cursor-pointer text-xs font-semibold">
          {{ contact.name
          }}<span class="ml-2 text-[10px] font-normal text-slate-500"
            >{{ contact.primary ? "Principal" : "" }}{{ contact.active === false ? " · Inativo" : "" }}</span
          >
        </summary>
        <p v-if="contact.email" class="my-1 break-words text-xs text-slate-500">{{ contact.email }}</p>
        <ContactNumbers :numbers="contact.numbers" />
      </details>
      <p v-if="customer.contactsTruncated" class="mt-2 text-[10px] text-slate-500">
        Exibindo os primeiros 20 contatos. Consulte os demais no IXC.
      </p>
    </section>
  </div>
  <details v-for="note in customer.notes" :key="note.label" class="panel mt-3 px-3 py-2" :open="note.label === 'Alerta'">
    <summary class="flex cursor-pointer items-center gap-1.5 text-xs font-semibold">
      <component :is="note.label === 'Alerta' ? CircleAlert : NotebookPen" class="h-3.5 w-3.5" aria-hidden="true" />{{ note.label }}
    </summary>
    <p class="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-500">{{ note.content }}</p>
    <p v-if="note.truncated" class="mt-1 text-[10px] text-slate-500">Texto limitado a 4.000 caracteres. Consulte a íntegra no IXC.</p>
  </details>
</template>
