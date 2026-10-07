import { describe, expect, it } from "vitest";
import { canOpenRecord, type RecordTarget } from "../../client/src/recordNavigation.js";
const grants =
  (...permissions: string[]) =>
  (permission: string) =>
    permissions.includes(permission);
describe("Atalhos de registros: permissões de destino e IDs", () => {
  it("permite abrir a caixa sem autorizar a lista de logins ou o módulo de origem", () => {
    expect(canOpenRecord({ kind: "box", id: 1984 }, grants("network.boxes.view"))).toBe(true);
    expect(canOpenRecord({ kind: "box", id: 1984 }, grants("support.logins.view"))).toBe(false);
  });
  it("não confunde permissões entre Suporte e Upgrades e exige as duas permissões para login", () => {
    expect(canOpenRecord({ kind: "contract", id: 1, module: "upgrades" }, grants("support.contract.view"))).toBe(false);
    expect(canOpenRecord({ kind: "contract", id: 1, module: "upgrades" }, grants("upgrades.contract.view"))).toBe(true);
    const login: RecordTarget = { kind: "login", id: 1, contractId: 2 };
    expect(canOpenRecord(login, grants("support.logins.view"))).toBe(false);
    expect(canOpenRecord(login, grants("support.contract.view"))).toBe(false);
    expect(canOpenRecord(login, grants("support.contract.view", "support.logins.view"))).toBe(true);
  });
  it("exige o cadastro e o tipo específico do histórico, sem conceder acesso financeiro implicitamente", () => {
    const record: RecordTarget = { kind: "tickets", id: 10, customerId: 20 };
    expect(canOpenRecord(record, grants("support.tickets.view"))).toBe(false);
    expect(canOpenRecord(record, grants("support.customer.view", "support.orders.view"))).toBe(false);
    expect(canOpenRecord(record, grants("support.customer.view", "support.tickets.view"))).toBe(true);
    expect(canOpenRecord({ kind: "collection", id: 20 }, grants("finance.dashboard.view"))).toBe(false);
    expect(canOpenRecord({ kind: "collection", id: 20 }, grants("collections.customer.view"))).toBe(true);
  });
  it("descarta IDs inválidos antes de abrir qualquer consulta", () => {
    for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(canOpenRecord({ kind: "box", id }, () => true)).toBe(false);
      expect(canOpenRecord({ kind: "login", id: 1, contractId: id }, () => true)).toBe(false);
      expect(canOpenRecord({ kind: "orders", id: 1, customerId: id }, () => true)).toBe(false);
    }
  });
});
