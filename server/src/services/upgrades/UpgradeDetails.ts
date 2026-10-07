import { isIP } from "node:net";
import { connectionIp, connectionStatus } from "../network/LoginConnection.js";
type Row = Record<string, unknown>;
const text = (value: unknown) => (value == null ? "" : String(value).trim());
const optional = (value: unknown) => text(value) || null;
const positive = (value: unknown) =>
  /^\d+$/.test(text(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const flag = (value: unknown) => (text(value) === "S" ? true : text(value) === "N" ? false : null);
export const secretFields = {
  authentication: { field: "senha", label: "Senha PPPoE / Hotspot" },
  router1: { field: "senha_router1", label: "Senha roteador 1" },
  router2: { field: "senha_router2", label: "Senha roteador 2" },
  wifi24: { field: "senha_rede_sem_fio", label: "Senha Wi-Fi 2.4 GHz" },
  wifi5: { field: "senha_rede_sem_fio_5ghz", label: "Senha Wi-Fi 5 GHz" },
  wpa: { field: "senha_wpa2aes", label: "Senha WPA2-AES" },
} as const;
export type SecretField = keyof typeof secretFields;
const phoneFields: Array<[string, string, string?]> = [
  ["fone", "Telefone"],
  ["telefone", "Telefone"],
  ["telefone_celular", "Celular"],
  ["telefone_comercial", "Comercial"],
  ["whatsapp", "WhatsApp"],
  ["fone_conjuge", "Cônjuge", "nome_conjuge"],
  ["telefone_contador", "Contador", "nome_contador"],
  ["ref_com_fone1", "Referência comercial 1", "ref_com_empresa1"],
  ["ref_com_fone2", "Referência comercial 2", "ref_com_empresa2"],
  ["ref_pes_fone1", "Referência pessoal 1", "ref_pes_nome1"],
  ["ref_pes_fone2", "Referência pessoal 2", "ref_pes_nome2"],
  ["emp_fone", "Trabalho", "emp_empresa"],
  ["fone_contato", "Contato"],
  ["telefone_contato", "Contato"],
];
export function contactNumbers(contract: Row, customer: Row) {
  const numbers = new Map<
    string,
    { number: string; labels: string[]; sources: string[]; extension: string | null; telUrl: string; whatsappUrl: string | null }
  >();
  for (const [source, row] of [
    ["Contrato", contract],
    ["Cadastro do cliente", customer],
  ] as const) {
    for (const [field, label, nameField] of phoneFields) {
      for (const raw of text(row[field])
        .split(/[;,|\n/]+/)
        .map((part) => part.trim())
        .filter(Boolean)) {
        const digits = raw.replace(/\D/g, "");
        if (!/^[+\d\s().-]+$/.test(raw) || digits.length < 8 || digits.length > 15 || !/[1-9]/.test(digits)) continue;
        const international = raw.startsWith("+");
        const brazilian = digits.startsWith("55") && (digits.length === 12 || digits.length === 13);
        const domestic = brazilian ? digits.slice(2) : digits;
        const national = !international || brazilian;
        const key = national && (domestic.length === 10 || domestic.length === 11) ? `55${domestic}` : digits;
        const name = nameField ? text(row[nameField]) : "";
        const title = name ? `${label} · ${name}` : label;
        const extension = ["fone", "telefone_comercial"].includes(field) ? optional(row.ramal) : null;
        const existing = numbers.get(key);
        if (existing) {
          if (!existing.labels.includes(title)) existing.labels.push(title);
          if (!existing.sources.includes(source)) existing.sources.push(source);
          existing.extension ??= extension;
        } else
          numbers.set(key, {
            number: raw,
            labels: [title],
            sources: [source],
            extension,
            telUrl: `tel:${raw.startsWith("+") ? "+" : ""}${digits}`,
            whatsappUrl: (national && (domestic.length === 10 || domestic.length === 11)) || international ? `https://wa.me/${key}` : null,
          });
      }
    }
  }
  return [...numbers.values()];
}
export function equipmentTarget(label: string, rawIp: unknown, rawPort: unknown, rawProtocol: unknown) {
  const ip = text(rawIp),
    protocol = text(rawProtocol).toLowerCase();
  const port = positive(rawPort);
  const validIp =
    Boolean(isIP(ip)) &&
    !ip.includes("%") &&
    !["0.0.0.0", "255.255.255.255"].includes(ip) &&
    !(isIP(ip) === 6 && ip.replace(/[:0]/g, "") === "");
  const reason = !validIp
    ? "IP não informado ou inválido"
    : !port || port > 65535
      ? "Porta não informada ou inválida"
      : !["http", "https"].includes(protocol)
        ? "Protocolo web não informado"
        : null;
  return {
    label,
    ip: validIp ? ip : null,
    port: port && port <= 65535 ? port : null,
    protocol: ["http", "https"].includes(protocol) ? protocol : null,
    url: reason ? null : `${protocol}://${isIP(ip) === 6 ? `[${ip}]` : ip}:${port}/`,
    reason,
  };
}
const authenticationLabels: Record<string, string> = {
  L: "PPPoE",
  H: "Hotspot",
  M: "IP × MAC",
  V: "VLAN",
  D: "IPoE",
  I: "Integração",
  E: "Externa",
};
export function loginDetails(row: Row, allowAccess: boolean) {
  const status = connectionStatus(row.ip);
  return {
    id: positive(row.id),
    contractId: positive(row.id_contrato),
    customerId: positive(row.id_cliente),
    login: optional(row.login),
    active: flag(row.ativo),
    status,
    authentication: authenticationLabels[text(row.autenticacao)] ?? optional(row.autenticacao),
    connectionType: optional(row.tipo_conexao),
    ip: connectionIp(row.ip),
    auxiliaryIp: optional(row.ip_aux),
    mac: optional(row.mac),
    ipv6Prefix: optional(row.pd_ipv6),
    framedIpv6Prefix: optional(row.framed_pd_ipv6),
    routerUsername: optional(row.usuario_router1),
    wifi24Ssid: optional(row.ssid_router_wifi),
    wifi5Ssid: optional(row.ssid_router_wifi_5ghz),
    wpaUsername: optional(row.usuario_wpa2aes),
    accessType: optional(row.tipo_acesso),
    routerPort: positive(row.porta_http),
    router2Port: positive(row.porta_router2),
    auxiliaryPort: positive(row.porta_aux),
    lastConnectedAt: optional(row.ultima_conexao_inicial),
    lastDisconnectedAt: optional(row.ultima_conexao_final),
    connectedTime: optional(row.tempo_conectado),
    disconnectReason: optional(row.motivo_desconexao),
    disconnectCount:
      Number.isFinite(Number(row.count_desconexao)) && text(row.count_desconexao) !== "" ? Number(row.count_desconexao) : null,
    concentratorId: positive(row.id_concentrador),
    concentrator: optional(row.concentrador),
    interface: optional(row.interface),
    transmitterId: positive(row.id_transmissor),
    hardwareId: positive(row.id_hardware),
    onuMac: optional(row.onu_mac),
    equipmentType: optional(row.tipo_equipamento),
    ftthBoxId: positive(row.id_caixa_ftth),
    ftthBoxName: null as string | null,
    ftthBoxSource: positive(row.id_caixa_ftth) ? ("login" as const) : null,
    ftthBoxAmbiguous: false,
    ftthPort: optional(row.ftth_porta),
    vlan: optional(row.vlan),
    transmissionInterface: optional(row.interface_transmissao),
    lastServiceSignal: optional(row.sinal_ultimo_atendimento),
    address: [row.endereco, row.numero, row.complemento].map(text).filter(Boolean).join(", ") || null,
    neighborhood: optional(row.bairro),
    zip: optional(row.cep),
    usesCustomerAddress: flag(row.endereco_padrao_cliente),
    accessTargets: allowAccess
      ? [
          equipmentTarget("Roteador 1", row.ip, row.porta_http, row.tipo_acesso),
          equipmentTarget("Roteador 2", row.ip, row.porta_router2, row.tipo_acesso),
          equipmentTarget("Acesso auxiliar", row.ip_aux, row.porta_aux, row.tipo_acesso),
        ]
      : [],
    secretAvailability: Object.fromEntries(Object.entries(secretFields).map(([key, { field }]) => [key, text(row[field]) !== ""])),
  };
}
export function contractExtras(contract: Row, customer: Row) {
  const address = text(contract.endereco_padrao_cliente) === "S" ? customer : contract;
  const day = positive(contract.dia_fixo_vencimento);
  return {
    contactName: optional(customer.contato),
    email: optional(customer.email),
    extension: optional(customer.ramal),
    contacts: contactNumbers(contract, customer),
    billingDay: day && day <= 31 ? day : null,
    autoRenew: flag(contract.renovacao_automatica),
    paidUntil: optional(contract.pago_ate_data),
    createdAt: optional(contract.data_cadastro_sistema),
    updatedAt: optional(contract.ultima_atualizacao),
    installation: {
      zip: optional(address.cep),
      reference: optional(address.referencia),
      building: optional(address.bloco),
      apartment: optional(address.apartamento),
      usesCustomerAddress: text(contract.endereco_padrao_cliente) === "S",
    },
    notes: [
      { label: "Observações do contrato", content: optional(contract.obs_contrato) },
      { label: "Observações gerais", content: optional(contract.obs) },
    ].filter((note) => note.content),
  };
}
