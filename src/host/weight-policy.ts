import {
  DEFAULT_INCENSE_WEIGHT_POLICY,
  LEGACY_INCENSE_WEIGHT_POLICY,
  parseIncenseWeightPolicy,
  type IncenseWeightPolicy,
} from '../domain/index.ts'

/** Last-known-good data, shared by computation and presentation. */
export class WeightPolicyCatalog {
  private policies: IncenseWeightPolicy[] = [LEGACY_INCENSE_WEIGHT_POLICY, DEFAULT_INCENSE_WEIGHT_POLICY].map(parseIncenseWeightPolicy)
  private persist: ((policies: readonly IncenseWeightPolicy[]) => void) | undefined

  constructor(private readonly today: () => string = () => new Date().toISOString().slice(0, 10)) {}

  hydrate(policies: readonly IncenseWeightPolicy[] = [], persist?: (policies: readonly IncenseWeightPolicy[]) => void): void {
    this.persist = undefined
    for (const policy of [...policies].sort((a, b) => a.revision - b.revision)) this.remember(parseIncenseWeightPolicy(policy), true)
    this.persist = persist
  }

  adopt(raw: unknown): boolean {
    return this.remember(parseIncenseWeightPolicy(raw), false)
  }

  private remember(policy: IncenseWeightPolicy, restore: boolean): boolean {
    const existing = this.policies.find(item => item.revision === policy.revision)
    if (existing !== undefined) {
      if (JSON.stringify(existing) !== JSON.stringify(policy)) throw new Error('weight policy revision cannot be reused')
      return false
    }
    if (!restore && policy.revision < Math.max(...this.policies.map(item => item.revision))) return false
    this.policies.push(policy)
    const active = this.forDate(this.today())
    this.policies = this.policies.sort((a, b) => b.revision - a.revision).slice(0, 30)
    if (!this.policies.some(item => item.revision === active.revision)) this.policies.push(active)
    if (!this.policies.some(item => item.revision === 2)) this.policies.push(LEGACY_INCENSE_WEIGHT_POLICY)
    this.persist?.(this.policies)
    return true
  }

  forDate(businessDate: string): IncenseWeightPolicy {
    return this.policies.filter(policy => policy.effectiveFrom <= businessDate)
      .sort((left, right) => right.revision - left.revision)[0] ?? LEGACY_INCENSE_WEIGHT_POLICY
  }
}
