import { z } from "zod";
const id = z.number().int().positive().safe();
const ids = z
  .array(id)
  .min(1)
  .max(25)
  .transform((values) => [...new Set(values)].sort((a, b) => a - b));
export const networkSubscription = z.object({ type: z.literal("auth"), token: z.string().min(1).max(256), boxIds: ids }).strict();
const credentials = { type: z.literal("auth"), token: z.string().min(1).max(256) };
export const connectionSubscription = z.union([
  networkSubscription.transform(({ boxIds, ...rest }) => ({ ...rest, scope: "boxes" as const, boxIds })),
  z.object({ ...credentials, scope: z.literal("customer"), module: z.literal("support"), customerId: id, loginIds: ids }).strict(),
  z.object({ ...credentials, scope: z.literal("login"), module: z.enum(["support", "upgrades"]), contractId: id, loginId: id }).strict(),
  z.object({ ...credentials, scope: z.literal("box-login"), boxId: id, loginId: id }).strict(),
]);
export type ConnectionScope =
  | Omit<Extract<z.infer<typeof connectionSubscription>, { scope: "boxes" }>, "type" | "token">
  | Omit<Extract<z.infer<typeof connectionSubscription>, { scope: "customer" }>, "type" | "token">
  | Omit<Extract<z.infer<typeof connectionSubscription>, { scope: "login" }>, "type" | "token">
  | Omit<Extract<z.infer<typeof connectionSubscription>, { scope: "box-login" }>, "type" | "token">;
/** Channel keys never contain tokens. Each shape carries only its authorized record scope. */
export function subscriptionScope(input: z.infer<typeof connectionSubscription>): ConnectionScope {
  if (input.scope === "boxes") return { scope: input.scope, boxIds: input.boxIds };
  if (input.scope === "customer")
    return { scope: input.scope, module: input.module, customerId: input.customerId, loginIds: input.loginIds };
  if (input.scope === "login") return { scope: input.scope, module: input.module, contractId: input.contractId, loginId: input.loginId };
  return { scope: input.scope, boxId: input.boxId, loginId: input.loginId };
}
export function connectionPermissions(scope: ConnectionScope) {
  if (scope.scope === "customer") return ["support.customer.view", "support.logins.view"] as const;
  if (scope.scope === "login")
    return scope.module === "support"
      ? (["support.contract.view", "support.logins.view"] as const)
      : (["upgrades.contract.view", "upgrades.logins.view"] as const);
  return ["network.boxes.view", "network.logins.view"] as const;
}
