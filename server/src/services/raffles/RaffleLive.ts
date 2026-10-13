import type { WebSocket } from "ws";
import type { RaffleState } from "./raffleModel.js";
import type { RaffleService } from "./RaffleService.js";

interface Subscriber {
  socket: WebSocket;
  authorize: (s: RaffleState) => Promise<boolean>;
  admin: boolean;
  revision: number;
  lastSent: number;
}
interface Room {
  members: Set<Subscriber>;
  timer: ReturnType<typeof setInterval>;
  busy: boolean;
  state?: RaffleState;
}
/** Database-backed rooms also observe changes made by another server process. */
export class RaffleLive {
  private rooms = new Map<string, Room>();
  private count = 0;
  constructor(private readonly service: RaffleService) {}
  attach(id: string, socket: WebSocket, authorize: Subscriber["authorize"], admin: boolean) {
    if (this.count >= 200 || (this.rooms.get(id)?.members.size ?? 0) >= 100) {
      socket.close(1013, "Limite de espectadores");
      return;
    }
    let room = this.rooms.get(id);
    if (!room) {
      room = {
        members: new Set(),
        timer: setInterval(() => {
          void this.publish(id);
        }, 500),
        busy: false,
      };
      room.timer.unref();
      this.rooms.set(id, room);
    }
    const member = { socket, authorize, admin, revision: -1, lastSent: 0 };
    room.members.add(member);
    this.count++;
    socket.on("error", () => socket.close());
    socket.on("message", () => {
      /* This connection is read-only. Commands use authenticated HTTP endpoints. */
    });
    socket.once("close", () => {
      if (room!.members.delete(member)) this.count = Math.max(0, this.count - 1);
      if (!room!.members.size) {
        clearInterval(room!.timer);
        this.rooms.delete(id);
      }
    });
    void this.publish(id);
  }
  private async publish(id: string) {
    const room = this.rooms.get(id);
    if (!room || room.busy) return;
    room.busy = true;
    try {
      const cached = room.state;
      const state =
        !cached ||
        (cached.pending && Date.parse(cached.pending.endsAt) <= Date.now()) ||
        (await this.service.store.revision(id)) !== cached.revision
          ? await this.service.get(id)
          : cached;
      room.state = state;
      for (const member of room.members) {
        if (member.socket.readyState !== 1) continue;
        if (!(await member.authorize(state))) {
          member.socket.send(JSON.stringify({ type: "unavailable" }));
          member.socket.close(1008, "Acesso revogado");
          continue;
        }
        if (member.socket.bufferedAmount > 1024 * 1024) {
          member.socket.close(1013, "Conexão lenta");
          continue;
        }
        if (member.revision === state.revision) {
          if (Date.now() - member.lastSent >= 15000) {
            member.socket.send(JSON.stringify({ type: "heartbeat" }));
            member.lastSent = Date.now();
          }
          continue;
        }
        member.socket.send(
          JSON.stringify({ type: "state", raffle: member.admin ? this.service.admin(state) : this.service.presentation(state) })
        );
        member.revision = state.revision;
        member.lastSent = Date.now();
      }
    } catch {
      for (const member of room.members) {
        member.revision = -1;
        if (member.socket.readyState === 1)
          member.socket.send(JSON.stringify({ type: "error", message: "Atualização temporariamente indisponível." }));
      }
    } finally {
      room.busy = false;
    }
  }
  close() {
    for (const room of this.rooms.values()) {
      clearInterval(room.timer);
      for (const { socket } of room.members) socket.close(1001, "Servidor reiniciando");
    }
    this.rooms.clear();
    this.count = 0;
  }
}
