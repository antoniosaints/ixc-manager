import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { access } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const defaultFrontendDirectory = fileURLToPath(new URL("../../../client/dist/", import.meta.url));
function publicPath(path: string) {
  return !/^\/?api(?:\/|$)/i.test(path) && !path.split(/[\\/]/).some((part) => part.startsWith(".")) && !path.includes("\0");
}
/** Production frontend and API share the same origin; no browser API hostname is baked into the build. */
export async function registerFrontend(app: FastifyInstance, directory = defaultFrontendDirectory): Promise<boolean> {
  const root = resolve(directory);
  try {
    await access(resolve(root, "index.html"));
  } catch {
    app.log.info("Frontend não compilado; API disponível. Execute npm run build:frontend para servir a interface neste endereço.");
    return false;
  }
  await app.register(fastifyStatic, {
    root,
    prefix: "/",
    index: ["index.html"],
    dotfiles: "deny",
    allowedPath: (path) => publicPath(path),
    setHeaders(response, path) {
      response.header("X-Content-Type-Options", "nosniff");
      response.header("Cache-Control", path.endsWith(".html") ? "no-store" : "public, max-age=3600");
    },
    logLevel: "silent",
  });
  app.setNotFoundHandler(async (request, reply) => {
    let path: string;
    try {
      path = decodeURIComponent(request.url.split("?")[0] ?? "");
    } catch {
      return reply.code(400).send({ message: "Endereço inválido." });
    }
    // Unknown API routes and missing assets must never become a 200 HTML response.
    if (!["GET", "HEAD"].includes(request.method) || !publicPath(path) || extname(path))
      return reply.code(404).send({ message: "Recurso não encontrado." });
    return reply.type("text/html").header("Cache-Control", "no-store").sendFile("index.html");
  });
  return true;
}
