import { readFile } from "node:fs/promises";
import { db } from "../repositories/database.js";

try {
  const sql = await readFile(new URL("../../migrations/018_churn_settings.sql", import.meta.url), "utf8");
  await db.query(sql);
  console.log("Configuração de Churn instalada. Dados e faixas existentes foram preservados.");
} catch {
  console.error(
    "Não foi possível instalar a configuração de Churn. Verifique a conexão e a permissão de criar tabelas na base da aplicação."
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
