/**
 * @fileoverview FinancialTransformationChart — area chart visualising the net worth
 * trajectory from a starting point to current value over a given timeline.
 *
 * WHAT IT DOES
 *  - Receives `FinancialMetrics` (starting/current net worth, income, savings rate, etc.)
 *    and a `timeline` string (e.g. "3 years", "18 months").
 *  - `generateTrendData` creates synthetic intermediate data points using an ease-in-out
 *    curve with slight random noise for a realistic growth shape.
 *  - Renders a Recharts `AreaChart` with a gradient fill, INR-formatted Y-axis, and a
 *    themed tooltip. Stroke colour switches between green (positive growth) and red (negative).
 *
 * KEY PROPS & DATA FLOW
 *  - `metrics` (FinancialMetrics) — the financial data to chart.
 *  - `timeline` (string) — parsed to determine the number of data points.
 *
 * ARCHITECTURE NOTES
 *  - Used in GrowthStoryCard detail pages and the AI insight detail modal.
 *  - Uses `generateTrendData` with random noise, so the chart is illustrative, not exact.
 *  - Y-axis labels use Indian lakhs/crores format (₹1L, ₹1Cr) via `formatYAxis`.
 */
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

interface FinancialMetrics {
  startingNetWorth: number;
  currentNetWorth: number;
  monthlyIncome: number;
  savingsRate: number;
  debtPaidOff: number;
  investmentReturns: number;
}

interface FinancialTransformationChartProps {
  metrics: FinancialMetrics;
  timeline: string;
}

// Generate simple mock data points between start and current net worth based on timeline
const generateTrendData = (start: number, end: number, timelineStr: string) => {
    // Very rough heuristic to determine steps
    let steps = 12; // default 12 months
    const lowerTimeline = timelineStr.toLowerCase();
    
    if (lowerTimeline.includes('year') || lowerTimeline.includes('yr')) {
      const match = lowerTimeline.match(/(\d+)/);
      if (match) {
        // e.g., "5 years" -> show 5 data points
        // or show roughly 12 data points spanning those 5 years
        steps = Math.max(5, Math.min(24, parseInt(match[1]) * 2)); 
      }
    } else if (lowerTimeline.includes('month') || lowerTimeline.includes('mo')) {
      const match = lowerTimeline.match(/(\d+)/);
      if (match) {
         steps = Math.min(24, Math.max(3, parseInt(match[1])));
      }
    }

    const data = [];
    const diff = end - start;
    
    for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        // Add a slight curve (ease-in-out) instead of linear for realistic looking growth
        const curvedProgress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        // Add slight randomness to make it look real, but not on first or last point
        const noise = (i === 0 || i === steps) ? 0 : (Math.random() - 0.5) * (diff * 0.05);
        
        data.push({
            name: `Period ${i}`,
            value: Math.round(start + (diff * curvedProgress) + noise)
        });
    }
    
    return data;
};

// Format large numbers (100000 -> 1L)
const formatYAxis = (tickItem: number) => {
    if (Math.abs(tickItem) >= 10000000) return `₹${(tickItem / 10000000).toFixed(1)}Cr`;
    if (Math.abs(tickItem) >= 100000) return `₹${(tickItem / 100000).toFixed(1)}L`;
    if (Math.abs(tickItem) >= 1000) return `₹${(tickItem / 1000).toFixed(0)}k`;
    return `₹${tickItem}`;
};

export function FinancialTransformationChart({ metrics, timeline }: FinancialTransformationChartProps) {
  
  const isPositiveGrowth = metrics.currentNetWorth > metrics.startingNetWorth;
  const strokeColor = isPositiveGrowth ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-4))';
  
  const data = generateTrendData(metrics.startingNetWorth, metrics.currentNetWorth, timeline);

  return (
    <Card className="shadow-md border-border">
      <CardHeader>
        <CardTitle>Net Worth Progression</CardTitle>
        <CardDescription>Estimated trajectory over {timeline}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" hide />
              <YAxis 
                 tickFormatter={formatYAxis} 
                 axisLine={false} 
                 tickLine={false}
                 tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                 width={60}
              />
              <Tooltip 
                 formatter={(value: number) => [
                     new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value), 
                     "Net Worth"
                 ]}
                 labelStyle={{ display: 'none' }}
                 contentStyle={{ 
                     backgroundColor: 'hsl(var(--background))', 
                     border: '1px solid hsl(var(--border))',
                     borderRadius: '8px',
                     boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                 }}
              />
              <Area 
                 type="monotone" 
                 dataKey="value" 
                 stroke={strokeColor} 
                 fillOpacity={1} 
                 fill="url(#colorValue)" 
                 strokeWidth={3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
