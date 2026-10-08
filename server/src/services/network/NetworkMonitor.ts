import type { WebSocket } from "ws";
import { z } from "zod";
import type { IxcReadDatabase, IxcReadQuery } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { connectionSubscription, subscriptionScope, type ConnectionScope } from "./ConnectionMonitorScope.js";
import { connectedIpSql, connectionIp } from "./LoginConnection.js";
export { networkSubscription, connectionPermissions } from "./ConnectionMonitorScope.js";

export interface ConnectionState {
  id: number;
  boxId: number;
  active: string | null;
  online: string | null;
  port: number | null;
  ip?: string | null;
}
export function networkMonitorSql(boxIds: number[]): IxcReadQuery {
  const scope = connectionSubscription.parse({ type: "auth", token: "internal", boxIds });
  return connectionMonitorSql(scope);
}
export function connectionMonitorSql(scope: ConnectionScope): IxcReadQuery {
  let where: string;
  let params: number[];
  if (scope.scope === "boxes") {
    where = `r.id_caixa_ftth IN (${scope.boxIds.map(() => "?").join(",")})`;
    params = scope.boxIds;
  } else if (scope.scope === "login-list") {
    where = `r.id IN (${scope.loginIds.map(() => "?").join(",")})`;
    params = scope.loginIds;
  } else if (scope.scope === "customer") {
    where = `r.id_cliente=? AND r.id IN (${scope.loginIds.map(() => "?").join(",")})`;
    params = [scope.customerId, ...scope.loginIds];
  } else if (scope.scope === "login") {
    where =
      "r.id=? AND r.id_contrato=? AND EXISTS (SELECT 1 FROM cliente_contrato ct WHERE ct.id=r.id_contrato AND ct.id_cliente=r.id_cliente)";
    params = [scope.loginId, scope.contractId];
  } else {
    where = "r.id=? AND r.id_caixa_ftth=?";
    params = [scope.loginId, scope.boxId];
  }
  return {
    name: "network-connection-monitor",
    sql: `SELECT r.id,COALESCE(r.id_caixa_ftth,0) boxId,r.ativo active,
      CASE WHEN ${connectedIpSql} THEN 'S' ELSE 'N' END online,r.ip,r.ftth_porta port
      FROM radusuarios r WHERE ${where} ORDER BY r.id LIMIT 5001`,
    params,
    timeoutSeconds: 5,
  };
}
export function connectionChanges(previous: ConnectionState[] | undefined, current: ConnectionState[]) {
  const before = new Map(previous?.map((row) => [row.id, row]));
  const offline = current
    .filter((row) => {
      const old = before.get(row.id);
      return old?.boxId === row.boxId && old.active === "S" && row.active === "S" && old.online === "S" && row.online === "N";
    })
    .map(({ id, boxId }) => ({ id, boxId }));
  const updated = current.filter((row) => {
    const old = before.get(row.id);
    return (
      !old ||
      old.boxId !== row.boxId ||
      old.active !== row.active ||
      old.online !== row.online ||
      old.port !== row.port ||
      old.ip !== row.ip
    );
  });
  const changed = previous !== undefined && (previous.length !== current.length || updated.length > 0);
  return {
    changed,
    offline: offline.slice(0, 20),
    offlineCount: offline.length,
    connections: previous ? updated.slice(0, 500) : current.slice(0, 500),
    truncated: previous !== undefined && updated.length > 500,
  };
}
interface Peer {
  socket: WebSocket;
  token: string;
  userId?: number;
  channel?: Channel;
  initialized: boolean;
  alive: boolean;
  controller: AbortController;
  deadline: ReturnType<typeof setTimeout>;
}
interface Channel {
  key: string;
  scope: ConnectionScope;
  peers: Set<Peer>;
  previous?: ConnectionState[];
  checkedAt?: string;
  timer?: ReturnType<typeof setTimeout>;
  controller: AbortController;
  busy: boolean;
}

/** Ephemeral observation only: no Redis, business writes or stored history. */
export class NetworkMonitor {
  private peers = new Set<Peer>();
  private channels = new Map<string, Channel>();
  private heartbeat: ReturnType<typeof setInterval>;
  constructor(
    private db: Pick<IxcReadDatabase, "withSnapshot">,
    private authorize: (token: string, scope: ConnectionScope) => Promise<{ id: number }>,
    private intervalMs = 1000
  ) {
    this.heartbeat = setInterval(() => {
      for (const peer of this.peers) {
        if (!peer.alive) peer.socket.terminate();
        else {
          peer.alive = false;
          peer.socket.ping();
        }
      }
    }, 30_000);
    this.heartbeat.unref();
  }
  attach(socket: WebSocket) {
    if (this.peers.size >= 100) {
      socket.close(4429, "Monitor ocupado");
      return;
    }
    const peer: Peer = {
      socket,
      token: "",
      initialized: false,
      alive: true,
      controller: new AbortController(),
      deadline: setTimeout(() => socket.close(4401, "Autenticação necessária"), 5000),
    };
    peer.deadline.unref();
    this.peers.add(peer);
    socket.on("pong", () => {
      peer.alive = true;
    });
    socket.on("error", () => this.detach(peer));
    socket.on("close", () => this.detach(peer));
    // Install listeners synchronously before doing asynchronous authorization.
    let authenticating = false;
    socket.on("message", (raw, binary) => {
      if (binary || authenticating || peer.userId) {
        socket.close(4400, "Mensagem inválida");
        return;
      }
      authenticating = true;
      void this.subscribe(peer, raw.toString());
    });
  }
  private async subscribe(peer: Peer, raw: string) {
    try {
      const input = connectionSubscription.parse(JSON.parse(raw));
      const scope = subscriptionScope(input);
      peer.token = input.token;
      const user = await this.authorize(peer.token, scope);
      if (peer.socket.readyState !== 1 || peer.controller.signal.aborted) return;
      if ([...this.peers].filter((p) => p.userId === user.id).length >= 4) {
        peer.socket.close(4429, "Limite de monitores por usuário");
        return;
      }
      peer.userId = user.id;
      clearTimeout(peer.deadline);
      const key = JSON.stringify(scope);
      let channel = this.channels.get(key);
      if (!channel) {
        channel = { key, scope, peers: new Set(), controller: new AbortController(), busy: false };
        this.channels.set(key, channel);
      }
      channel.peers.add(peer);
      peer.channel = channel;
      if (channel.checkedAt) {
        this.send(peer, {
          type: "state",
          checkedAt: channel.checkedAt,
          changed: false,
          offline: [],
          offlineCount: 0,
          connections: channel.previous?.slice(0, 500) ?? [],
          snapshot: true,
        });
        peer.initialized = true;
      }
      if (!channel.busy && !channel.timer) void this.poll(channel);
    } catch (error) {
      this.reject(peer, error);
    }
  }
  private reject(peer: Peer, error: unknown) {
    const status = (error as { statusCode?: number })?.statusCode;
    peer.socket.close(
      status === 403 ? 4403 : status === 401 ? 4401 : error instanceof z.ZodError || error instanceof SyntaxError ? 4400 : 1011,
      status === 403
        ? "Sem permissão para acompanhar a rede"
        : status === 401
          ? "Autenticação necessária"
          : "Não foi possível iniciar o monitor"
    );
  }
  private send(peer: Peer, message: object) {
    if (peer.socket.readyState !== 1) return;
    if (peer.socket.bufferedAmount > 64 * 1024) {
      peer.socket.terminate();
      return;
    }
    peer.socket.send(JSON.stringify(message));
  }
  private async poll(channel: Channel) {
    if (channel.busy || !channel.peers.size || channel.controller.signal.aborted) return;
    channel.busy = true;
    try {
      // Reload session and profile permissions on every tick; an open socket
      // must not retain access after logout, expiry or a permission revocation.
      await Promise.all(
        [...channel.peers].map(async (peer) => {
          try {
            await this.authorize(peer.token, channel.scope);
          } catch (error) {
            this.reject(peer, error);
            this.detach(peer);
          }
        })
      );
      if (!channel.peers.size || channel.controller.signal.aborted) return;
      const rows = await this.db.withSnapshot(
        (session) => session.select<ConnectionState>(connectionMonitorSql(channel.scope)),
        channel.controller.signal
      );
      if (rows.length > 5000) throw new Error("Escopo excessivo");
      // MySQL numeric strings and SQLite test numbers share one representation.
      const current = rows.map((row) => ({
        ...row,
        id: Number(row.id),
        boxId: Number(row.boxId),
        port: row.port == null ? null : Number(row.port),
        ip: connectionIp(row.ip),
        online: connectionIp(row.ip) ? "S" : "N",
      }));
      const delta = connectionChanges(channel.previous, current);
      channel.previous = current;
      channel.checkedAt = new Date().toISOString();
      for (const peer of channel.peers) {
        this.send(peer, {
          type: "state",
          checkedAt: channel.checkedAt,
          ...delta,
          ...(peer.initialized ? {} : { changed: false, offline: [], offlineCount: 0, connections: current.slice(0, 500), snapshot: true }),
        });
        peer.initialized = true;
      }
    } catch {
      // Keep the last successful baseline during outages. Recovery should not
      // create fictitious disconnect events or expose SQL/credential errors.
      for (const peer of channel.peers)
        this.send(peer, { type: "unavailable", message: "Monitor temporariamente indisponível. Tentando novamente." });
    } finally {
      channel.busy = false;
      if (channel.peers.size && !channel.controller.signal.aborted) {
        channel.timer = setTimeout(() => {
          channel.timer = undefined;
          void this.poll(channel);
        }, this.intervalMs);
        channel.timer.unref();
      }
    }
  }
  private detach(peer: Peer) {
    clearTimeout(peer.deadline);
    peer.token = "";
    peer.controller.abort();
    this.peers.delete(peer);
    const channel = peer.channel;
    if (!channel) return;
    channel.peers.delete(peer);
    if (!channel.peers.size) {
      clearTimeout(channel.timer);
      channel.controller.abort();
      channel.previous = undefined;
      this.channels.delete(channel.key);
    }
  }
  close() {
    clearInterval(this.heartbeat);
    for (const peer of [...this.peers]) {
      peer.socket.terminate();
      this.detach(peer);
    }
  }
}
