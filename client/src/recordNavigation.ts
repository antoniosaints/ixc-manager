export type RecordTarget =
  | { kind: "box"; id: number; name?: string }
  | { kind: "contract"; id: number; module: "support" | "upgrades" }
  | { kind: "login"; id: number; contractId: number; customerId?: never }
  | { kind: "login"; id: number; customerId: number; contractId?: never }
  | { kind: "orders" | "tickets"; id: number; customerId: number }
  | { kind: "receivable"; id: number; customerId: number }
  | { kind: "collection"; id: number };
const validId = (id: number) => Number.isSafeInteger(id) && id > 0;
export function canOpenRecord(target: RecordTarget, can: (permission: string) => boolean): boolean {
  if (!validId(target.id)) return false;
  switch (target.kind) {
    case "box":
      return can("network.boxes.view");
    case "contract":
      return can(`${target.module}.contract.view`);
    case "login":
      return target.customerId !== undefined
        ? validId(target.customerId) && can("support.customer.view") && can("support.logins.view")
        : validId(target.contractId) && can("support.contract.view") && can("support.logins.view");
    case "orders":
    case "tickets":
      return validId(target.customerId) && can("support.customer.view") && can(`support.${target.kind}.view`);
    case "receivable":
      return validId(target.customerId) && can("finance.dashboard.view");
    case "collection":
      return can("collections.customer.view");
  }
}
