import { readFile } from "node:fs/promises";
import { db } from "../repositories/database.js";
try {
  await db.query(await readFile(new URL("../../migrations/019_raffles.sql", import.meta.url), "utf8"));
  console.log("Módulo de sorteios instalado na base da aplicação.");
} catch {
  console.error("Não foi possível instalar os sorteios. Verifique a conexão e a permissão de criar tabelas na base da aplicação.");
  process.exitCode = 1;
} finally {
  await db.end();
}
