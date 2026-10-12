import { describe, expect, it } from 'vitest'
import {
  INCENSE_WEIGHT_SCALE,
  canonicalModelId,
  incenseWeightBpsForModel,
  scaleTokensByWeightBps,
  DEFAULT_INCENSE_WEIGHT_POLICY,
  parseIncenseWeightPolicy,
  incenseWeightRows,
} from '../src/domain/incense-weight.ts'
import { creditObservedUsage, EMPTY_DAILY_USAGE } from '../src/host/usage-ledger.ts'
import { readSessionModelId } from '../src/compat/dsh/session-route.ts'
import { createBackendFixture } from './helpers/backend.ts'
import { parseV1Bootstrap } from '../src/shared/backend-v1.ts'

describe('canonicalModelId', () => {
  it('strips a context-window suffix', () => {
    expect(canonicalModelId('deepseek-v4-pro[1m]')).toBe('deepseek-v4-pro')
  })
})

describe('optional bootstrap model rules', () => {
  it('keeps a usable bootstrap when optional rules are malformed, and accepts an old backend without them', () => {
    const f = createBackendFixture()
    try {
      const bootstrap = f.service.bootstrap('model-rules-parse-install')
      const invalid = parseV1Bootstrap({ ...bootstrap, token_policy: { ...bootstrap.token_policy, model_weights: { revision: 99, rules: 'bad' } } })
      expect(invalid.token_policy.model_weights_invalid).toBe(true)
      expect(invalid.authoritative_personal_state).toEqual(bootstrap.authoritative_personal_state)
      const { model_weights: _weights, ...oldTokenPolicy } = bootstrap.token_policy
      expect(parseV1Bootstrap({ ...bootstrap, token_policy: oldTokenPolicy }).token_policy.model_weights).toBeUndefined()
    } finally { f.close() }
  })
})

describe('incenseWeightBpsForModel', () => {
  it('recognizes future numbered Pro/Flash and the rolling Flash alias without client edits', () => {
    for (const model of ['deepseek-v4.2-pro', 'deepseek-v5-pro', 'deepseek-v4.2-flash', 'deepseek-v5-flash', 'deepseek-flash', ' DEEPSEEK-FLASH[1m] ']) {
      expect(incenseWeightBpsForModel(model)).toBe(INCENSE_WEIGHT_SCALE)
    }
    expect(incenseWeightBpsForModel('another-provider-pro')).toBe(5_000)
    expect(incenseWeightBpsForModel('prefix-deepseek-v5-pro')).toBe(5_000)
  })

  it('maps official old Flash names to the new model, while real old third-party models stay half-rate', () => {
    for (const model of ['deepseek-v4-flash', 'deepseek-v4-flash-vision-exp']) {
      expect(incenseWeightBpsForModel(model, DEFAULT_INCENSE_WEIGHT_POLICY, 'deepseek-official')).toBe(10_000)
      expect(incenseWeightBpsForModel(model, DEFAULT_INCENSE_WEIGHT_POLICY, 'third-party')).toBe(5_000)
    }
  })

  it('uses an operator-supplied exact override and derives its display from the same data', () => {
    const policy = parseIncenseWeightPolicy({
      ...DEFAULT_INCENSE_WEIGHT_POLICY, revision: 4, version: 'test-v4',
      rules: [{ label: '新的别名', model: 'future-new-name', weightBps: 10_000 }, ...DEFAULT_INCENSE_WEIGHT_POLICY.rules],
    })
    expect(incenseWeightBpsForModel('future-new-name', policy)).toBe(10_000)
    expect(incenseWeightRows(policy, 60_000)).toContainEqual({ model: '新的别名', weight: '×1', stick: '60,000 Token = 1 炷' })
    expect(() => parseIncenseWeightPolicy({ ...policy, rules: [{ label: 'bad', model: '^(.+)+$', weightBps: 10_000 }] })).toThrow()
    expect(() => parseIncenseWeightPolicy({ ...policy, fallbackWeightBps: 20_000 })).toThrow()
  })
  it('rates Pro at 1 and Flash at 0.5', () => {
    expect(incenseWeightBpsForModel('deepseek-v4-pro')).toBe(INCENSE_WEIGHT_SCALE)
    expect(incenseWeightBpsForModel('deepseek-v4-flash')).toBe(INCENSE_WEIGHT_SCALE / 2)
    expect(incenseWeightBpsForModel('deepseek-v4-pro[1m]')).toBe(INCENSE_WEIGHT_SCALE)
  })

  it('rates missing, unknown, and every other non-Pro id like Flash', () => {
    expect(incenseWeightBpsForModel(null)).toBe(INCENSE_WEIGHT_SCALE / 2)
    expect(incenseWeightBpsForModel(undefined)).toBe(INCENSE_WEIGHT_SCALE / 2)
    expect(incenseWeightBpsForModel('deepseek-chat')).toBe(INCENSE_WEIGHT_SCALE / 2)
    expect(incenseWeightBpsForModel('some-future-model')).toBe(INCENSE_WEIGHT_SCALE / 2)
  })
})

describe('scaleTokensByWeightBps', () => {
  it('keeps safe-integer boundary arithmetic exact without multiplying the entire count', () => {
    expect(scaleTokensByWeightBps(Number.MAX_SAFE_INTEGER, 10_000, 0)).toEqual({ scaled: Number.MAX_SAFE_INTEGER, carry: 0 })
    expect(scaleTokensByWeightBps(Number.MAX_SAFE_INTEGER, 5_000, 0)).toEqual({ scaled: Math.floor(Number.MAX_SAFE_INTEGER / 2), carry: 5_000 })
  })
  it('carries Flash fractions so 1+1 raw tokens become 1 equivalent', () => {
    const first = scaleTokensByWeightBps(1, INCENSE_WEIGHT_SCALE / 2, 0)
    expect(first.scaled).toBe(0)
    expect(first.carry).toBe(5_000)
    const second = scaleTokensByWeightBps(1, INCENSE_WEIGHT_SCALE / 2, first.carry)
    expect(second.scaled).toBe(1)
    expect(second.carry).toBe(0)
  })
})

describe('creditObservedUsage', () => {
  it('halves Flash deltas and leaves Pro unchanged', () => {
    const flash = creditObservedUsage(EMPTY_DAILY_USAGE, 100_000, 0, 'deepseek-v4-flash', 1)
    expect(flash.inputTokens + flash.outputTokens).toBe(50_000)
    const pro = creditObservedUsage(EMPTY_DAILY_USAGE, 50_000, 0, 'deepseek-v4-pro', 1)
    expect(pro.inputTokens + pro.outputTokens).toBe(50_000)
  })

  it('halves unknown-model and missing-route deltas', () => {
    const unknown = creditObservedUsage(EMPTY_DAILY_USAGE, 100_000, 0, 'some-future-model', 1)
    expect(unknown.inputTokens + unknown.outputTokens).toBe(50_000)
    const missing = creditObservedUsage(EMPTY_DAILY_USAGE, 100_000, 0, null, 1)
    expect(missing.inputTokens + missing.outputTokens).toBe(50_000)
  })
})

describe('readSessionModelId', () => {
  it('prefers requestHeader.config.model', () => {
    const id = readSessionModelId({
      id: 's1',
      firstLiveSeq: 0,
      requestHeader: () => ({ config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } }),
    })
    expect(id).toBe('deepseek-v4-flash')
  })

  it('falls back to requestContext.model', () => {
    const id = readSessionModelId({
      id: 's1',
      firstLiveSeq: 0,
      requestContext: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-pro' }),
    })
    expect(id).toBe('deepseek-v4-pro')
  })

  it('returns null when the stub has no route', () => {
    expect(readSessionModelId({ id: 's1', firstLiveSeq: 0 })).toBeNull()
  })
})
