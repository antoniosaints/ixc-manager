import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createToastManager } from "../../client/src/notifications/toast.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
describe("Notificações do sistema", () => {
  it("permite seis posições, tempo configurável e substitui avisos repetidos", () => {
    const toast = createToastManager();
    toast.configure({ position: "bottom-left", duration: 3000 });
    toast.show({ title: "Copiado", key: "copy", type: "success" });
    toast.show({ title: "Copiado novamente", key: "copy", type: "success" });
    expect(toast.items).toHaveLength(1);
    expect(toast.items[0]).toMatchObject({ position: "bottom-left", title: "Copiado novamente", duration: 3000 });
    toast.show({ title: "Erro", type: "error", position: "top-center" });
    expect(toast.items[1]?.duration).toBe(8000);
    vi.advanceTimersByTime(3000);
    expect(toast.items.map((item) => item.title)).toEqual(["Erro"]);
    vi.advanceTimersByTime(5000);
    expect(toast.items).toHaveLength(0);
  });
  it("pausa enquanto hover, foco ou aba oculta estiverem ativos e mantém o tempo restante", () => {
    const toast = createToastManager();
    const id = toast.success("Salvo");
    vi.advanceTimersByTime(2000);
    toast.pause(id, "hover");
    toast.pause(id, "focus");
    vi.advanceTimersByTime(20000);
    toast.resume(id, "hover");
    vi.advanceTimersByTime(20000);
    expect(toast.items).toHaveLength(1);
    toast.resume(id, "focus");
    vi.advanceTimersByTime(1000);
    toast.visibility(true);
    vi.advanceTimersByTime(10000);
    toast.visibility(false);
    vi.advanceTimersByTime(1999);
    expect(toast.items).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toast.items).toHaveLength(0);
    toast.visibility(true);
    toast.info("Criado enquanto oculta");
    vi.advanceTimersByTime(30000);
    expect(toast.items).toHaveLength(1);
    toast.visibility(false);
    vi.advanceTimersByTime(5000);
    expect(toast.items).toHaveLength(0);
  });
  it("aguarda a resposta das confirmações e nunca confirma ao fechar ou navegar", async () => {
    const toast = createToastManager();
    const confirm = toast.confirm({ title: "Restaurar?" });
    vi.advanceTimersByTime(60000);
    expect(toast.items[0]?.confirmation).toBe(true);
    await toast.act(toast.items[0]!.id, 0);
    await expect(confirm).resolves.toBe(true);
    const cancel = toast.confirm({ title: "Restaurar?" });
    await toast.act(toast.items[0]!.id, 1);
    await expect(cancel).resolves.toBe(false);
    const close = toast.confirm({ title: "Restaurar?" });
    toast.dismiss(toast.items[0]!.id);
    await expect(close).resolves.toBe(false);
    const navigate = toast.confirm({ title: "Restaurar?" });
    toast.cancelConfirmations();
    await expect(navigate).resolves.toBe(false);
  });
  it("executa ações async uma vez, mantém falhas para tentar novamente e não vaza detalhes", async () => {
    const toast = createToastManager();
    let resolve: () => void = () => {};
    const onClick = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        })
    );
    const id = toast.show({ title: "Executar", actions: [{ label: "Tentar", onClick }] });
    const pending = toast.act(id, 0);
    await toast.act(id, 0);
    toast.dismiss(id);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(toast.items[0]?.busy).toBe(true);
    resolve();
    await pending;
    expect(toast.items).toHaveLength(0);
    const failing = vi.fn().mockRejectedValueOnce(new Error("PRIVATE_TOKEN")).mockResolvedValueOnce(undefined);
    const errorId = toast.show({ title: "Executar", actions: [{ label: "Tentar", onClick: failing }] });
    await toast.act(errorId, 0);
    expect(toast.items[0]).toMatchObject({ type: "error", busy: false });
    expect(JSON.stringify(toast.items)).not.toContain("PRIVATE_TOKEN");
    vi.advanceTimersByTime(60000);
    expect(toast.items).toHaveLength(1);
    await toast.act(errorId, 0);
    expect(toast.items).toHaveLength(0);
  });
  it("limita avisos passivos sem perder confirmações ou ações pendentes", async () => {
    const toast = createToastManager();
    const pending = toast.confirm({ title: "Confirmar" });
    for (let i = 0; i < 10; i++) toast.info(`Aviso ${i}`);
    expect(toast.items).toHaveLength(5);
    expect(toast.items[0]?.confirmation).toBe(true);
    toast.clear();
    await expect(pending).resolves.toBe(false);
  });
});
