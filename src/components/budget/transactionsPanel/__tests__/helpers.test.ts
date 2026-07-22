import {
  resolveCategoryName,
  resolveMethodName,
  resolveOwnerName,
  matchesSearch,
  compareTransactions,
  groupTransactionsByDay,
  isTransactionExcluded,
  resolveSwipeDirection,
  buildPendingReviewMatchMap,
  computeOverBudgetTxIds,
} from '../helpers'
import type { Transaction, Category, PaymentMethod, BudgetPerson, TransactionReview, FixedExpense, ExpenseAllocation } from '@/gen/wellspent/v1/budget_pb'

function money(units: bigint): { units: bigint; nanos: number } {
  return { units, nanos: 0 }
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    name: 'Groceries',
    amount: money(0n),
    plannedAmount: money(100n),
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

function makeAllocation(overrides: Partial<ExpenseAllocation> = {}): ExpenseAllocation {
  return {
    id: 1n,
    budgetProfileId: 'profile-1',
    categoryId: 1,
    budgetPersonId: 0n,
    plannedAmount: money(100n),
    ...overrides,
  } as ExpenseAllocation
}

function makeFixedExpense(overrides: Partial<FixedExpense> = {}): FixedExpense {
  return {
    id: 'fe-1',
    budgetProfileId: 'profile-1',
    name: 'Rent',
    plannedAmount: money(0n),
    categoryId: 0,
    paymentMethodId: '',
    dayOfMonth: 1,
    isActive: true,
    ...overrides,
  } as FixedExpense
}

const category: Category = { id: 1, name: 'Food', typeId: 1, isSystem: false, color: '' }
const method: PaymentMethod = { id: 'pm-1', name: 'Chase Visa', type: 2, budgetPersonId: 5n, color: '' }
const person: BudgetPerson = { id: 5n, userName: 'Alex', color: '' }

const categoryMap = new Map([[category.id, category]])
const methodMap = new Map([[method.id, method]])
const personMap = new Map([[person.id.toString(), person]])

describe('resolveCategoryName', () => {
  it('returns the category name when set', () => {
    expect(resolveCategoryName(1, categoryMap)).toBe('Food')
  })

  it('returns empty string when categoryId is 0 (unset)', () => {
    expect(resolveCategoryName(0, categoryMap)).toBe('')
  })

  it('returns empty string when the category is not found', () => {
    expect(resolveCategoryName(99, categoryMap)).toBe('')
  })
})

describe('resolveMethodName', () => {
  it('returns the payment method name when set', () => {
    expect(resolveMethodName('pm-1', methodMap)).toBe('Chase Visa')
  })

  it('returns empty string when paymentMethodId is empty', () => {
    expect(resolveMethodName('', methodMap)).toBe('')
  })
})

describe('resolveOwnerName', () => {
  it("returns the payment method's attributed person name", () => {
    expect(resolveOwnerName('pm-1', methodMap, personMap)).toBe('Alex')
  })

  it('returns empty string when the payment method has no attributed person (budgetPersonId 0)', () => {
    const unattributed: PaymentMethod = { id: 'pm-2', name: 'Cash', type: 1, budgetPersonId: 0n, color: '' }
    const map = new Map([[unattributed.id, unattributed]])
    expect(resolveOwnerName('pm-2', map, personMap)).toBe('')
  })

  it('returns empty string when paymentMethodId is empty', () => {
    expect(resolveOwnerName('', methodMap, personMap)).toBe('')
  })
})

describe('matchesSearch', () => {
  it('matches on name (case-insensitive)', () => {
    expect(matchesSearch('Groceries', 1, 'pm-1', 'grocer', categoryMap, methodMap, personMap)).toBe(true)
  })

  it('matches on category name', () => {
    expect(matchesSearch('Anything', 1, 'pm-1', 'food', categoryMap, methodMap, personMap)).toBe(true)
  })

  it('matches on owner name', () => {
    expect(matchesSearch('Anything', 1, 'pm-1', 'alex', categoryMap, methodMap, personMap)).toBe(true)
  })

  it('returns false when nothing matches', () => {
    expect(matchesSearch('Groceries', 1, 'pm-1', 'zzz', categoryMap, methodMap, personMap)).toBe(false)
  })

  it('returns true for an empty query', () => {
    expect(matchesSearch('Groceries', 1, 'pm-1', '', categoryMap, methodMap, personMap)).toBe(true)
  })
})

describe('compareTransactions', () => {
  it('sorts by name ascending', () => {
    const a = makeTransaction({ id: 'a', name: 'Zebra' })
    const b = makeTransaction({ id: 'b', name: 'Apple' })
    expect(compareTransactions(a, b, 'name', 'asc', categoryMap, methodMap, personMap)).toBeGreaterThan(0)
  })

  it('sorts by name descending', () => {
    const a = makeTransaction({ id: 'a', name: 'Zebra' })
    const b = makeTransaction({ id: 'b', name: 'Apple' })
    expect(compareTransactions(a, b, 'name', 'desc', categoryMap, methodMap, personMap)).toBeLessThan(0)
  })

  it('sorts by amount', () => {
    const a = makeTransaction({ id: 'a', plannedAmount: money(50n) })
    const b = makeTransaction({ id: 'b', plannedAmount: money(200n) })
    expect(compareTransactions(a, b, 'amount', 'asc', categoryMap, methodMap, personMap)).toBeLessThan(0)
  })

  it('sorts by resolved category name', () => {
    const foodCat: Category = { id: 1, name: 'Food', typeId: 1, isSystem: false, color: '' }
    const autoCat: Category = { id: 2, name: 'Auto', typeId: 1, isSystem: false, color: '' }
    const map = new Map([[foodCat.id, foodCat], [autoCat.id, autoCat]])
    const a = makeTransaction({ id: 'a', categoryId: 1 })
    const b = makeTransaction({ id: 'b', categoryId: 2 })
    // "Auto" < "Food" alphabetically, so b should sort before a ascending
    expect(compareTransactions(a, b, 'category', 'asc', map, methodMap, personMap)).toBeGreaterThan(0)
  })

  it('sorts by resolved owner name', () => {
    const a = makeTransaction({ id: 'a', paymentMethodId: 'pm-1' })
    const otherPerson: BudgetPerson = { id: 6n, userName: 'Blair', color: '' }
    const otherMethod: PaymentMethod = { id: 'pm-2', name: 'Debit', type: 3, budgetPersonId: 6n, color: '' }
    const map = new Map([[method.id, method], [otherMethod.id, otherMethod]])
    const pMap = new Map([[person.id.toString(), person], [otherPerson.id.toString(), otherPerson]])
    const b = makeTransaction({ id: 'b', paymentMethodId: 'pm-2' })
    // "Alex" < "Blair" alphabetically
    expect(compareTransactions(a, b, 'owner', 'asc', categoryMap, map, pMap)).toBeLessThan(0)
  })

  it('falls back to id when the primary key is equal', () => {
    const a = makeTransaction({ id: 'a', name: 'Same' })
    const b = makeTransaction({ id: 'b', name: 'Same' })
    expect(compareTransactions(a, b, 'name', 'asc', categoryMap, methodMap, personMap)).toBeLessThan(0)
  })
})

function makeReview(overrides: Partial<TransactionReview> = {}): TransactionReview {
  return {
    id: 'review-1',
    budgetPeriodId: 'period-1',
    transactionId: 'tx-1',
    matchScore: 90,
    status: 'pending',
    transactionName: 'Netflix',
    matchedTransactionId: 'tx-fixed-1',
    matchedTransactionName: 'Netflix Subscription',
    ...overrides,
  } as TransactionReview
}

describe('buildPendingReviewMatchMap', () => {
  it('maps a pending review by transaction id to its matched transaction name', () => {
    const map = buildPendingReviewMatchMap([makeReview()])
    expect(map.get('tx-1')).toBe('Netflix Subscription')
  })

  it('excludes confirmed reviews', () => {
    const map = buildPendingReviewMatchMap([makeReview({ status: 'confirmed' })])
    expect(map.has('tx-1')).toBe(false)
  })

  it('excludes dismissed reviews', () => {
    const map = buildPendingReviewMatchMap([makeReview({ status: 'dismissed' })])
    expect(map.has('tx-1')).toBe(false)
  })

  it('returns an empty map for no reviews', () => {
    expect(buildPendingReviewMatchMap([]).size).toBe(0)
  })
})

describe('isTransactionExcluded', () => {
  it('returns true when manually flagged', () => {
    const tx = makeTransaction({ isExcluded: true, categoryId: 1 })
    expect(isTransactionExcluded(tx, 99)).toBe(true)
  })

  it('returns true when the category is the Income category', () => {
    const tx = makeTransaction({ isExcluded: false, categoryId: 42 })
    expect(isTransactionExcluded(tx, 42)).toBe(true)
  })

  it('returns false when neither flagged nor Income category', () => {
    const tx = makeTransaction({ isExcluded: false, categoryId: 1 })
    expect(isTransactionExcluded(tx, 42)).toBe(false)
  })

  it('returns false when incomeCategoryId is not provided', () => {
    const tx = makeTransaction({ isExcluded: false, categoryId: 1 })
    expect(isTransactionExcluded(tx, undefined)).toBe(false)
  })
})

describe('resolveSwipeDirection', () => {
  it('returns null for a mostly-vertical scroll with incidental sideways drift', () => {
    expect(resolveSwipeDirection(40, 300)).toBeNull()
  })

  it('returns null when horizontal movement is below the threshold', () => {
    expect(resolveSwipeDirection(30, 5)).toBeNull()
  })

  it('returns null when horizontal movement does not clearly dominate vertical', () => {
    // Clears the threshold but deltaX is not >= 2x deltaY.
    expect(resolveSwipeDirection(70, 50)).toBeNull()
  })

  it('returns "right" for a clear left-to-right swipe', () => {
    expect(resolveSwipeDirection(100, 5)).toBe('right')
  })

  it('returns "left" for a clear right-to-left swipe', () => {
    expect(resolveSwipeDirection(-100, 5)).toBe('left')
  })

  it('respects a custom threshold', () => {
    expect(resolveSwipeDirection(70, 0, 100)).toBeNull()
    expect(resolveSwipeDirection(120, 0, 100)).toBe('right')
  })
})

describe('groupTransactionsByDay', () => {
  const day1 = BigInt(Date.UTC(2026, 11, 12) / 1000)
  const day2 = BigInt(Date.UTC(2026, 11, 13) / 1000)

  it('groups transactions that fall on the same day together', () => {
    const a = makeTransaction({ id: 'a', date: { seconds: day1, nanos: 0 } })
    const b = makeTransaction({ id: 'b', date: { seconds: day1, nanos: 0 } })
    const c = makeTransaction({ id: 'c', date: { seconds: day2, nanos: 0 } })
    const groups = groupTransactionsByDay([a, b, c], 'day', 'asc', categoryMap, methodMap, personMap)
    expect(groups).toHaveLength(2)
    expect(groups[0].transactions.map((t) => t.id).sort()).toEqual(['a', 'b'])
    expect(groups[1].transactions.map((t) => t.id)).toEqual(['c'])
  })

  it('orders day groups chronologically ascending', () => {
    const a = makeTransaction({ id: 'a', date: { seconds: day2, nanos: 0 } })
    const b = makeTransaction({ id: 'b', date: { seconds: day1, nanos: 0 } })
    const groups = groupTransactionsByDay([a, b], 'day', 'asc', categoryMap, methodMap, personMap)
    expect(groups.map((g) => g.day)).toEqual([Number(day1), Number(day2)])
  })

  it('orders day groups descending when sortDir is desc', () => {
    const a = makeTransaction({ id: 'a', date: { seconds: day1, nanos: 0 } })
    const b = makeTransaction({ id: 'b', date: { seconds: day2, nanos: 0 } })
    const groups = groupTransactionsByDay([a, b], 'day', 'desc', categoryMap, methodMap, personMap)
    expect(groups.map((g) => g.day)).toEqual([Number(day2), Number(day1)])
  })

  it('sorts transactions within a day group by the given sort key', () => {
    const a = makeTransaction({ id: 'a', name: 'Zebra', date: { seconds: day1, nanos: 0 } })
    const b = makeTransaction({ id: 'b', name: 'Apple', date: { seconds: day1, nanos: 0 } })
    const groups = groupTransactionsByDay([a, b], 'name', 'asc', categoryMap, methodMap, personMap)
    expect(groups).toHaveLength(1)
    expect(groups[0].transactions.map((t) => t.name)).toEqual(['Apple', 'Zebra'])
  })

  it('formats the group label as weekday + month + day', () => {
    const a = makeTransaction({ id: 'a', date: { seconds: day1, nanos: 0 } })
    const groups = groupTransactionsByDay([a], 'day', 'asc', categoryMap, methodMap, personMap)
    expect(groups[0].label).toBe('Sat, December 12')
  })

  it('returns no groups for an empty transaction list', () => {
    expect(groupTransactionsByDay([], 'day', 'asc', categoryMap, methodMap, personMap)).toEqual([])
  })
})

describe('computeOverBudgetTxIds', () => {
  const day1 = BigInt(Date.UTC(2026, 11, 1) / 1000)
  const day2 = BigInt(Date.UTC(2026, 11, 2) / 1000)
  const day3 = BigInt(Date.UTC(2026, 11, 3) / 1000)

  it('does not flag a category with no plan at all, no matter how much was spent', () => {
    // Regression: a category with zero contributing plan (no allocation, no
    // fixed expense) must never trivially "exceed" the moment any spending
    // occurs — that's indistinguishable from an uncategorized transaction.
    const tx = makeTransaction({ id: 'a', categoryId: 1, amount: money(50n), date: { seconds: day1, nanos: 0 } })
    const ids = computeOverBudgetTxIds([tx], [], [], [])
    expect(ids.size).toBe(0)
  })

  it('flags only the transactions from the point the running total first crosses the plan', () => {
    const a = makeTransaction({ id: 'a', categoryId: 1, amount: money(40n), date: { seconds: day1, nanos: 0 } })
    const b = makeTransaction({ id: 'b', categoryId: 1, amount: money(40n), date: { seconds: day2, nanos: 0 } })
    const c = makeTransaction({ id: 'c', categoryId: 1, amount: money(40n), date: { seconds: day3, nanos: 0 } })
    // plan = 100; running: a=40, b=80, c=120 -> only c crosses the line
    const ids = computeOverBudgetTxIds([a, b, c], [], [], [makeAllocation({ categoryId: 1, plannedAmount: money(100n) })])
    expect(ids).toEqual(new Set(['c']))
  })

  it('does not flag a received (negative) transaction even if it lands after the plan is crossed', () => {
    const a = makeTransaction({ id: 'a', categoryId: 1, amount: money(150n), date: { seconds: day1, nanos: 0 } })
    const b = makeTransaction({ id: 'b', categoryId: 1, amount: money(-20n), date: { seconds: day2, nanos: 0 } })
    const ids = computeOverBudgetTxIds([a, b], [], [], [makeAllocation({ categoryId: 1, plannedAmount: money(100n) })])
    expect(ids).toEqual(new Set(['a']))
  })

  it('ignores uncategorized transactions', () => {
    const tx = makeTransaction({ id: 'a', categoryId: 0, amount: money(999n), date: { seconds: day1, nanos: 0 } })
    const ids = computeOverBudgetTxIds([tx], [], [], [makeAllocation({ categoryId: 1, plannedAmount: money(1n) })])
    expect(ids.size).toBe(0)
  })

  it('ignores excluded transactions when computing the running total', () => {
    const excluded = makeTransaction({ id: 'a', categoryId: 1, amount: money(200n), isExcluded: true, date: { seconds: day1, nanos: 0 } })
    const counted = makeTransaction({ id: 'b', categoryId: 1, amount: money(50n), date: { seconds: day2, nanos: 0 } })
    const ids = computeOverBudgetTxIds([excluded, counted], [], [], [makeAllocation({ categoryId: 1, plannedAmount: money(100n) })])
    expect(ids.size).toBe(0)
  })

  it('includes an active fixed expense with no transaction yet this period in the plan', () => {
    const tx = makeTransaction({ id: 'a', categoryId: 1, amount: money(150n), date: { seconds: day1, nanos: 0 } })
    const fe = makeFixedExpense({ id: 'fe-1', categoryId: 1, isActive: true, plannedAmount: money(100n) })
    // plan = 0 (no allocation) + 100 (fixed expense) = 100; actual 150 crosses it
    const ids = computeOverBudgetTxIds([tx], [], [fe], [])
    expect(ids).toEqual(new Set(['a']))
  })

  it('adds a fixed transaction planned amount to the category plan', () => {
    const variableTx = makeTransaction({ id: 'a', categoryId: 1, amount: money(150n), transactionTypeId: 2, date: { seconds: day1, nanos: 0 } })
    const fixedTx = makeTransaction({ id: 'fixed-1', categoryId: 1, transactionTypeId: 1, plannedAmount: money(100n) })
    // plan = 100 (fixed tx planned amount); actual 150 crosses it
    const ids = computeOverBudgetTxIds([variableTx], [fixedTx], [], [])
    expect(ids).toEqual(new Set(['a']))
  })
})
