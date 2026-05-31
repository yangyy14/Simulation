import { useMemo, useState } from 'react'
import type { Transaction, PortfolioSummary } from '@/modules/strategy'

interface Props {
  summary: PortfolioSummary
  transactions: Transaction[]
  evalEndDate: string
}

type SortField = 'date' | 'indexName' | 'price' | 'shares' | 'grossAmount' | 'currentValue' | 'pnl'

export default function TransactionTable({ summary, transactions, evalEndDate }: Props) {
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortAsc, setSortAsc] = useState(false)

  // Estimate current value and P&L for each transaction
  const enriched = useMemo(() => {
    if (transactions.length === 0) return []
    const totalShares = transactions.reduce((sum, tx) => sum + tx.shares, 0)
    const avgValue = summary.marketValue / totalShares
    return transactions.map((tx) => {
      const currentValue = tx.shares * avgValue // approximate
      const pnl = (currentValue - tx.grossAmount) / tx.grossAmount
      return { ...tx, currentValue, pnl }
    })
  }, [transactions, summary])

  const sorted = useMemo(() => {
    const arr = [...enriched]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'date': cmp = a.date.localeCompare(b.date); break
        case 'indexName': cmp = a.indexName.localeCompare(b.indexName); break
        case 'price': cmp = a.price - b.price; break
        case 'shares': cmp = a.shares - b.shares; break
        case 'grossAmount': cmp = a.grossAmount - b.grossAmount; break
        case 'currentValue': cmp = a.currentValue - b.currentValue; break
        case 'pnl': cmp = a.pnl - b.pnl; break
      }
      return sortAsc ? cmp : -cmp
    })
    return arr
  }, [enriched, sortField, sortAsc])

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(false) }
  }

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      className="px-3 py-2 text-left text-xs font-semibold text-text-secondary bg-root border-b border-border cursor-pointer select-none hover:text-text-primary sticky top-0 whitespace-nowrap"
      onClick={() => toggleSort(field)}
    >
      {children} {sortField === field ? (sortAsc ? '▲' : '▼') : ''}
    </th>
  )

  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">定投明细</span>
        <span className="text-xs text-text-muted">共 {transactions.length} 笔</span>
      </div>
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <SortHeader field="date">日期</SortHeader>
              <SortHeader field="indexName">指数</SortHeader>
              <SortHeader field="price">买入净值</SortHeader>
              <SortHeader field="shares">买入份额</SortHeader>
              <SortHeader field="grossAmount">投入金额</SortHeader>
              <SortHeader field="currentValue">当前市值</SortHeader>
              <SortHeader field="pnl">盈亏</SortHeader>
            </tr>
          </thead>
          <tbody>
            {sorted.map((tx, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap">{tx.date}</td>
                <td className="px-3 py-2 whitespace-nowrap">{tx.indexName}</td>
                <td className="px-3 py-2 font-mono tabular-nums">{tx.price.toFixed(2)}</td>
                <td className="px-3 py-2 font-mono tabular-nums">{tx.shares.toFixed(2)}</td>
                <td className="px-3 py-2 font-mono tabular-nums">¥ {tx.grossAmount.toLocaleString()}</td>
                <td className="px-3 py-2 font-mono tabular-nums">¥ {tx.currentValue.toLocaleString()}</td>
                <td className={`px-3 py-2 font-mono tabular-nums ${tx.pnl >= 0 ? 'text-green' : 'text-red'}`}>
                  {tx.pnl >= 0 ? '+' : ''}{(tx.pnl * 100).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
