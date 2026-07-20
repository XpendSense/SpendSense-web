import type { Category, ExpenseAllocation, FixedExpense, Transaction } from '@/gen/wellspent/v1/budget_pb'

export function parseMoney(units: bigint, nanos: number): number {
  return Number(units) + nanos / 1e9
}

export interface ActualTotals {
  byCat: Map<number, number>
  byPersonCat: Map<string, number>
  uncategorized: number
}

// Sums each transaction's actual amount by category (and by person+category).
// Fixed transactions only contribute once marked paid; variable always count.
// A transaction with no category can't be attributed to any category's plan,
// but it's still real, fully-unplanned spend — tracked separately so it isn't
// silently dropped from the plan summary's total.
export function computeActualTotals(transactions: Transaction[], pmPersonMap: Map<string, bigint>): ActualTotals {
  const byCat = new Map<number, number>()
  const byPersonCat = new Map<string, number>()
  let uncategorized = 0
  for (const tx of transactions) {
    if (tx.transactionTypeId === 1 && !tx.isPaid) continue
    const amt = parseMoney(tx.amount?.units ?? 0n, tx.amount?.nanos ?? 0)
    if (!tx.categoryId) {
      uncategorized += amt
      continue
    }
    byCat.set(tx.categoryId, (byCat.get(tx.categoryId) ?? 0) + amt)
    const personId = tx.paymentMethodId ? pmPersonMap.get(tx.paymentMethodId) : undefined
    if (personId !== undefined) {
      const key = `${tx.categoryId}:${personId}`
      byPersonCat.set(key, (byPersonCat.get(key) ?? 0) + amt)
    }
  }
  return { byCat, byPersonCat, uncategorized }
}

export function moneyToProto(amount: number): { units: bigint; nanos: number } {
  const units = BigInt(Math.trunc(amount))
  const nanos = Math.round((amount - Number(units)) * 1e9)
  return { units, nanos }
}

function actualColor(actual: number, plannedTotal: number): string | undefined {
  if (plannedTotal <= 0) return undefined
  const ratio = actual / plannedTotal
  if (ratio > 1) return 'error.main'
  if (ratio >= 1) return 'success.main'
  if (ratio >= 0.9) return 'warning.main'
  return 'success.main'
}

export function spentColor(spent: number, planned: number): string {
  if (planned <= 0) return 'success.main'
  const pct = (spent / planned) * 100
  if (pct >= 90) return 'error.main'
  if (pct >= 75) return '#f59e0b'
  if (pct >= 50) return '#eab308'
  return 'success.main'
}

// Savings rows use inverted thresholds: more saved = greener
function savingsActualColor(actual: number, plannedTotal: number): string | undefined {
  if (plannedTotal <= 0) return undefined
  const ratio = actual / plannedTotal
  if (ratio >= 0.9) return 'success.main'
  if (ratio >= 0.7) return '#eab308'
  if (ratio >= 0.5) return 'warning.main'
  return 'error.main'
}

export interface NotDueInfo {
  amount: number
  nextDue: Date | undefined
  fixedExpense: FixedExpense
}

export interface CategoryRowContext {
  people: { id: bigint }[]
  savingsCat: Category | undefined
  savingsTotal: number
  notDueFixedByCat: Map<number, NotDueInfo>
  catIdsWithAllocs: Set<number>
  fixedPlannedByCat: Map<number, number>
  allocMap: Map<string, ExpenseAllocation>
  txnActualByCat: Map<number, number>
}

export interface CategoryRowData {
  isSavings: boolean
  notDueInfo: NotDueInfo | undefined
  isNotDue: boolean
  isFixedOnly: boolean
  actual: number
  plannedTotal: number
  colorFn: (actual: number, plannedTotal: number) => string | undefined
  color: string | undefined
}

// Shared derivation used by both the mobile card list and the desktop table
// so the two layouts can never drift on what counts as "not due", "fixed
// only", or which color a category's actual-vs-planned ratio renders as.
export function computeCategoryRow(cat: Category, ctx: CategoryRowContext): CategoryRowData {
  const isSavings = ctx.savingsCat?.id === cat.id
  const notDueInfo = isSavings ? undefined : ctx.notDueFixedByCat.get(cat.id)
  const isNotDue = !isSavings && !!notDueInfo
  const isFixedOnly = !isSavings && !ctx.catIdsWithAllocs.has(cat.id) && (ctx.fixedPlannedByCat.has(cat.id) || isNotDue)
  const actual = ctx.txnActualByCat.get(cat.id) ?? 0

  let plannedTotal = 0
  if (isSavings) {
    plannedTotal = ctx.savingsTotal
  } else if (isNotDue && notDueInfo) {
    plannedTotal = notDueInfo.amount
  } else {
    for (const p of ctx.people) {
      const alloc = ctx.allocMap.get(`${cat.id}:${p.id}`)
      if (alloc) plannedTotal += parseMoney(alloc.plannedAmount?.units ?? 0n, alloc.plannedAmount?.nanos ?? 0)
    }
    if (plannedTotal === 0) plannedTotal = ctx.fixedPlannedByCat.get(cat.id) ?? 0
  }

  const colorFn = isSavings ? savingsActualColor : actualColor
  const color = isNotDue ? undefined : colorFn(actual, plannedTotal)

  return { isSavings, notDueInfo, isNotDue, isFixedOnly, actual, plannedTotal, colorFn, color }
}
