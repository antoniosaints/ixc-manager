import { z } from "zod";
import { validImage } from "../settings/SettingsService.js";

const date = z.string().refine((v) => {
  if (!v) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const parsed = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
}, "Data inválida");
const ids = z
  .array(z.number().int().positive().safe())
  .max(50)
  .transform((v) => [...new Set(v)])
  .default([]);
export const raffleFilters = z
  .object({
    startFrom: date.default(""),
    startTo: date.default(""),
    status: z.enum(["A", "all", "I", "P", "N", "D"]).default("A"),
    planIds: ids,
    productIds: ids,
    productMatch: z.enum(["any", "all"]).default("any"),
  })
  .refine((v) => !v.startFrom || !v.startTo || v.startFrom <= v.startTo, "A data final deve ser posterior à inicial");
export const raffleConfig = z.object({
  name: z.string().trim().min(3).max(100),
  background: z
    .string()
    .regex(/^#[\da-fA-F]{6}$/)
    .default("#00afe8"),
  logo: z
    .string()
    .max(350000)
    .refine((v) => !v || validImage(v), "Use PNG, JPEG ou WebP de até 256 KB")
    .default("/cas-logo.png"),
  prizes: z.array(z.string().trim().min(1).max(120)).min(1).max(200),
  oncePerCustomer: z.boolean().default(false),
  filters: raffleFilters,
});
export type RaffleConfig = z.infer<typeof raffleConfig>;
export interface Participant {
  contractId: number;
  customerId: number;
  customerName: string;
  city: string | null;
  plan: string | null;
  activatedAt: string | null;
}
export interface RaffleResult extends Participant {
  order: number;
  prize: string;
  drawnAt: string;
  requestId: string;
  drawnBy: number;
}
export interface RaffleState {
  id: string;
  config: RaffleConfig;
  participants: Participant[];
  results: RaffleResult[];
  pending: { result: RaffleResult; endsAt: string } | null;
  publicHash: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  createdBy: number;
}
export const raffleError = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
export function remainingParticipants(s: RaffleState) {
  const contracts = new Set(s.results.map((r) => r.contractId));
  const customers = new Set(s.results.map((r) => r.customerId));
  return s.participants.filter((p) => !contracts.has(p.contractId) && (!s.config.oncePerCustomer || !customers.has(p.customerId)));
}
/** Public projection never includes the pool, filters, tokens or the winner reserved during the countdown. */
export function rafflePresentation(s: RaffleState, now = Date.now()) {
  return {
    id: s.id,
    name: s.config.name,
    background: s.config.background,
    logo: s.config.logo,
    prizes: s.config.prizes,
    total: s.participants.length,
    remaining: remainingParticipants(s).length,
    revision: s.revision,
    phase: s.pending ? ("countdown" as const) : s.results.length >= s.config.prizes.length ? ("finished" as const) : ("ready" as const),
    countdownEndsAt: s.pending?.endsAt ?? null,
    serverNow: new Date(now).toISOString(),
    results: s.results.map((r) => ({
      order: r.order,
      prize: r.prize,
      contractId: r.contractId,
      customerName: r.customerName,
      city: r.city,
      drawnAt: r.drawnAt,
    })),
  };
}
export function raffleAdmin(s: RaffleState, now = Date.now()) {
  return {
    ...rafflePresentation(s, now),
    config: s.config,
    sharing: !!s.publicHash,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    sample: s.participants.slice(0, 25),
    oncePerCustomer: s.config.oncePerCustomer,
  };
}
