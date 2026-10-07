import { createRenderer, defineComponent, h, nextTick, ref } from "vue";
import { createPinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNetworkMonitor, applyConnectionUpdate } from "../../client/src/composables/useNetworkMonitor.js";
import { useAuthStore } from "../../client/src/stores/auth.js";
import { registerRecordDialog } from "../../client/src/composables/recordDialog.js";
afterEach(() => vi.unstubAllGlobals());
describe("Monitor no navegador: aba e modal em foco", () => {
  it("atualiza IP e badge sem afetar os dados da ONU ou outro login", () => {
    const login = { id: 1, ip: "192.0.2.1", status: "online", ftthBoxId: 25, ftthPort: "13", onuMac: "DEMO" };
    const update = { id: 1, boxId: 0, active: "S", online: "N", ip: null, port: 0 };
    expect(applyConnectionUpdate(login, update)).toMatchObject({
      id: 1,
      ip: null,
      status: "offline",
      ftthBoxId: 25,
      ftthPort: "13",
      onuMac: "DEMO",
    });
    expect(applyConnectionUpdate(login, { ...update, id: 2 })).toBe(login);
  });
  it("conecta só na aba Logins, troca a lista pelo login do modal, pausa oculto e encerra ao revogar ou desmontar", async () => {
    const listeners = new Set<() => void>();
    const document = {
      hidden: false,
      addEventListener: (_name: string, callback: () => void) => listeners.add(callback),
      removeEventListener: (_name: string, callback: () => void) => listeners.delete(callback),
    };
    vi.stubGlobal("document", document);
    vi.stubGlobal("location", { protocol: "http:", host: "localhost:4187" });
    vi.stubGlobal("localStorage", { getItem: () => "fictitious-token" });
    class Socket {
      static all: Socket[] = [];
      closed = false;
      messages: string[] = [];
      onopen?: () => void;
      onclose?: (event: { code: number }) => void;
      onmessage?: (event: { data: string }) => void;
      constructor(public url: string) {
        Socket.all.push(this);
      }
      send(value: string) {
        this.messages.push(value);
      }
      close() {
        this.closed = true;
        this.onclose?.({ code: 1000 });
      }
    }
    vi.stubGlobal("WebSocket", Socket);
    const renderer = createRenderer<any, any>({
      patchProp: () => {},
      insert: () => {},
      remove: () => {},
      createElement: () => ({}),
      createText: () => ({}),
      createComment: () => ({}),
      setText: () => {},
      setElementText: () => {},
      parentNode: () => null,
      nextSibling: () => null,
    });
    const tab = ref("customer"),
      modal = ref(false),
      selected = ref({ id: 1, ip: "192.0.2.1" as string | null }),
      updates = vi.fn();
    let auth: ReturnType<typeof useAuthStore>;
    const app = renderer.createApp(
      defineComponent({
        setup() {
          auth = useAuthStore();
          auth.user = {
            id: 1,
            name: "Teste",
            email: "teste@example.test",
            role: "USER",
            permissions: ["support.customer.view", "support.contract.view", "support.logins.view"],
          };
          useNetworkMonitor({
            scope: () => ({ scope: "customer", module: "support", customerId: 3, loginIds: [1, 2] }),
            enabled: () => tab.value === "logins",
            connections: updates,
          });
          useNetworkMonitor({
            scope: () => (modal.value ? { scope: "login", module: "support", contractId: 10, loginId: selected.value.id } : null),
            dialogTarget: () => (modal.value ? "#test-login-modal" : undefined),
            connections: (rows) => {
              const row = rows.find((item) => item.id === selected.value.id);
              if (row) selected.value = applyConnectionUpdate(selected.value, row);
            },
          });
          return () => h("div");
        },
      })
    );
    app.use(createPinia());
    app.mount({});
    let unregister: (() => void) | undefined;
    try {
      expect(Socket.all).toHaveLength(0);
      tab.value = "logins";
      await nextTick();
      expect(Socket.all).toHaveLength(1);
      const list = Socket.all[0]!;
      list.onopen?.();
      expect(JSON.parse(list.messages[0]!)).toMatchObject({ scope: "customer", module: "support", customerId: 3, loginIds: [1, 2] });
      list.onmessage?.({
        data: JSON.stringify({
          type: "state",
          checkedAt: "2026-10-07T20:00:00Z",
          connections: [{ id: 1, ip: null, online: "N" }],
          offlineCount: 0,
        }),
      });
      await nextTick();
      expect(updates).toHaveBeenCalled();
      expect(Socket.all).toHaveLength(1);
      unregister = registerRecordDialog("#test-login-modal");
      modal.value = true;
      await nextTick();
      expect(list.closed).toBe(true);
      expect(Socket.all).toHaveLength(2);
      const focused = Socket.all[1]!;
      focused.onopen?.();
      expect(JSON.parse(focused.messages[0]!)).toMatchObject({ scope: "login", module: "support", loginId: 1, contractId: 10 });
      focused.onmessage?.({
        data: JSON.stringify({
          type: "state",
          checkedAt: "2026-10-07T20:00:01Z",
          connections: [{ id: 1, ip: null, online: "N" }],
          offlineCount: 0,
        }),
      });
      await nextTick();
      expect(selected.value.ip).toBeNull();
      expect(focused.closed).toBe(false);
      expect(Socket.all).toHaveLength(2);
      modal.value = false;
      unregister();
      unregister = undefined;
      await nextTick();
      expect(focused.closed).toBe(true);
      expect(Socket.all).toHaveLength(3);
      document.hidden = true;
      listeners.forEach((callback) => callback());
      await nextTick();
      expect(Socket.all[2]?.closed).toBe(true);
      document.hidden = false;
      listeners.forEach((callback) => callback());
      await nextTick();
      expect(Socket.all).toHaveLength(4);
      auth!.user!.permissions = [];
      await nextTick();
      expect(Socket.all[3]?.closed).toBe(true);
      tab.value = "contracts";
      await nextTick();
      expect(Socket.all).toHaveLength(4);
    } finally {
      unregister?.();
      app.unmount();
    }
    expect(listeners.size).toBe(0);
    expect(Socket.all.every((socket) => socket.closed)).toBe(true);
  });
});
