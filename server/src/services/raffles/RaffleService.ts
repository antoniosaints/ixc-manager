import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { RaffleStore, type RaffleStorage } from "./RaffleStore.js";
import { RaffleParticipants } from "./RaffleParticipants.js";
import { raffleConfig, raffleAdmin, rafflePresentation, remainingParticipants, raffleError, type RaffleState } from "./raffleModel.js";

export const publicTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export class RaffleService {
  constructor(
    readonly store: RaffleStorage = new RaffleStore(),
    readonly participants = new RaffleParticipants(),
    private readonly now = () => Date.now(),
    private readonly pick = randomInt
  ) {}
  async close() {
    await this.participants.close();
  }
  private changed(s: RaffleState) {
    s.revision++;
    s.updatedAt = new Date(this.now()).toISOString();
  }
  private finish(s: RaffleState) {
    if (s.pending && Date.parse(s.pending.endsAt) <= this.now()) {
      s.results.push(s.pending.result);
      s.pending = null;
      this.changed(s);
    }
  }
  async get(id: string) {
    const s = await this.store.read(id);
    if (s.pending && Date.parse(s.pending.endsAt) <= this.now()) return this.store.mutate(id, (state) => this.finish(state));
    return s;
  }
  admin(s: RaffleState) {
    return raffleAdmin(s, this.now());
  }
  presentation(s: RaffleState) {
    return rafflePresentation(s, this.now());
  }
  async create(input: unknown, userId: number, signal?: AbortSignal) {
    const config = raffleConfig.parse(input),
      pool = await this.participants.list(config.filters, true, signal);
    if (!pool.total) throw raffleError("Nenhum contrato atende aos filtros.", 422);
    const capacity = config.oncePerCustomer ? new Set(pool.items.map((p) => p.customerId)).size : pool.total;
    if (capacity < config.prizes.length) throw raffleError("Há menos participantes que prêmios. Ajuste os filtros ou os prêmios.", 422);
    const timestamp = new Date(this.now()).toISOString();
    const state: RaffleState = {
      id: randomUUID(),
      config,
      participants: pool.items,
      results: [],
      pending: null,
      publicHash: null,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: userId,
    };
    await this.store.create(state);
    return this.admin(state);
  }
  async draw(id: string, requestId: string, userId: number) {
    const s = await this.store.mutate(id, (state) => {
      this.finish(state);
      if (state.results.some((r) => r.requestId === requestId) || state.pending?.result.requestId === requestId) return;
      if (state.pending) throw raffleError("Aguarde o fim da contagem atual.");
      if (state.results.length >= state.config.prizes.length) throw raffleError("Todos os prêmios já foram sorteados.");
      const pool = remainingParticipants(state);
      if (!pool.length) throw raffleError("Não há contratos disponíveis para outra rodada.");
      const endsAt = new Date(this.now() + 3000).toISOString(),
        order = state.results.length + 1;
      state.pending = {
        endsAt,
        result: {
          ...pool[this.pick(pool.length)]!,
          order,
          prize: state.config.prizes[order - 1]!,
          drawnAt: endsAt,
          requestId,
          drawnBy: userId,
        },
      };
      this.changed(state);
    });
    return this.admin(s);
  }
  async update(id: string, input: unknown) {
    const config = raffleConfig.parse(input);
    const s = await this.store.mutate(id, (state) => {
      this.finish(state);
      if (state.pending || state.results.length)
        throw raffleError("A configuração está congelada após o início. Crie um novo sorteio para mudar as regras.");
      if (
        JSON.stringify(config.filters) !== JSON.stringify(state.config.filters) ||
        config.oncePerCustomer !== state.config.oncePerCustomer
      )
        throw raffleError("Para mudar participantes ou regras, prepare um novo sorteio.");
      const capacity = config.oncePerCustomer ? new Set(state.participants.map((p) => p.customerId)).size : state.participants.length;
      if (config.prizes.length > capacity) throw raffleError("Há menos participantes que prêmios.", 422);
      state.config = config;
      this.changed(state);
    });
    return this.admin(s);
  }
  async share(id: string, enabled: boolean) {
    const token = enabled ? randomBytes(32).toString("base64url") : null;
    const s = await this.store.mutate(id, (state) => {
      state.publicHash = token ? publicTokenHash(token) : null;
      this.changed(state);
    });
    return { raffle: this.admin(s), token };
  }
  async public(token: string) {
    const hash = publicTokenHash(token),
      id = await this.store.publicId(hash),
      state = await this.get(id);
    if (state.publicHash !== hash) throw raffleError("Link indisponível ou revogado.", 404);
    return { state, view: this.presentation(state) };
  }
}
