import { computeActualTotals } from '../helpers'
import type { Transaction } from '@/gen/wellspent/v1/budget_pb'

function money(units: bigint): { units: bigint; nanos: number } {
  return { units, nanos: 0 }
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    name: 'Groceries',
    amount: money(50n),
    plannedAmount: money(50n),
    date: { seconds: 0n, nanos: 0 },
    renewalDate: { seconds: 0n, nanos: 0 },
    recurring: false,
    budgetPeriodId: 'period-1',
    categoryId: 1,
    paymentMethodId: 'pm-1',
    transactionFrequencyId: 1,
    transactionTypeId: 2,
    isPaid: false,
    paidAt: { seconds: 0n, nanos: 0 },
    fixedExpenseId: '',
    isExcluded: false,
    ...overrides,
  } as Transaction
}

describe('computeActualTotals', () => {
  const pmPersonMap = new Map([['pm-1', 5n]])

  it('sums actual by category', () => {
    const txs = [makeTransaction({ categoryId: 1, amount: money(50n) }), makeTransaction({ categoryId: 1, amount: money(20n) })]
    const { byCat } = computeActualTotals(txs, pmPersonMap)
    expect(byCat.get(1)).toBe(70)
  })

  it('sums actual by person and category', () => {
    const txs = [makeTransaction({ categoryId: 1, paymentMethodId: 'pm-1', amount: money(50n) })]
    const { byPersonCat } = computeActualTotals(txs, pmPersonMap)
    expect(byPersonCat.get('1:5')).toBe(50)
  })

  it('tracks uncategorized transactions separately instead of dropping them', () => {
    const txs = [makeTransaction({ categoryId: 0, amount: money(30n) })]
    const { byCat, uncategorized } = computeActualTotals(txs, pmPersonMap)
    expect(byCat.size).toBe(0)
    expect(uncategorized).toBe(30)
  })

  it('sums multiple uncategorized transactions, including negative (received) amounts', () => {
    const txs = [
      makeTransaction({ categoryId: 0, amount: money(30n) }),
      makeTransaction({ categoryId: 0, amount: money(-10n) }),
    ]
    const { uncategorized } = computeActualTotals(txs, pmPersonMap)
    expect(uncategorized).toBe(20)
  })

  it('excludes unpaid fixed transactions', () => {
    const txs = [makeTransaction({ categoryId: 1, transactionTypeId: 1, isPaid: false, amount: money(50n) })]
    const { byCat } = computeActualTotals(txs, pmPersonMap)
    expect(byCat.has(1)).toBe(false)
  })

  it('includes paid fixed transactions', () => {
    const txs = [makeTransaction({ categoryId: 1, transactionTypeId: 1, isPaid: true, amount: money(50n) })]
    const { byCat } = computeActualTotals(txs, pmPersonMap)
    expect(byCat.get(1)).toBe(50)
  })

  it('excludes an unpaid, uncategorized fixed transaction from both totals', () => {
    const txs = [makeTransaction({ categoryId: 0, transactionTypeId: 1, isPaid: false, amount: money(50n) })]
    const { uncategorized } = computeActualTotals(txs, pmPersonMap)
    expect(uncategorized).toBe(0)
  })

  it('returns empty totals for no transactions', () => {
    const { byCat, byPersonCat, uncategorized } = computeActualTotals([], pmPersonMap)
    expect(byCat.size).toBe(0)
    expect(byPersonCat.size).toBe(0)
    expect(uncategorized).toBe(0)
  })
})
