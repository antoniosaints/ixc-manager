import { RetentionRepository } from "../../repositories/RetentionRepository.js";
import { RetentionRiskEngine } from "./RetentionRiskEngine.js";

export class RetentionScoreService {
  constructor(
    private readonly repository = new RetentionRepository(),
    private readonly engine = new RetentionRiskEngine()
  ) {}
  async recalculate(customerId?: number): Promise<{ calculated: number }> {
    const contracts = await this.repository.activeContracts(customerId);
    let calculated = 0;
    for (const contract of contracts) {
      const context = await this.repository.buildRiskContext(contract.customerId, contract.contractId);
      if (!context) continue;
      await this.repository.saveScore(contract.customerId, contract.contractId, this.engine.calculate(context));
      calculated++;
    }
    return { calculated };
  }
  async recalculateMany(customerIds: number[]): Promise<{ calculated: number }> {
    const uniqueCustomerIds = [...new Set(customerIds)];
    let calculated = 0;
    let next = 0;
    // The pool has ten MySQL connections. Four concurrent calculations make a
    // first load materially faster while keeping capacity for the sync writer.
    await Promise.all(
      Array.from({ length: Math.min(4, uniqueCustomerIds.length) }, async () => {
        for (;;) {
          const customerId = uniqueCustomerIds[next++];
          if (customerId === undefined) return;
          const result = await this.recalculate(customerId);
          calculated += result.calculated;
        }
      })
    );
    return { calculated };
  }
}
