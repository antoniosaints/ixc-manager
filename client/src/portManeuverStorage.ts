import type { ManeuverPlan, ManeuverResult } from "./portManeuverApi";
export interface ManeuverBackup {
  version: 1;
  userId: number;
  boxId: number;
  token: string;
  createdAt: string;
  state: ManeuverResult["state"];
  logins: { id: number; login: string; fromPort: number; toPort: number; fromBoxId?: number; toBoxId?: number }[];
}
const key = (userId: number, boxId: number) => `retencao-cas.port-maneuver.${userId}.${boxId}`;
export function saveManeuverBackup(userId: number, plan: ManeuverPlan, state: ManeuverResult["state"], storage: Storage = localStorage) {
  const backup: ManeuverBackup = {
    version: 1,
    userId,
    boxId: plan.review.boxId,
    token: plan.token,
    createdAt: new Date().toISOString(),
    state,
    logins: plan.review.logins.map((r) => ({
      id: r.id,
      login: r.login,
      fromPort: r.fromPort,
      toPort: r.toPort,
      ...(r.fromBoxId ? { fromBoxId: r.fromBoxId, toBoxId: r.toBoxId } : {}),
    })),
  };
  storage.setItem(key(userId, backup.boxId), JSON.stringify(backup));
  return backup;
}
export function readManeuverBackup(userId: number, boxId: number, storage: Storage = localStorage): ManeuverBackup | null {
  const raw = storage.getItem(key(userId, boxId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (
      value.version !== 1 ||
      value.userId !== userId ||
      value.boxId !== boxId ||
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value.token) ||
      !Array.isArray(value.logins) ||
      value.logins.length < 1 ||
      value.logins.length > 2 ||
      !value.logins.every(
        (r: ManeuverBackup["logins"][number]) =>
          Number.isSafeInteger(r.id) &&
          r.id > 0 &&
          typeof r.login === "string" &&
          Number.isInteger(r.fromPort) &&
          Number.isInteger(r.toPort) &&
          (r.fromBoxId === undefined ||
            (Number.isSafeInteger(r.fromBoxId) && r.fromBoxId > 0 && Number.isSafeInteger(r.toBoxId) && r.toBoxId! > 0))
      )
    )
      throw new Error();
    return value;
  } catch {
    throw new Error("O lembrete desta CTO está inválido. Confira as portas no IXC antes de iniciar outra manobra.");
  }
}
export function clearManeuverBackup(userId: number, boxId: number, storage: Storage = localStorage) {
  storage.removeItem(key(userId, boxId));
}
