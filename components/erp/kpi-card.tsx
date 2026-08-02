import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface KpiCardProps {
  label: string
  value: string
  subvalue?: string
  trend?: number
  icon: LucideIcon
  iconColor?: string
  iconBg?: string
}

export function KpiCard({ label, value, subvalue, trend, icon: Icon, iconColor = "text-primary", iconBg = "bg-primary/10" }: KpiCardProps) {
  const trendPositive = trend !== undefined && trend > 0
  const trendNegative = trend !== undefined && trend < 0
  const trendNeutral = trend !== undefined && trend === 0

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
          <Icon className={cn("w-5 h-5", iconColor)} />
        </div>
        {trend !== undefined && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
              trendPositive && "bg-emerald-500/10 text-emerald-400",
              trendNegative && "bg-destructive/10 text-destructive",
              trendNeutral && "bg-muted text-muted-foreground"
            )}
          >
            {trendPositive && <TrendingUp className="w-3 h-3" />}
            {trendNegative && <TrendingDown className="w-3 h-3" />}
            {trendNeutral && <Minus className="w-3 h-3" />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground text-balance leading-none">{value}</p>
        {subvalue && <p className="text-xs text-muted-foreground mt-1">{subvalue}</p>}
        <p className="text-sm text-muted-foreground mt-2">{label}</p>
      </div>
    </div>
  )
}
