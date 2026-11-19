import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, link, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export class AiSecretVault {
  constructor(private readonly directory = fileURLToPath(new URL("../../../data/ai-secrets/", import.meta.url))) {}
  private async master(create: boolean): Promise<Buffer> {
    const path = resolve(this.directory, "master.key");
    try {
      const key = await readFile(path);
      if (key.length !== 32) throw new Error("Chave de proteção inválida.");
      return key;
    } catch (error) {
      if (!create || (error as { code?: string }).code !== "ENOENT")
        throw new Error("Chave de proteção indisponível. Restaure o volume de segredos do backend.");
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = resolve(this.directory, `.master-${randomBytes(12).toString("hex")}.tmp`);
    try {
      await writeFile(temporary, randomBytes(32), { flag: "wx", mode: 0o600 });
      try {
        await link(temporary, path);
      } catch (error) {
        if ((error as { code?: string }).code !== "EEXIST") throw error;
      }
    } finally {
      await unlink(temporary).catch(() => {});
    }
    return this.master(false);
  }
  async encrypt(value: string, provider: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", await this.master(true), iv);
    cipher.setAAD(Buffer.from(`retencao-cas:ai:${provider}:v1`));
    const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(":");
  }
  async decrypt(value: string, provider: string) {
    const [version, iv, tag, body, extra] = value.split(":");
    if (version !== "v1" || !iv || !tag || !body || extra) throw new Error("Segredo de IA inválido.");
    const decipher = createDecipheriv("aes-256-gcm", await this.master(false), Buffer.from(iv, "base64"));
    decipher.setAAD(Buffer.from(`retencao-cas:ai:${provider}:v1`));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
  }
}
