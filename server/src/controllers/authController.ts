import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { overridesSchema } from "../services/settings/SettingsService.js";
import { db } from "../repositories/database.js";
import { AuthService } from "../services/AuthService.js";

const auth = new AuthService();
const credentials = z.object({ email: z.string().email().max(190), password: z.string().min(8).max(200) });
const userInput = credentials.extend({
  name: z.string().trim().min(2).max(120),
  role: z.enum(["USER", "OPERATOR", "MANAGER", "ADMIN"]).default("USER"),
  profileId: z.number().int().positive().nullable().default(null),
  permissionOverrides: overridesSchema.default({}),
  active: z.boolean().default(true),
});
const serialize = (row: any) => ({
  ...auth.serializeAccess(row),
  active: Boolean(row.active),
  createdAt: row.created_at,
  permissionOverrides:
    typeof row.permission_overrides === "string" ? JSON.parse(row.permission_overrides) : (row.permission_overrides ?? {}),
});
const validateProfile = async (profileId: number | null | undefined, role?: string) => {
  if (role === "ADMIN" && profileId)
    throw Object.assign(new Error("Administradores usam acesso completo, sem perfil personalizado."), { statusCode: 400 });
  if (profileId) {
    const [rows] = await db.query<any[]>("SELECT id FROM retention_permission_profiles WHERE id=?", [profileId]);
    if (!rows.length) throw Object.assign(new Error("Perfil não encontrado."), { statusCode: 400 });
  }
};

export async function authRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  app.setErrorHandler((error, _request, reply) => {
    const code = (error as { code?: string }).code;
    const status =
      error instanceof z.ZodError ? 400 : code === "ER_DUP_ENTRY" ? 409 : Number((error as { statusCode?: number }).statusCode ?? 500);
    reply.code(status).send({
      message:
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "Revise os dados informados.")
          : code === "ER_DUP_ENTRY"
            ? "Este e-mail já está cadastrado."
            : status >= 500
              ? "Não foi possível concluir a operação."
              : (error as Error).message,
    });
  });
  app.get("/setup-status", async () => ({ needsSetup: !(await auth.hasUsers()) }));
  app.post("/setup", async (request, reply) => {
    if (await auth.hasUsers()) return reply.code(409).send({ message: "O administrador inicial já foi configurado" });
    const input = userInput.parse(request.body);
    const hash = await auth.hashPassword(input.password);
    const [result] = await db.execute<any>("INSERT INTO retention_users (name,email,password_hash,role) VALUES (?,?,?, 'ADMIN')", [
      input.name,
      auth.email(input.email),
      hash,
    ]);
    return auth.createSession({ id: result.insertId, name: input.name, email: auth.email(input.email), role: "ADMIN" });
  });
  app.post("/login", async (request, reply) => {
    const input = credentials.parse(request.body);
    const user = await auth.findUserByEmail(input.email);
    if (!user || !user.active || !(await auth.verifyPassword(input.password, user.password_hash)))
      return reply.code(401).send({ message: "E-mail ou senha inválidos" });
    return auth.createSession({ id: Number(user.id), name: user.name, email: user.email, role: user.role });
  });
  app.get("/me", async (request) => auth.requireUser(request));
  app.post("/logout", async (request) => {
    await auth.revokeSession(request);
    return { ok: true };
  });
  app.get("/users", async (request) => {
    await auth.requireUser(request, ["ADMIN"]);
    const [rows] = await db.query<any[]>(
      "SELECT u.*,p.name profile_name,p.permissions profile_permissions FROM retention_users u LEFT JOIN retention_permission_profiles p ON p.id=u.profile_id ORDER BY u.name"
    );
    return { items: rows.map(serialize) };
  });
  app.post("/users", async (request) => {
    await auth.requireUser(request, ["ADMIN"]);
    const input = userInput.parse(request.body);
    await validateProfile(input.profileId, input.role);
    const [result] = await db.execute<any>(
      "INSERT INTO retention_users (name,email,password_hash,role,profile_id,permission_overrides,active) VALUES (?,?,?,?,?,?,?)",
      [
        input.name,
        auth.email(input.email),
        await auth.hashPassword(input.password),
        input.role,
        input.profileId,
        JSON.stringify(input.permissionOverrides),
        input.active ? 1 : 0,
      ]
    );
    return { id: result.insertId };
  });
  app.patch("/users/:userId", async (request) => {
    const currentUser = await auth.requireUser(request, ["ADMIN"]);
    const { userId } = z.object({ userId: z.coerce.number().int().positive() }).parse(request.params);
    const input = z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        email: z.string().email().max(190).optional(),
        role: z.enum(["USER", "OPERATOR", "MANAGER", "ADMIN"]).optional(),
        active: z.boolean().optional(),
        password: z.string().min(8).max(200).optional(),
        profileId: z.number().int().positive().nullable().optional(),
        permissionOverrides: overridesSchema.optional(),
      })
      .parse(request.body);
    if (
      userId === currentUser.id &&
      (input.role !== undefined || input.active !== undefined || input.profileId !== undefined || input.permissionOverrides !== undefined)
    ) {
      throw Object.assign(new Error("Você não pode alterar a própria permissão ou desativar o próprio acesso"), { statusCode: 403 });
    }
    await validateProfile(input.profileId, input.role);
    const updates: string[] = [];
    const values: unknown[] = [];
    if (input.name !== undefined) {
      updates.push("name=?");
      values.push(input.name);
    }
    if (input.email !== undefined) {
      updates.push("email=?");
      values.push(auth.email(input.email));
    }
    if (input.role !== undefined) {
      updates.push("role=?");
      values.push(input.role);
    }
    if (input.profileId !== undefined) {
      updates.push("profile_id=?");
      values.push(input.profileId);
    }
    if (input.permissionOverrides !== undefined) {
      updates.push("permission_overrides=?");
      values.push(JSON.stringify(input.permissionOverrides));
    }
    if (input.active !== undefined) {
      updates.push("active=?");
      values.push(input.active ? 1 : 0);
    }
    if (input.password !== undefined) {
      updates.push("password_hash=?");
      values.push(await auth.hashPassword(input.password));
    }
    if (!updates.length) return { ok: true };
    values.push(userId);
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      // Serialize administrator changes so two concurrent edits cannot remove the last administrator.
      const [locked] = await connection.query<any[]>(
        "SELECT id,role,active FROM retention_users WHERE role='ADMIN' OR id=? ORDER BY id FOR UPDATE",
        [userId]
      );
      if (!locked.some((row) => Number(row.id) === currentUser.id && row.role === "ADMIN" && row.active))
        throw Object.assign(new Error("Seu acesso administrativo foi alterado. Entre novamente."), { statusCode: 403 });
      const target = locked.find((row) => Number(row.id) === userId);
      if (!target) throw Object.assign(new Error("Usuário não encontrado."), { statusCode: 404 });
      if (
        target.role === "ADMIN" &&
        target.active &&
        (input.active === false || (input.role && input.role !== "ADMIN")) &&
        locked.filter((row) => row.role === "ADMIN" && row.active).length <= 1
      )
        throw Object.assign(new Error("Mantenha ao menos um administrador ativo."), { statusCode: 409 });
      await connection.query(`UPDATE retention_users SET ${updates.join(",")} WHERE id=?`, values);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return { ok: true };
  });
}
