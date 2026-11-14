import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';

interface FinancialTransformationChartProps {
  metrics: { startingNetWorth: number; currentNetWorth: number };
  timeline: string;
}

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});
const compactCurrency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function FinancialTransformationChart({ metrics, timeline }: FinancialTransformationChartProps) {
  const reportedValues = [
    { name: 'Starting', value: metrics.startingNetWorth },
    { name: 'Current', value: metrics.currentNetWorth },
  ].filter(({ value }) => Number.isFinite(value));

  return (
    <Card className="shadow-md border-border">
      <CardHeader>
        <CardTitle>Reported net worth</CardTitle>
        <CardDescription>Starting and current figures shared by the author. Reported time span: {timeline}.</CardDescription>
      </CardHeader>
      <CardContent>
        {reportedValues.length > 0 ? (
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reportedValues} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tickLine={false} />
                <YAxis
                  tickFormatter={(value: number) => compactCurrency.format(value)}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  width={70}
                />
                <Tooltip
                  formatter={(value: number) => [currency.format(value), 'Net worth']}
                  contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                />
                <Bar dataKey="value" fill="hsl(var(--chart-2))" maxBarSize={64} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No net worth figures were shared.</p>
        )}
      </CardContent>
    </Card>
  );
}
