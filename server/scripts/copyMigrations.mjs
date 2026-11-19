import { copyFile, mkdir, readdir } from "node:fs/promises";
import { URL } from "node:url";

const source = new URL("../migrations/", import.meta.url);
const destination = new URL("../dist/migration-sql/", import.meta.url);
await mkdir(destination, { recursive: true });
await Promise.all(
  (await readdir(source)).filter((file) => file.endsWith(".sql")).map((file) => copyFile(new URL(file, source), new URL(file, destination)))
);
