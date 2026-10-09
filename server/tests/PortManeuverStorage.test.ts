import { expect, it } from "vitest";
import { clearManeuverBackup, readManeuverBackup, saveManeuverBackup } from "../../client/src/portManeuverStorage";
import type { ManeuverPlan } from "../../client/src/portManeuverApi";
function storage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  } as unknown as Storage & { data: Map<string, string> };
}
const plan: ManeuverPlan = {
  token: "00000000-0000-4000-8000-000000000001",
  expiresInSeconds: 300,
  review: {
    mode: "swap",
    boxId: 20,
    boxName: "CTO",
    logins: [
      { id: 60, login: "demo", customerId: 40, contractId: 50, fromPort: 1, toPort: 2, onuId: 90 },
      { id: 61, login: "demo2", customerId: 41, contractId: 51, fromPort: 2, toPort: 1, onuId: 91 },
    ],
  },
};
it("salva referência e portas sem credenciais, isoladas por usuário e CTO", () => {
  const local = storage();
  const withSecrets = {
    ...plan,
    senha: "SECRET",
    review: { ...plan.review, mac: "SECRET", logins: plan.review.logins.map((r) => ({ ...r, senha: "SECRET" })) },
  };
  saveManeuverBackup(2, withSecrets, "processing", local);
  const saved = readManeuverBackup(2, 20, local);
  expect(saved?.token).toBe(plan.token);
  expect(saved?.logins.map((r) => [r.fromPort, r.toPort])).toEqual([
    [1, 2],
    [2, 1],
  ]);
  expect([...local.data.values()].join("")).not.toContain("SECRET");
  expect(saved).not.toHaveProperty("review");
  expect(saved?.logins[0]).not.toHaveProperty("customerId");
  expect(readManeuverBackup(3, 20, local)).toBeNull();
  expect(readManeuverBackup(2, 21, local)).toBeNull();
  clearManeuverBackup(2, 20, local);
  expect(readManeuverBackup(2, 20, local)).toBeNull();
});
it("recusa lembrete corrompido e propaga falha de armazenamento antes da gravação", () => {
  const local = storage();
  local.setItem("retencao-cas.port-maneuver.2.20", "{");
  expect(() => readManeuverBackup(2, 20, local)).toThrow("inválido");
  const denied = {
    ...local,
    setItem: () => {
      throw new Error("Quota");
    },
  };
  expect(() => saveManeuverBackup(2, plan, "processing", denied)).toThrow("Quota");
});

it("mantém IDs das caixas de origem e destino no lembrete da transferência", () => {
  const local = storage();
  const transfer = {
    ...plan,
    review: { ...plan.review, boxTransfer: true, logins: [{ ...plan.review.logins[0]!, fromBoxId: 20, toBoxId: 21 }] },
  };
  saveManeuverBackup(2, transfer, "processing", local);
  expect(readManeuverBackup(2, 20, local)?.logins[0]).toMatchObject({ fromBoxId: 20, toBoxId: 21 });
});
