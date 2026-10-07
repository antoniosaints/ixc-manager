import { expect, it, vi } from "vitest";
import { copyPasswordAndAccess, equipmentAccessOptions } from "../../client/src/equipmentAccess.js";

it("copia a senha exata antes de navegar, descartando o valor após o acesso", async () => {
  const events: string[] = [];
  const response = { url: "http://192.0.2.10:7000/", password: "  SENHA_FICTICIA  " };
  const target = { closed: false, navigate: vi.fn(() => events.push("navigate")), close: vi.fn() };
  const copy = vi.fn(async () => {
    events.push("copy");
  });
  await copyPasswordAndAccess(
    async () => {
      events.push("read");
      return response;
    },
    copy,
    target,
    new AbortController().signal
  );
  expect(events).toEqual(["read", "copy", "navigate"]);
  expect(copy).toHaveBeenCalledWith("  SENHA_FICTICIA  ");
  expect(target.navigate).toHaveBeenCalledWith("http://192.0.2.10:7000/");
  expect(target.close).not.toHaveBeenCalled();
  expect(response.password).toBe("");
  expect(equipmentAccessOptions).toEqual([
    { protocol: "https", port: 7000 },
    { protocol: "https", port: 7001 },
    { protocol: "http", port: 7000 },
    { protocol: "http", port: 7001 },
    { protocol: "https", port: 80 },
    { protocol: "http", port: 80 },
  ]);
});
it("não navega quando o IXC ou a cópia falha e encerra a tentativa de acesso", async () => {
  for (const cause of ["api", "clipboard"]) {
    const target = { closed: false, navigate: vi.fn(), close: vi.fn() };
    const copy = vi.fn(async () => {
      throw new Error("Falha de cópia");
    });
    await expect(
      copyPasswordAndAccess(
        async () => {
          if (cause === "api") throw new Error("Falha IXC");
          return { url: "https://192.0.2.10:7001/", password: "TESTE" };
        },
        copy,
        target,
        new AbortController().signal
      )
    ).rejects.toThrow();
    expect(target.navigate).not.toHaveBeenCalled();
    expect(target.close).toHaveBeenCalledTimes(1);
    if (cause === "api") expect(copy).not.toHaveBeenCalled();
  }
});
it("cancelamento e fechamento da aba impedem cópia ou navegação tardias", async () => {
  const controller = new AbortController();
  const target = { closed: false, navigate: vi.fn(), close: vi.fn() };
  const copy = vi.fn(async () => {});
  await expect(
    copyPasswordAndAccess(
      async () => {
        controller.abort();
        return { url: "http://192.0.2.10:80/", password: "TESTE" };
      },
      copy,
      target,
      controller.signal
    )
  ).rejects.toThrow("cancelado");
  expect(copy).not.toHaveBeenCalled();
  target.closed = true;
  await expect(
    copyPasswordAndAccess(async () => ({ url: "http://192.0.2.10:80/", password: "TESTE" }), copy, target, new AbortController().signal)
  ).rejects.toThrow("cancelado");
  target.closed = false;
  const duringCopy = new AbortController();
  await expect(
    copyPasswordAndAccess(
      async () => ({ url: "http://192.0.2.10:80/", password: "TESTE" }),
      async () => {
        duringCopy.abort();
      },
      target,
      duringCopy.signal
    )
  ).rejects.toThrow("cancelado");
  expect(target.navigate).not.toHaveBeenCalled();
});
