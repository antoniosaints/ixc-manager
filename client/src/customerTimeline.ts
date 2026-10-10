import type { RecordTarget } from "./recordNavigation";
export interface CustomerTimelineEvent {
  at: string;
  type: string;
  description: string;
  recordId: number | null;
  status: string | null;
}
/** Use the record identity provided by the API; descriptions are display text only. */
export function timelineTarget(
  event: CustomerTimelineEvent,
  customerId: number,
  can: (permission: string) => boolean
): RecordTarget | null {
  const id = event.recordId;
  if (!id || !Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(customerId) || customerId < 1) return null;
  switch (event.type) {
    case "FINANCIAL":
      return { kind: "receivable", id, customerId };
    case "SERVICE_ORDER":
      return { kind: "orders", id, customerId };
    case "TICKET":
      return { kind: "tickets", id, customerId };
    case "CONTRACT":
      return { kind: "contract", id, module: can("support.contract.view") ? "support" : "upgrades" };
    default:
      return null;
  }
}
