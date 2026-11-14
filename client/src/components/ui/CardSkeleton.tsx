/**
 * @fileoverview Card Skeleton Loaders
 *
 * Provides skeleton placeholder components for dashboard cards while data
 * is loading. These use the existing Skeleton primitive and match the
 * layout of actual dashboard cards for a smooth loading experience.
 *
 * @module components/ui/CardSkeleton
 */

import { Skeleton } from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";

// Loading placeholder component mimicking the BudgetHealthCard layout.
// Renders pulsing skeleton rectangles for header, score value, and budget bars.
// Prevents layout shifts during financial budget health query fetching.
/** Skeleton for BudgetHealthCard */
export function BudgetHealthCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-48 mt-1" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-2 w-full" />
        <div className="flex justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

// Placeholder loading skeleton for the InvestmentPortfolio card component.
// Replicates donut chart circle and multi-row asset allocation breakdowns.
// Maintains visual stability while investment holdings and balances load.
/** Skeleton for InvestmentPortfolio */
export function InvestmentPortfolioSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-center">
          <Skeleton className="h-32 w-32 rounded-full" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Skeleton placeholder mirroring the SpendingAnalysis card structure.
// Displays placeholder blocks for spending charts and category rows.
// Smoothes page loading transitions while transaction analytics load.
/** Skeleton for SpendingAnalysis */
export function SpendingAnalysisSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-36" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-center">
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Loading placeholder component for the GoalProgress dashboard card.
// Renders animated placeholder rows simulating multiple financial target progress bars.
// Preserves vertical rhythm while savings goals are queried from the server.
/** Skeleton for GoalProgress */
export function GoalProgressSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-28" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Skeleton placeholder replicating the RecentActivity transaction list feed.
// Displays pulsing avatar circles, item descriptions, and amount placeholders.
// Eliminates layout jumpiness while recent financial logs are fetched.
/** Skeleton for RecentActivity */
export function RecentActivitySkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2 w-20" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
