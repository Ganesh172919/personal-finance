import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Check,
  Clock,
  Eye,
  Heart,
  MapPin,
  Share2,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { FinancialTransformationChart } from "@/components/FinancialTransformationChart";
import { LazyImage } from "@/components/LazyImage";
import { ReadingProgressBar } from "@/components/ReadingProgressBar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { getGrowthStoryBySlug, toggleGrowthStoryLike } from "@/lib/apiClient";
import { resolveGrowthStoryCoverImage } from "@/lib/media";
import { useToast } from "@/hooks/useToast";

const formatINR = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

export default function GrowthStoryDetail() {
  const [, params] = useRoute("/growth-stories/:slug");
  const slug = params?.slug;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLiked, setIsLiked] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["growth-story", slug],
    queryFn: () => getGrowthStoryBySlug(slug!),
    enabled: !!slug,
  });

  const likeMutation = useMutation({
    mutationFn: toggleGrowthStoryLike,
    onSuccess: (res) => {
      setIsLiked(true);
      queryClient.setQueryData(["growth-story", slug], (old: any) => {
        if (!old?.story) return old;
        return {
          ...old,
          story: { ...old.story, likes: res.likes },
        };
      });
    },
    onError: () => {
      toast({
        title: "Action failed",
        description: "Could not like the story.",
        variant: "destructive",
      });
    },
  });

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Link copied",
      description: "Ready to share with others for inspiration!",
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 w-full max-w-5xl mx-auto px-6 py-8">
        <Skeleton className="h-8 w-32 mb-8" />
        <Skeleton className="h-12 w-3/4 mb-4" />
        <Skeleton className="h-[300px] w-full rounded-2xl mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-4">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <div className="md:col-span-1 space-y-4">
            <Skeleton className="h-[200px] w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data?.story) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 h-full">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Story Not Found</AlertTitle>
          <AlertDescription>
            {error?.message || "We couldn't find this transformation story."}
          </AlertDescription>
        </Alert>
        <Link href="/growth-stories">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Stories
          </Button>
        </Link>
      </div>
    );
  }

  const story = data.story;
  const publishedDate = story.publishedAt
    ? formatDistanceToNow(new Date(story.publishedAt), { addSuffix: true })
    : "";
  const coverImage = resolveGrowthStoryCoverImage(story.coverImage);

  return (
    <div className="flex-1 overflow-auto bg-background relative" data-testid="growth-story-detail-page">
      <ReadingProgressBar />

      <div className="relative w-full h-[50vh] min-h-[400px] max-h-[600px] overflow-hidden bg-black">
        <LazyImage
          src={coverImage}
          fallbackSrc={coverImage}
          alt={story.title}
          className="absolute inset-0 h-full"
          imageClassName="opacity-40 hover:scale-105 transition-transform duration-1000"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

        <div className="absolute inset-0 flex flex-col justify-end max-w-5xl mx-auto px-6 pb-12 w-full z-10">
          <div className="mb-8">
            <Link href="/growth-stories">
              <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 pl-0 group mb-6">
                <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
                Back to All Stories
              </Button>
            </Link>

            <div className="flex flex-wrap gap-2 mb-4">
              <Badge className="bg-primary hover:bg-primary shadow-sm">
                {story.category.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
              </Badge>
              <Badge variant="outline" className="text-white border-white/30 backdrop-blur-sm">
                {story.difficulty} path
              </Badge>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-tight max-w-4xl mb-4">
              {story.title}
            </h1>

            <p className="text-xl text-white/80 max-w-3xl mb-6">{story.summary}</p>

            <div className="flex flex-wrap items-center gap-6 text-sm text-white/70 font-medium">
              <div className="flex items-center space-x-2 bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Persona</span>
                <span className="text-white">{story.persona}</span>
              </div>
              <span className="flex items-center">
                <MapPin className="w-4 h-4 mr-1" />
                {story.location}
              </span>
              <span className="flex items-center">
                <Clock className="w-4 h-4 mr-1" />
                {story.timeline} timeline
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-12 bg-muted/30 p-8 rounded-3xl border border-destructive/20 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <Target className="w-32 h-32" />
              </div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="p-2 bg-destructive/10 text-destructive rounded-lg">
                  <Target className="w-5 h-5" />
                </div>
                <h2 className="text-2xl font-bold">The Challenge</h2>
              </div>
              <p className="text-lg text-muted-foreground leading-relaxed relative z-10">{story.challenge}</p>
            </motion.div>

            <div className="mb-12">
              <FinancialTransformationChart metrics={story.financialMetrics} timeline={story.timeline} />
            </div>

            <div className="prose prose-lg dark:prose-invert prose-headings:font-bold prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary max-w-none">
              <div className="flex items-center space-x-2 mb-6 not-prose">
                <div className="p-2 bg-primary/10 text-primary rounded-lg">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h2 className="text-3xl font-bold m-0 p-0">The Journey</h2>
              </div>

              <ReactMarkdown remarkPlugins={[remarkGfm]}>{story.journey}</ReactMarkdown>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mt-12 bg-primary/5 p-8 rounded-3xl border border-primary/20 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <Award className="w-32 h-32" />
              </div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="p-2 bg-primary/20 text-primary rounded-lg">
                  <Award className="w-5 h-5" />
                </div>
                <h2 className="text-2xl font-bold">The Outcome</h2>
              </div>
              <p className="text-lg font-medium leading-relaxed relative z-10 text-foreground/90">
                "{story.outcome}"
              </p>
            </motion.div>

            <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center text-sm text-muted-foreground space-x-4">
                <span className="flex items-center">
                  <Eye className="w-4 h-4 mr-1.5" />
                  {story.views} views
                </span>
                <span>&bull;</span>
                <span>Published {publishedDate}</span>
              </div>

              <div className="flex space-x-3 w-full sm:w-auto">
                <Button
                  variant={isLiked ? "default" : "outline"}
                  size="lg"
                  className="flex-1 sm:flex-none rounded-full gap-2"
                  onClick={() => !isLiked && likeMutation.mutate(story._id)}
                  disabled={likeMutation.isPending || isLiked}
                >
                  <Heart className={`w-5 h-5 ${isLiked ? "fill-current text-white" : ""}`} />
                  {isLiked ? "Applauded" : "Applaud"} ({story.likes})
                </Button>
                <Button variant="secondary" size="lg" className="rounded-full gap-2" onClick={handleCopyLink}>
                  <Share2 className="w-5 h-5" /> Share
                </Button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4">
            <div className="sticky top-24 space-y-6">
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                <div className="flex items-center space-x-2 mb-6 pb-4 border-b border-border">
                  <Wallet className="w-5 h-5 text-primary" />
                  <h3 className="text-xl font-bold">Financial Snapshot</h3>
                </div>

                <div className="space-y-5">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Starting Point</p>
                    <p className="text-xl font-mono font-bold text-foreground/70">
                      {formatINR(story.financialMetrics.startingNetWorth)}
                    </p>
                  </div>

                  <div className="pl-4 border-l-2 border-primary/30">
                    <p className="text-sm text-primary font-medium mb-1">Current Net Worth</p>
                    <p className="text-2xl font-mono font-extrabold text-foreground">
                      {formatINR(story.financialMetrics.currentNetWorth)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Monthly Income</p>
                      <p className="text-sm font-semibold">{formatINR(story.financialMetrics.monthlyIncome)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Savings Rate</p>
                      <p className="text-sm font-semibold">{story.financialMetrics.savingsRate}%</p>
                    </div>
                    {story.financialMetrics.debtPaidOff > 0 ? (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Debt Cleared</p>
                        <p className="text-sm font-semibold text-green-500">
                          {formatINR(story.financialMetrics.debtPaidOff)}
                        </p>
                      </div>
                    ) : null}
                    {story.financialMetrics.investmentReturns > 0 ? (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Inv. Returns</p>
                        <p className="text-sm font-semibold text-primary">
                          {story.financialMetrics.investmentReturns}% p.a.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {story.strategies && story.strategies.length > 0 ? (
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold mb-4">Key Strategies</h3>
                  <ul className="space-y-3">
                    {story.strategies.map((strategy: string, idx: number) => (
                      <li key={idx} className="flex items-start text-sm">
                        <Check className="w-4 h-4 text-primary mr-2 mt-0.5" />
                        <span className="text-foreground/80">{strategy}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {story.tags && story.tags.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {story.tags.map((tag: string, idx: number) => (
                      <Badge key={idx} variant="secondary" className="font-normal">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
