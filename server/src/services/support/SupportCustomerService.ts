import { IxcReadDatabase, type IxcReadQuery, type IxcReadSession } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { mapDate } from "../../integrations/ixc/database/maps/valueMappers.js";
import { contactNumbers } from "../upgrades/UpgradeDetails.js";

type Row = Record<string, unknown>;
interface Reader {
  withSnapshot<T>(read: (session: IxcReadSession) => Promise<T>, signal?: AbortSignal): Promise<T>;
  close?(): Promise<void>;
}
const text = (value: unknown) => (value == null ? null : String(value).trim() || null);
const id = (value: unknown) => (Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null);
const flag = (value: unknown) => (value === "S" ? true : value === "N" ? false : null);
const date = (value: unknown) => mapDate(text(value));
const timestamp = (value: unknown) => (date(value) ? text(value) : null);
const address = (...parts: unknown[]) => parts.map(text).filter(Boolean).join(", ") || null;
const fail = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

export function customerProfileQuery(customerId: number): IxcReadQuery {
  return {
    name: "support-customer-profile",
    timeoutSeconds: 5,
    params: [customerId],
    sql: `SELECT c.id,c.razao,c.fantasia,c.nome_social,c.ativo,c.cnpj_cpf,c.tipo_pessoa,
 c.fone,c.telefone_celular,c.telefone_comercial,c.whatsapp,c.ramal,c.email,c.contato,
 c.fone_conjuge,c.nome_conjuge,c.telefone_contador,c.nome_contador,c.ref_com_fone1,c.ref_com_empresa1,
 c.ref_com_fone2,c.ref_com_empresa2,c.ref_pes_fone1,c.ref_pes_nome1,c.ref_pes_fone2,c.ref_pes_nome2,c.emp_fone,c.emp_empresa,
 c.endereco,c.numero,c.complemento,c.bairro,c.cep,c.referencia,c.bloco,c.apartamento,c.tipo_localidade,
 city.nome cityName,u.sigla state,c.filial_id,COALESCE(NULLIF(f.fantasia,''),f.razao) branchName,
 c.id_tipo_cliente,t.tipo_cliente categoryName,c.id_vendedor,v.nome salespersonName,
 c.data_cadastro,c.ultima_atualizacao,c.status_internet,
 c.endereco_cob,c.numero_cob,c.complemento_cob,c.bairro_cob,c.cep_cob,c.referencia_cob,
 billingCity.nome billingCityName,billingState.sigla billingState,
 c.dia_vencimento,c.bloqueio_automatico,c.aviso_atraso,c.nao_bloquear_ate,c.nao_avisar_ate,c.cob_envia_email,c.cob_envia_sms,
 LEFT(c.alerta,4000) alerta,CHAR_LENGTH(c.alerta)>4000 alertTruncated,
 LEFT(c.obs,4000) obs,CHAR_LENGTH(c.obs)>4000 notesTruncated
 FROM cliente c LEFT JOIN cidade city ON city.id=c.cidade LEFT JOIN uf u ON u.id=COALESCE(NULLIF(c.uf,0),city.uf)
 LEFT JOIN filial f ON f.id=c.filial_id LEFT JOIN tipo_cliente t ON t.id=c.id_tipo_cliente
 LEFT JOIN vendedor v ON v.id=c.id_vendedor LEFT JOIN cidade billingCity ON billingCity.id=c.cidade_cob
 LEFT JOIN uf billingState ON billingState.id=COALESCE(NULLIF(c.uf_cob,0),billingCity.uf)
 WHERE c.id=? LIMIT 1`,
  };
}
export function customerContactsQuery(customerId: number): IxcReadQuery {
  return {
    name: "support-customer-contacts",
    timeoutSeconds: 5,
    params: [customerId],
    sql: `SELECT id,id_cliente,nome,email,principal,ativo,fone_residencial,fone_comercial,fone_celular,fone_whatsapp
 FROM contato WHERE id_cliente=? ORDER BY principal DESC,id ASC LIMIT 21`,
  };
}

/** Only explicit customer fields; no credentials, financial records, persistence or result cache. */
export class SupportCustomerService {
  constructor(
    private readonly db: Reader = new IxcReadDatabase(),
    private readonly now = () => new Date()
  ) {}
  async close() {
    await this.db.close?.();
  }
  async customer(customerId: number, signal?: AbortSignal) {
    if (!id(customerId)) throw fail("Informe um ID de cliente válido.", 400);
    return this.db.withSnapshot(async (session) => {
      const rows = await session.select<Row>(customerProfileQuery(customerId));
      const row = rows[0];
      if (!row || id(row.id) !== customerId) throw fail("Cliente não encontrado no IXC.", 404);
      const related = await session.select<Row>(customerContactsQuery(customerId));
      if (related.some((contact) => id(contact.id_cliente) !== customerId))
        throw fail("Não foi possível validar os contatos do cliente.", 502);
      const dueDay = Number(row.dia_vencimento);
      return {
        customer: {
          id: customerId,
          name: text(row.razao) ?? "Nome não informado",
          active: flag(row.ativo),
          document: text(row.cnpj_cpf),
          phone: text(row.telefone_celular) ?? text(row.fone),
          email: text(row.email),
          contactName: text(row.contato),
          city: text(row.cityName),
          state: text(row.state),
          neighborhood: text(row.bairro),
          address: address(row.endereco, row.numero, row.complemento),
          zip: text(row.cep),
          reference: text(row.referencia),
          tradeName: text(row.fantasia),
          socialName: text(row.nome_social),
          personType: text(row.tipo_pessoa),
          categoryId: id(row.id_tipo_cliente),
          category: text(row.categoryName),
          branchId: id(row.filial_id),
          branch: text(row.branchName),
          salespersonId: id(row.id_vendedor),
          salesperson: text(row.salespersonName),
          registeredAt: date(row.data_cadastro),
          updatedAt: timestamp(row.ultima_atualizacao),
          internetStatus: text(row.status_internet),
          localityType: text(row.tipo_localidade),
          block: text(row.bloco),
          apartment: text(row.apartamento),
          billingAddress: {
            address: address(row.endereco_cob, row.numero_cob, row.complemento_cob),
            city: text(row.billingCityName),
            state: text(row.billingState),
            neighborhood: text(row.bairro_cob),
            zip: text(row.cep_cob),
            reference: text(row.referencia_cob),
          },
          billing: {
            dueDay: Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31 ? dueDay : null,
            automaticBlock: flag(row.bloqueio_automatico),
            overdueNotice: flag(row.aviso_atraso),
            doNotBlockUntil: date(row.nao_bloquear_ate),
            doNotNotifyUntil: date(row.nao_avisar_ate),
            email: flag(row.cob_envia_email),
            sms: flag(row.cob_envia_sms),
          },
          contacts: contactNumbers({}, row),
          relatedContacts: related.slice(0, 20).map((contact) => ({
            id: id(contact.id),
            name: text(contact.nome) ?? "Contato sem nome",
            email: text(contact.email),
            primary: flag(contact.principal),
            active: flag(contact.ativo),
            numbers: contactNumbers(
              {},
              {
                fone: contact.fone_residencial,
                telefone_comercial: contact.fone_comercial,
                telefone_celular: contact.fone_celular,
                whatsapp: contact.fone_whatsapp,
              }
            ),
          })),
          contactsTruncated: related.length > 20,
          notes: [
            { label: "Alerta", content: text(row.alerta), truncated: Number(row.alertTruncated) === 1 },
            { label: "Observações", content: text(row.obs), truncated: Number(row.notesTruncated) === 1 },
          ].filter((note) => note.content),
        },
        source: "database" as const,
        queriedAt: this.now().toISOString(),
      };
    }, signal);
  }
}
