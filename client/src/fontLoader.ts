import "@fontsource-variable/inter";
import type { SystemFont } from "./typography";
const pending = new Map<SystemFont, Promise<unknown>>();
export function loadSystemFont(font: SystemFont): Promise<unknown> {
  if (font === "inter") return Promise.resolve();
  let loading = pending.get(font);
  if (!loading) {
    loading =
      font === "sora"
        ? import("@fontsource-variable/sora")
        : font === "roboto"
          ? import("@fontsource-variable/roboto")
          : Promise.all([
              import("@fontsource/poppins/latin-400.css"),
              import("@fontsource/poppins/latin-500.css"),
              import("@fontsource/poppins/latin-600.css"),
              import("@fontsource/poppins/latin-700.css"),
              import("@fontsource/poppins/latin-800.css"),
              import("@fontsource/poppins/latin-900.css"),
            ]);
    pending.set(font, loading);
    loading.catch(() => pending.delete(font));
  }
  return loading;
}
