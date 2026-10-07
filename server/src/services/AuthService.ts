import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyRequest } from "fastify";
import { effectivePermissions, type Permission } from "../config/permissions.js";
import { db } from "../repositories/database.js";

const scrypt = promisify(scryptCallback);
const SESSION_DAYS = 7;
export type UserRole = "USER" | "OPERATOR" | "MANAGER" | "ADMIN";
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  permissions?: Permission[];
  profileId?: number | null;
  profileName?: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export class AuthService {
  async hasUsers() {
    const [rows] = await db.query<any[]>("SELECT COUNT(*) total FROM retention_users");
    return Number(rows[0]?.total ?? 0) > 0;
  }
  async hashPassword(password: string) {
    const salt = randomBytes(16).toString("hex");
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return `${salt}:${derived.toString("hex")}`;
  }
  async verifyPassword(password: string, stored: string) {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    const expected = Buffer.from(hash, "hex");
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  }
  async createSession(user: AuthUser) {
    const token = randomBytes(32).toString("base64url");
    await db.execute("INSERT INTO retention_user_sessions (user_id,token_hash,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL ? DAY))", [
      user.id,
      tokenHash(token),
      SESSION_DAYS,
    ]);
    const [rows] = await db.query<any[]>(
      "SELECT u.*,p.name profile_name,p.permissions profile_permissions FROM retention_users u LEFT JOIN retention_permission_profiles p ON p.id=u.profile_id WHERE u.id=?",
      [user.id]
    );
    return { token, user: rows[0] ? this.serializeAccess(rows[0]) : user };
  }
  async authenticate(request: FastifyRequest) {
    const value = request.headers.authorization;
    if (!value?.startsWith("Bearer ")) return null;
    const [rows] = await db.query<any[]>(
      "SELECT u.id,u.name,u.email,u.role,u.profile_id,u.permission_overrides,p.name profile_name,p.permissions profile_permissions FROM retention_user_sessions s JOIN retention_users u ON u.id=s.user_id LEFT JOIN retention_permission_profiles p ON p.id=u.profile_id WHERE s.token_hash=? AND s.expires_at>NOW() AND u.active=1 LIMIT 1",
      [tokenHash(value.slice(7))]
    );
    const row = rows[0];
    return row ? this.serializeAccess(row) : null;
  }
  async requireUser(request: FastifyRequest, roles?: UserRole[]) {
    const user = request.authUser ?? (await this.authenticate(request));
    if (!user) throw Object.assign(new Error("Autenticação necessária"), { statusCode: 401 });
    if (roles && !roles.includes(user.role)) throw Object.assign(new Error("Você não tem permissão para esta ação"), { statusCode: 403 });
    request.authUser = user;
    return user;
  }
  serializeAccess(row: any): AuthUser {
    const parse = (value: unknown) => (typeof value === "string" ? JSON.parse(value) : value);
    const profile = row.profile_id ? parse(row.profile_permissions) : null;
    // A missing/corrupt linked profile must never fall back to a broader legacy role.
    const base = row.profile_id ? (Array.isArray(profile) ? profile : []) : null;
    const overrides = parse(row.permission_overrides) ?? {};
    return {
      id: Number(row.id),
      name: row.name,
      email: row.email,
      role: row.role,
      profileId: row.profile_id ? Number(row.profile_id) : null,
      profileName: row.profile_name ?? null,
      permissions: effectivePermissions(row.role, base, overrides),
    };
  }
  can(user: AuthUser, permission: Permission) {
    return user.role === "ADMIN" || (user.permissions ?? []).includes(permission);
  }
  async requirePermission(request: FastifyRequest, ...permissions: Permission[]) {
    const user = await this.requireUser(request);
    if (!permissions.every((permission) => this.can(user, permission)))
      throw Object.assign(new Error("Você não tem permissão para esta ação"), { statusCode: 403 });
    return user;
  }
  async requireAnyPermission(request: FastifyRequest, ...permissions: Permission[]) {
    const user = await this.requireUser(request);
    if (!permissions.some((permission) => this.can(user, permission)))
      throw Object.assign(new Error("Você não tem permissão para esta ação"), { statusCode: 403 });
    return user;
  }
  async revokeSession(request: FastifyRequest) {
    const value = request.headers.authorization;
    if (value?.startsWith("Bearer "))
      await db.execute("DELETE FROM retention_user_sessions WHERE token_hash=?", [tokenHash(value.slice(7))]);
  }
  async findUserByEmail(email: string) {
    const [rows] = await db.query<any[]>("SELECT id,name,email,password_hash,role,active FROM retention_users WHERE email=? LIMIT 1", [
      normalizeEmail(email),
    ]);
    return rows[0];
  }
  email(value: string) {
    return normalizeEmail(value);
  }
}
