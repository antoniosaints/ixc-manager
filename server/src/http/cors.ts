import type { FastifyCorsOptions } from "@fastify/cors";

export function corsOptions(origin: string): FastifyCorsOptions {
  return {
    origin,
    // The plugin defaults to GET, HEAD and POST, excluding user/settings edits.
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  };
}
