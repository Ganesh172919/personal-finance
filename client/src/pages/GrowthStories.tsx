import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Search, PenLine, Trophy } from "lucide-react";

import { GrowthStoryCard } from "@/components/GrowthStoryCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { CreateGrowthStoryForm } from "@/components/forms/CreateGrowthStoryForm";
import { getGrowthStories, getFeaturedGrowthStories, getGrowthStoryCategories } from "@/lib/apiClient";
import { useDebounce } from "@/hooks/useDebounce";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  show: { opacity: 1, scale: 1 },
};

export default function GrowthStories() {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Queries
  const { data: featuredData, isLoading: isLoadingFeatured } = useQuery({
    queryKey: ["growth-stories", "featured"],
    queryFn: () => getFeaturedGrowthStories(1),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["growth-stories", "categories"],
    queryFn: getGrowthStoryCategories,
  });

  const { data: storiesData, isLoading: isLoadingStories } = useQuery({
    queryKey: ["growth-stories", "list", activeCategory, debouncedSearch],
    queryFn: () => getGrowthStories({
      category: activeCategory !== "all" ? activeCategory : undefined,
      search: debouncedSearch || undefined,
      limit: 12,
    }),
  });

  const featuredStory = featuredData?.stories?.[0];
  const hideFeaturedSection = !!debouncedSearch || activeCategory !== "all";

  return (
    <div className="flex-1 overflow-auto bg-background" data-testid="growth-stories-page">
      <div className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-primary/10 rounded-full">
                    <Trophy className="w-6 h-6 text-primary" />
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight">Growth Stories</h1>
            </div>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Real stories from people who took control of their finances. Get inspired by their journeys to financial independence.
            </p>
          </div>
          <Button 
             onClick={() => setIsCreateModalOpen(true)}
             className="gap-2 self-start md:self-auto shadow-sm"
          >
             <PenLine className="w-4 h-4" />
             Share Your Story
          </Button>
        </header>

        {/* Featured Story Hero */}
        {!hideFeaturedSection && (
          <div className="mb-12">
            {isLoadingFeatured ? (
               <Skeleton className="w-full h-[300px] md:h-[400px] rounded-3xl" />
            ) : featuredStory ? (
               <GrowthStoryCard story={featuredStory} featured={true} />
            ) : null}
          </div>
        )}

        {/* Filters and Search */}
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md pt-4 pb-6 mb-8 border-b border-border/50 flex flex-col md:flex-row justify-between items-center gap-4">
          
          <div className="flex flex-wrap gap-2 overflow-x-auto no-scrollbar pb-2 md:pb-0 w-full md:w-auto flex-nowrap md:flex-wrap text-sm">
            <Button
              variant={activeCategory === "all" ? "default" : "secondary"}
              size="sm"
              className="rounded-full shrink-0"
              onClick={() => setActiveCategory("all")}
            >
              All Stories
            </Button>
            {categoriesData?.categories?.map((c: any) => (
              <Button
                key={c.category}
                variant={activeCategory === c.category ? "default" : "secondary"}
                size="sm"
                className="rounded-full shrink-0"
                onClick={() => setActiveCategory(c.category)}
              >
                {c.category.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                <span className="ml-2 opacity-50 text-[10px] bg-background/20 px-1.5 rounded-full">{c.count}</span>
              </Button>
            ))}
          </div>

          <div className="relative w-full md:w-64 lg:w-80 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search stories..."
              className="pl-9 bg-muted/50 border-none rounded-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Story Grid */}
        {isLoadingStories ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex flex-col space-y-3">
                <Skeleton className="h-[250px] w-full rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : storiesData?.stories?.length === 0 ? (
          <div className="text-center py-20 bg-muted/20 rounded-2xl border border-dashed border-border flex flex-col items-center">
            <div className="p-4 bg-muted rounded-full mb-4">
               <Trophy className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No stories found</h3>
            <p className="text-muted-foreground max-w-sm text-center mb-6">
               We couldn't find any transformation stories matching your filters.
            </p>
            {(activeCategory !== "all" || searchQuery) ? (
              <Button 
                variant="outline" 
                onClick={() => {
                  setActiveCategory("all");
                  setSearchQuery("");
                }}
              >
                Clear Filters
              </Button>
            ) : (
              <Button onClick={() => setIsCreateModalOpen(true)}>
                Be the first to share!
              </Button>
            )}
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            {storiesData?.stories?.map((story: any) => (
              <motion.div key={story._id} variants={itemVariants}>
                <GrowthStoryCard story={story} />
              </motion.div>
            ))}
          </motion.div>
        )}

      </div>
      
      {/* Create Story Modal */}
      <CreateGrowthStoryForm open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} />
      
    </div>
  );
}
