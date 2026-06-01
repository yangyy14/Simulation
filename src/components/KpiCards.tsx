import { TrendingUp, TrendingDown, Info } from 'lucide-react'
import type { PortfolioSummary } from '@/modules/strategy'

interface Props {
  summary: PortfolioSummary
  transactionCount: number
  evalEndDate: string
}

function Tip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 cursor-help">
      <Info size={11} className="text-text-muted inline" />
      <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 bg-surface border border-border rounded-md px-2.5 py-1.5 text-[11px] text-text-secondary leading-relaxed shadow-xl z-50 whitespace-normal">
        {text}
      </span>
    </span>
  )
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
        <div className="font-mono text-2xl font-semibold tabular-nums text-red">
          ¥ {summary.marketValue.toLocaleString()}
        </div>
        <div className="text-xs text-text-muted mt-1">{evalEndDate} 估值</div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs text-text-secondary mb-1">累计收益率</div>
        <div className={`font-mono text-2xl font-semibold tabular-nums flex items-center gap-1 ${returnPositive ? 'text-red' : 'text-green'}`}>
          {returnPositive ? '+' : ''}{(summary.cumulativeReturn * 100).toFixed(2)}%
          {returnPositive ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
        </div>
        <div className="text-xs text-text-muted mt-1">
          ¥ {(summary.marketValue - summary.totalCost).toLocaleString()} {returnPositive ? '收益' : '亏损'}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs text-text-secondary mb-1">XIRR 年化收益率</div>
        <div className={`font-mono text-2xl font-semibold tabular-nums ${xirrPositive ? 'text-red' : 'text-green'}`}>
          {summary.xirr !== null ? `${(summary.xirr * 100).toFixed(2)}%` : '—'}
        </div>
        <div className="text-xs text-text-muted mt-1">内部回报率</div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs text-text-secondary mb-1 flex items-center">
          最大回撤
          <Tip text="账户市值从历史最高点到最低点的最大跌幅。衡量策略最坏情况下会亏多少" />
        </div>
        <div className="font-mono text-2xl font-semibold tabular-nums text-green">
          {summary.maxDrawdown !== null ? `${(summary.maxDrawdown * 100).toFixed(2)}%` : '—'}
        </div>
        <div className="text-xs text-text-muted mt-1">峰值到谷底</div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs text-text-secondary mb-1 flex items-center">
          年化波动率
          <Tip text="账户市值日收益率的年化标准差。波动越大意味着持仓体验越颠簸" />
        </div>
        <div className="font-mono text-2xl font-semibold tabular-nums">
          {summary.annualVolatility !== null ? `${(summary.annualVolatility * 100).toFixed(2)}%` : '—'}
        </div>
        <div className="text-xs text-text-muted mt-1">基于日收益</div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs text-text-secondary mb-1 flex items-center">
          收益/回撤比
          <Tip text="每承担 1% 最大回撤获得的累计收益。值越高说明冒同样的风险赚得更多" />
        </div>
        <div className={`font-mono text-2xl font-semibold tabular-nums ${(summary.calmarRatio ?? 1) >= 1 ? 'text-red' : 'text-gold'}`}>
          {summary.calmarRatio !== null ? summary.calmarRatio.toFixed(2) : '—'}
        </div>
        <div className="text-xs text-text-muted mt-1">收益 ÷ 回撤</div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs text-text-secondary mb-1 flex items-center">
          最长回撤天数
          <Tip text="账户市值持续低于投入成本的最长连续天数。衡量最长要在水下憋多久" />
        </div>
        <div className="font-mono text-2xl font-semibold tabular-nums">
          {summary.longestDrawdownDays} 天
        </div>
        <div className="text-xs text-text-muted mt-1">市值 &lt; 成本</div>
      </div>
    </div>
  )
}
