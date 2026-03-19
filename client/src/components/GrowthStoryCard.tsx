import { motion } from "framer-motion";
import { Link } from "wouter";
import { Clock, Eye, Heart, MapPin, Target, User } from "lucide-react";

import { LazyImage } from "@/components/LazyImage";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/Card";
import { resolveGrowthStoryCoverImage } from "@/lib/media";
import { IGrowthStory } from "@/types/apiTypes";

export interface GrowthStoryCardProps {
  story: IGrowthStory;
  featured?: boolean;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20",
  intermediate: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  advanced: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
};

const CATEGORY_COLORS: Record<string, string> = {
  "debt-freedom": "bg-chart-4 text-chart-4-foreground",
  "wealth-building": "bg-chart-2 text-chart-2-foreground",
  "early-retirement": "bg-chart-1 text-chart-1-foreground",
  "side-hustle": "bg-chart-3 text-chart-3-foreground",
  "tax-optimization": "bg-chart-5 text-chart-5-foreground",
  "family-finance": "bg-chart-1/80 text-chart-1-foreground",
  "student-finance": "bg-chart-4/80 text-chart-4-foreground",
};

const formatCategory = (category: string) =>
  category
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export function GrowthStoryCard({ story, featured = false }: GrowthStoryCardProps) {
  const netWorthDiff =
    (story.financialMetrics?.currentNetWorth || 0) - (story.financialMetrics?.startingNetWorth || 0);
  const coverImage = resolveGrowthStoryCoverImage(story.coverImage);

  const formatCompactCurrency = (value: number) => {
    if (value >= 10000000) return `Rs. ${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `Rs. ${(value / 100000).toFixed(1)}L`;
    if (value <= -100000) return `-Rs. ${(Math.abs(value) / 100000).toFixed(1)}L`;
    return `Rs. ${(value / 1000).toFixed(0)}K`;
  };

  if (featured) {
    return (
      <Link href={`/growth-stories/${story.slug}`}>
        <motion.div
          whileHover={{ y: -5 }}
          className="group cursor-pointer overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-xl"
        >
          <div className="grid h-full grid-cols-1 md:grid-cols-5">
            <div className="relative h-64 overflow-hidden md:col-span-2 md:h-full">
              <div className="absolute inset-0 z-10 bg-gradient-to-r from-background/10 to-transparent" />
              <LazyImage
                src={coverImage}
                fallbackSrc={coverImage}
                alt={story.title}
                className="h-full"
                imageClassName="transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute left-4 top-4 z-20 flex flex-col gap-2">
                <Badge className={`${CATEGORY_COLORS[story.category]} shadow-md`}>
                  {formatCategory(story.category)}
                </Badge>
                <Badge variant="outline" className={`${DIFFICULTY_COLORS[story.difficulty]} backdrop-blur-md`}>
                  {story.difficulty.charAt(0).toUpperCase() + story.difficulty.slice(1)}
                </Badge>
              </div>
            </div>

            <div className="flex flex-col justify-center p-6 md:col-span-3 md:p-8">
              <div className="mb-3 flex items-center space-x-2 text-sm font-medium text-primary">
                <Target className="h-4 w-4" />
                <span>Featured Transformation</span>
              </div>

              <h3 className="mb-4 text-2xl font-extrabold leading-tight transition-colors group-hover:text-primary md:text-3xl">
                {story.title}
              </h3>

              <p className="mb-6 line-clamp-2 text-lg text-muted-foreground">{story.summary}</p>

              <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/50 bg-muted/30 p-4 transition-colors group-hover:bg-primary/5 md:gap-8">
                <div className="flex flex-col">
                  <span className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Starting Point
                  </span>
                  <span className="font-mono text-lg font-bold md:text-xl">
                    {formatCompactCurrency(story.financialMetrics?.startingNetWorth || 0)}
                  </span>
                </div>
                <div className="hidden self-center sm:flex">
                  <span className="animate-pulse text-xl text-primary">-&gt;</span>
                </div>
                <div className="flex flex-col">
                  <span className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Current Net Worth
                  </span>
                  <span className="font-mono text-lg font-bold text-primary md:text-xl">
                    {formatCompactCurrency(story.financialMetrics?.currentNetWorth || 0)}
                  </span>
                </div>
                <div className="mt-4 flex w-full flex-col border-t border-border/50 pt-4 sm:mt-0 sm:w-auto sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
                  <span className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Timeline
                  </span>
                  <span className="flex items-center text-lg font-bold md:text-xl">
                    <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                    {story.timeline}
                  </span>
                </div>
              </div>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-1.5 text-sm font-medium">
                  <div className="rounded-full bg-primary/10 p-1.5">
                    <User className="mx-1 h-4 w-4 text-primary" />
                  </div>
                  <span>{story.persona}</span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {story.location}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </Link>
    );
  }

  return (
    <Link href={`/growth-stories/${story.slug}`}>
      <motion.div whileHover={{ y: -4 }}>
        <Card className="group flex h-full cursor-pointer flex-col overflow-hidden border-border transition-all duration-300 hover:shadow-lg">
          <div className="relative h-48 overflow-hidden">
            <LazyImage
              src={coverImage}
              fallbackSrc={coverImage}
              alt={story.title}
              className="h-full"
              imageClassName="transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

            <div className="absolute left-3 top-3 flex gap-2">
              <Badge className={`${CATEGORY_COLORS[story.category]} px-2 py-0 text-[10px] shadow-sm`}>
                {formatCategory(story.category)}
              </Badge>
            </div>
            <div className="absolute right-3 top-3">
              <Badge
                variant="outline"
                className={`${DIFFICULTY_COLORS[story.difficulty]} bg-background/80 px-2 py-0 text-[10px] backdrop-blur-sm`}
              >
                {story.difficulty.charAt(0).toUpperCase() + story.difficulty.slice(1)}
              </Badge>
            </div>

            <div className="absolute bottom-3 left-3 pr-3 text-white">
              <div className="flex items-end space-x-2">
                <span className="font-mono text-2xl font-bold leading-none tracking-tighter transition-colors group-hover:text-primary">
                  {netWorthDiff > 0 ? "+" : ""}
                  {formatCompactCurrency(netWorthDiff)}
                </span>
                <span className="pb-0.5 text-xs opacity-80">NW Growth</span>
              </div>
            </div>
          </div>

          <CardHeader className="p-5 pb-2">
            <div className="mb-2 flex items-center space-x-3 text-xs text-muted-foreground">
              <span className="flex items-center">
                <MapPin className="mr-1 h-3 w-3" /> {story.location}
              </span>
              <span className="flex items-center">
                <Clock className="mr-1 h-3 w-3" /> {story.timeline}
              </span>
            </div>
            <h3 className="line-clamp-2 text-xl font-bold leading-tight transition-colors group-hover:text-primary">
              {story.title}
            </h3>
          </CardHeader>

          <CardContent className="flex-1 p-5 pt-0">
            <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">{story.summary}</p>

            <div className="mt-auto flex flex-wrap gap-1.5">
              {story.strategies?.slice(0, 2).map(strategy => (
                <span
                  key={strategy}
                  className="rounded-md border border-border/50 bg-secondary px-2 py-1 text-[10px] text-secondary-foreground"
                >
                  {strategy}
                </span>
              ))}
              {story.strategies?.length > 2 ? (
                <span className="rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                  +{story.strategies.length - 2} more
                </span>
              ) : null}
            </div>
          </CardContent>

          <CardFooter className="flex items-center justify-between border-t border-border/50 bg-muted/10 p-4 pt-3 text-xs">
            <div className="flex items-center space-x-2 font-medium">
              <User className="h-3.5 w-3.5 text-primary" />
              <span className="max-w-[120px] truncate">{story.persona}</span>
            </div>

            <div className="flex items-center space-x-3 text-muted-foreground">
              <span className="flex items-center">
                <Eye className="mr-1 h-3.5 w-3.5" />
                {story.views}
              </span>
              <span className="flex items-center">
                <Heart className="mr-1 h-3.5 w-3.5" />
                {story.likes}
              </span>
            </div>
          </CardFooter>
        </Card>
      </motion.div>
    </Link>
  );
}
