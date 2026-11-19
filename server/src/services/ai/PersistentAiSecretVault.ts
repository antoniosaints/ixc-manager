import { createCipheriv, createDecipheriv, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { db } from "../../repositories/database.js";
import { env } from "../../config/env.js";
import { AiSecretVault, AiSecretUnavailableError } from "./AiSecretVault.js";

const scrypt = promisify(nodeScrypt);
const envelopeSchema = z.object({
  mode: z.enum(["server-secret", "database-password"]),
  salt: z.string(),
  iv: z.string(),
  tag: z.string(),
  body: z.string(),
});
type Envelope = z.infer<typeof envelopeSchema>;
export interface AiKeyringStore {
  read(): Promise<Envelope | null>;
  insertIfMissing(value: Envelope): Promise<void>;
}
export class AiKeyringRepository implements AiKeyringStore {
  async read() {
    try {
      const [rows] = await db.query<any[]>("SELECT envelope FROM retention_ai_keyring WHERE id=1");
      return rows[0] ? envelopeSchema.parse(typeof rows[0].envelope === "string" ? JSON.parse(rows[0].envelope) : rows[0].envelope) : null;
    } catch (error) {
      if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return null;
      throw error;
    }
  }
  async insertIfMissing(value: Envelope) {
    const insert = () =>
      db.execute("INSERT INTO retention_ai_keyring (id,envelope) VALUES (1,?) ON DUPLICATE KEY UPDATE id=id", [JSON.stringify(value)]);
    try {
      await insert();
    } catch (error) {
      if ((error as { code?: string }).code !== "ER_NO_SUCH_TABLE") throw error;
      await db.query(`CREATE TABLE IF NOT EXISTS retention_ai_keyring (
        id TINYINT PRIMARY KEY,envelope JSON NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      await insert();
    }
  }
}
type WrappingSecret = { mode: Envelope["mode"]; value: string };
function backendSecret(mode?: Envelope["mode"]): WrappingSecret {
  if (mode === "server-secret" || (!mode && env.AI_ENCRYPTION_SECRET)) {
    if (!env.AI_ENCRYPTION_SECRET) throw new AiSecretUnavailableError("O segredo de proteção do servidor não está disponível.", "backend");
    return { mode: "server-secret", value: env.AI_ENCRYPTION_SECRET };
  }
  let password = "";
  try {
    password = decodeURIComponent(new URL(env.DATABASE_URL).password);
  } catch {
    /* Never use the URI itself as a key. */
  }
  if (!password)
    throw new AiSecretUnavailableError("Defina AI_ENCRYPTION_SECRET no servidor para proteger as credenciais de IA.", "backend");
  return { mode: "database-password", value: password };
}
/** The data key survives redeploys. A database dump alone does not contain its wrapping secret. */
export class PersistentAiSecretVault extends AiSecretVault {
  private loaded?: Promise<Buffer>;
  private persisted = false;
  constructor(
    private readonly store: AiKeyringStore = new AiKeyringRepository(),
    legacyDirectory?: string,
    private readonly secret: (mode?: Envelope["mode"]) => WrappingSecret = backendSecret
  ) {
    super(legacyDirectory);
  }
  private async wrappingKey(secret: string, salt: Buffer) {
    return (await scrypt(secret, salt, 32)) as Buffer;
  }
  private async wrap(key: Buffer): Promise<Envelope> {
    const secret = this.secret(),
      salt = randomBytes(16),
      iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", await this.wrappingKey(secret.value, salt), iv);
    cipher.setAAD(Buffer.from(`retencao-cas:ai-keyring:v1:${secret.mode}`));
    const body = Buffer.concat([cipher.update(key), cipher.final()]);
    return {
      mode: secret.mode,
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      body: body.toString("base64"),
    };
  }
  private async unwrap(envelope: Envelope): Promise<Buffer> {
    try {
      const salt = Buffer.from(envelope.salt, "base64"),
        iv = Buffer.from(envelope.iv, "base64"),
        tag = Buffer.from(envelope.tag, "base64");
      if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw new Error("Formato inválido");
      const decipher = createDecipheriv("aes-256-gcm", await this.wrappingKey(this.secret(envelope.mode).value, salt), iv);
      decipher.setAAD(Buffer.from(`retencao-cas:ai-keyring:v1:${envelope.mode}`));
      decipher.setAuthTag(tag);
      const key = Buffer.concat([decipher.update(Buffer.from(envelope.body, "base64")), decipher.final()]);
      if (key.length !== 32) throw new Error("Chave inválida");
      return key;
    } catch {
      throw new AiSecretUnavailableError(
        "Não foi possível abrir a proteção persistente. Restaure o segredo original do backend.",
        "backend"
      );
    }
  }
  private async persist(key: Buffer) {
    if (this.persisted) return;
    await this.store.insertIfMissing(await this.wrap(key));
    const envelope = await this.store.read();
    if (!envelope) throw new AiSecretUnavailableError("Não foi possível persistir a proteção de IA.");
    const stored = await this.unwrap(envelope);
    if (!timingSafeEqual(key, stored))
      throw new AiSecretUnavailableError(
        "Foram encontradas proteções de IA diferentes. Preserve o segredo original e revise a instalação.",
        "backend"
      );
    this.persisted = true;
  }
  protected async master(create: boolean): Promise<Buffer> {
    if (!this.loaded) {
      this.loaded = (async () => {
        const envelope = await this.store.read();
        if (envelope) {
          const key = await this.unwrap(envelope);
          this.persisted = true;
          return key;
        }
        try {
          return await super.master(false);
        } catch (error) {
          if (!create) throw error;
          // New registrations are explicit. Existing ciphertext is never rewritten here.
          const candidate = randomBytes(32);
          await this.store.insertIfMissing(await this.wrap(candidate));
          const winner = await this.store.read();
          if (!winner) throw new AiSecretUnavailableError("Não foi possível persistir a proteção de IA.");
          const key = await this.unwrap(winner);
          this.persisted = true;
          return key;
        }
      })().catch((error) => {
        this.loaded = undefined;
        throw error;
      });
    }
    const key = await this.loaded;
    if (create) await this.persist(key);
    return key;
  }
  async decrypt(value: string, provider: string) {
    let plaintext: string;
    try {
      plaintext = await super.decrypt(value, provider);
    } catch (error) {
      if (!this.persisted) this.loaded = undefined;
      throw error;
    }
    // Migrate a valid legacy file only after authenticating an existing credential.
    await this.persist(await this.master(false));
    return plaintext;
  }
}
