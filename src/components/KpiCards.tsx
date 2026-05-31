import { TrendingUp, TrendingDown } from 'lucide-react'
import type { PortfolioSummary } from '@/modules/strategy'

interface Props {
  summary: PortfolioSummary
  transactionCount: number
  evalEndDate: string
}

export default function KpiCards({ summary, transactionCount, evalEndDate }: Props) {
  const returnPositive = summary.cumulativeReturn >= 0
  const xirrPositive = (summary.xirr ?? 0) >= 0

  return (
    <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs text-text-secondary mb-1">累计投入总额</div>
        <div className="font-mono text-2xl font-semibold tabular-nums">
          ¥ {summary.totalCost.toLocaleString()}
        </div>
        <div className="text-xs text-text-muted mt-1">共 {transactionCount} 笔定投</div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs text-text-secondary mb-1">期末总市值</div>
        <div className="font-mono text-2xl font-semibold tabular-nums text-green">
          ¥ {summary.marketValue.toLocaleString()}
        </div>
        <div className="text-xs text-text-muted mt-1">{evalEndDate} 估值</div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs text-text-secondary mb-1">累计收益率</div>
        <div className={`font-mono text-2xl font-semibold tabular-nums flex items-center gap-1 ${returnPositive ? 'text-green' : 'text-red'}`}>
          {returnPositive ? '+' : ''}{(summary.cumulativeReturn * 100).toFixed(2)}%
          {returnPositive ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
        </div>
        <div className="text-xs text-text-muted mt-1">
          ¥ {(summary.marketValue - summary.totalCost).toLocaleString()} {returnPositive ? '收益' : '亏损'}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs text-text-secondary mb-1">XIRR 年化收益率</div>
        <div className={`font-mono text-2xl font-semibold tabular-nums ${xirrPositive ? 'text-green' : 'text-red'}`}>
          {summary.xirr !== null ? `${(summary.xirr * 100).toFixed(2)}%` : '—'}
        </div>
        <div className="text-xs text-text-muted mt-1">内部回报率</div>
      </div>
    </div>
  )
}
