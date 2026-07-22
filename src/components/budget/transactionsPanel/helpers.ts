import type { Transaction, Category, PaymentMethod, BudgetPerson, FixedExpense, TransactionReview, ExpenseAllocation } from '@/gen/wellspent/v1/budget_pb'
import { formatMoneyFromNumber } from '@/lib/format'

export type SortKey = 'name' | 'day' | 'amount' | 'category' | 'paymentMethod' | 'owner'

export interface TransactionDayGroup {
  day: number
  label: string
  transactions: Transaction[]
}

export function formatVariableAmount(amount: number, currency: string, locale: string): { text: string; color: string | undefined } {
  if (amount < 0) return { text: `+${formatMoneyFromNumber(-amount, currency, locale)}`, color: 'success.main' }
  if (amount > 0) return { text: `-${formatMoneyFromNumber(amount, currency, locale)}`, color: 'error.main' }
  return { text: formatMoneyFromNumber(0, currency, locale), color: undefined }
}

export function formatDate(ts: { seconds: bigint } | undefined): string {
  if (!ts || ts.seconds === 0n) return ''
  return new Date(Number(ts.seconds) * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function txAmount(t: Transaction): number {
  return Number(t.amount?.units ?? 0n) + (t.amount?.nanos ?? 0) / 1e9
}

// Maps a variable transaction's ID to the name of the fixed-type transaction
// it's pending review against. Only pending reviews are included — a
// confirmed review's transaction is already excluded from ListTransactions
// server-side, and a dismissed review is no longer an active link.
export function buildPendingReviewMatchMap(reviews: TransactionReview[]): Map<string, string> {
  return new Map(
    reviews
      .filter((r) => r.status === 'pending')
      .map((r) => [r.transactionId, r.matchedTransactionName]),
  )
}

export type SwipeDirection = 'left' | 'right' | null

// Determines whether a touch gesture was an intentional horizontal swipe, as
// opposed to a vertical scroll with incidental sideways drift (very easy to
// trigger on a tall list without this check). Horizontal movement must clear
// the threshold and dominate vertical movement by at least 2x.
export function resolveSwipeDirection(deltaX: number, deltaY: number, threshold = 60): SwipeDirection {
  if (Math.abs(deltaX) < threshold || Math.abs(deltaX) < Math.abs(deltaY) * 2) return null
  return deltaX > 0 ? 'right' : 'left'
}

// A transaction is left out of totals if manually flagged, or if it's the
// Income category — payroll deposits (auto-tagged by Plaid) and any manually
// categorized income should never count toward the spending total.
export function isTransactionExcluded(t: Transaction, incomeCategoryId?: number): boolean {
  return t.isExcluded || (incomeCategoryId != null && t.categoryId === incomeCategoryId)
}

export function txPlannedAmount(t: Transaction): number {
  return Number(t.plannedAmount?.units ?? 0n) + (t.plannedAmount?.nanos ?? 0) / 1e9
}

export function fixedExpensePlannedAmount(fe: FixedExpense): number {
  return Number(fe.plannedAmount?.units ?? 0n) + (fe.plannedAmount?.nanos ?? 0) / 1e9
}

// IDs of variable transactions that pushed their category's running total past
// its combined plan (expense allocations + fixed planned amounts), walked
// chronologically per category — only the transactions from the point the
// running total first crosses the plan onward are flagged, not every
// transaction in an over-budget category. A category with no plan at all
// defaults to a $0 plan, same as before — any spending in a category that was
// never budgeted for is, by definition, over budget starting from its first
// transaction. Only truly uncategorized transactions (no categoryId at all)
// are excluded, since there's no category to attribute the overage to.
export function computeOverBudgetTxIds(
  variableTxs: Transaction[],
  fixedTxs: Transaction[],
  fixedExpenses: FixedExpense[],
  allocations: ExpenseAllocation[],
  incomeCategoryId?: number,
): Set<string> {
  const plannedByCat = new Map<number, number>()
  allocations.forEach((a) => {
    const p = Number(a.plannedAmount?.units ?? 0n) + (a.plannedAmount?.nanos ?? 0) / 1e9
    plannedByCat.set(a.categoryId, (plannedByCat.get(a.categoryId) ?? 0) + p)
  })
  fixedTxs.filter((tx) => !isTransactionExcluded(tx, incomeCategoryId)).forEach((tx) => {
    if (!tx.categoryId) return
    plannedByCat.set(tx.categoryId, (plannedByCat.get(tx.categoryId) ?? 0) + txPlannedAmount(tx))
  })
  const fixedTxExpenseIds = new Set(fixedTxs.map((tx) => tx.fixedExpenseId).filter(Boolean))
  fixedExpenses.filter((fe) => fe.isActive && !fixedTxExpenseIds.has(fe.id)).forEach((fe) => {
    if (!fe.categoryId) return
    plannedByCat.set(fe.categoryId, (plannedByCat.get(fe.categoryId) ?? 0) + fixedExpensePlannedAmount(fe))
  })

  const txsByCat = new Map<number, Transaction[]>()
  variableTxs.filter((tx) => !isTransactionExcluded(tx, incomeCategoryId)).forEach((tx) => {
    if (!tx.categoryId) return
    if (!txsByCat.has(tx.categoryId)) txsByCat.set(tx.categoryId, [])
    txsByCat.get(tx.categoryId)!.push(tx)
  })

  const ids = new Set<string>()
  txsByCat.forEach((txs, catId) => {
    const planned = plannedByCat.get(catId) ?? 0
    const sorted = [...txs].sort(
      (a, b) => Number(a.date?.seconds ?? 0n) - Number(b.date?.seconds ?? 0n) || a.id.localeCompare(b.id)
    )
    let running = 0
    for (const tx of sorted) {
      running += txAmount(tx)
      if (running > planned && txAmount(tx) > 0) ids.add(tx.id)
    }
  })
  return ids
}

function monthsBetweenDates(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

function weeksBetweenDates(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (7 * 24 * 60 * 60 * 1000))
}

export function paymentProgress(fe: FixedExpense): string | null {
  if (!fe.totalPayments || fe.totalPayments <= 0) return null
  if (!fe.anchorDate?.seconds) return `1/${fe.totalPayments}`
  const anchor = new Date(Number(fe.anchorDate.seconds) * 1000)
  const now = new Date()
  let made: number
  if (fe.frequencyUnit === 2) {
    made = Math.floor(weeksBetweenDates(anchor, now) / (fe.intervalWeeks || 1)) + 1
  } else {
    made = Math.floor(monthsBetweenDates(anchor, now) / (fe.intervalMonths || 1)) + 1
  }
  return `${Math.min(Math.max(1, made), fe.totalPayments)}/${fe.totalPayments}`
}

export function nextDueDateLabel(fe: FixedExpense): string {
  if (!fe.nextDueDate || fe.nextDueDate.seconds === 0n) return ''
  return new Date(Number(fe.nextDueDate.seconds) * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function resolveDay(t: Transaction): number {
  return Number(t.date?.seconds ?? 0n)
}

function formatDayHeader(ts: { seconds: bigint } | undefined): string {
  if (!ts || ts.seconds === 0n) return ''
  return new Date(Number(ts.seconds) * 1000).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function resolveCategoryName(categoryId: number, categoryMap: Map<number, Category>): string {
  return categoryId ? (categoryMap.get(categoryId)?.name ?? '') : ''
}

export function resolveMethodName(paymentMethodId: string, methodMap: Map<string, PaymentMethod>): string {
  if (!paymentMethodId) return ''
  const m = methodMap.get(paymentMethodId)
  return m ? (m.alias || m.name) : ''
}

export function resolveOwnerName(
  paymentMethodId: string,
  methodMap: Map<string, PaymentMethod>,
  personMap: Map<string, BudgetPerson>,
): string {
  const method = paymentMethodId ? methodMap.get(paymentMethodId) : undefined
  const person = method?.budgetPersonId && method.budgetPersonId !== 0n
    ? personMap.get(method.budgetPersonId.toString())
    : undefined
  return person?.userName ?? ''
}

export function matchesSearch(
  name: string,
  categoryId: number,
  paymentMethodId: string,
  query: string,
  categoryMap: Map<number, Category>,
  methodMap: Map<string, PaymentMethod>,
  personMap: Map<string, BudgetPerson>,
): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    name.toLowerCase().includes(q) ||
    resolveCategoryName(categoryId, categoryMap).toLowerCase().includes(q) ||
    resolveOwnerName(paymentMethodId, methodMap, personMap).toLowerCase().includes(q)
  )
}

export function compareTransactions(
  a: Transaction,
  b: Transaction,
  key: SortKey,
  dir: 'asc' | 'desc',
  categoryMap: Map<number, Category>,
  methodMap: Map<string, PaymentMethod>,
  personMap: Map<string, BudgetPerson>,
): number {
  const sign = dir === 'asc' ? 1 : -1
  let primary: number
  switch (key) {
    case 'name': primary = a.name.localeCompare(b.name) * sign; break
    case 'day': primary = (resolveDay(a) - resolveDay(b)) * sign; break
    case 'amount': primary = (txPlannedAmount(a) - txPlannedAmount(b)) * sign; break
    case 'category':
      primary = resolveCategoryName(a.categoryId, categoryMap).localeCompare(resolveCategoryName(b.categoryId, categoryMap)) * sign
      break
    case 'paymentMethod':
      primary = resolveMethodName(a.paymentMethodId, methodMap).localeCompare(resolveMethodName(b.paymentMethodId, methodMap)) * sign
      break
    case 'owner':
      primary = resolveOwnerName(a.paymentMethodId, methodMap, personMap).localeCompare(resolveOwnerName(b.paymentMethodId, methodMap, personMap)) * sign
      break
  }
  return primary !== 0 ? primary : a.id.localeCompare(b.id)
}

export function groupTransactionsByDay(
  transactions: Transaction[],
  sortKey: SortKey,
  sortDir: 'asc' | 'desc',
  categoryMap: Map<number, Category>,
  methodMap: Map<string, PaymentMethod>,
  personMap: Map<string, BudgetPerson>,
): TransactionDayGroup[] {
  const groups = new Map<number, Transaction[]>()
  transactions.forEach((tx) => {
    const key = resolveDay(tx)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(tx)
  })
  const dirSign = sortDir === 'asc' ? 1 : -1
  const days = [...groups.keys()].sort((a, b) => (a - b) * dirSign)
  return days.map((day) => {
    const dayTransactions = [...groups.get(day)!].sort((a, b) =>
      compareTransactions(a, b, sortKey, sortDir, categoryMap, methodMap, personMap))
    return { day, label: formatDayHeader(dayTransactions[0]?.date), transactions: dayTransactions }
  })
}
