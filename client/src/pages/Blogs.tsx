/**
 * @fileoverview Blog listing page for financial intelligence articles.
 *
 * Displays a searchable, category-filtered grid of blog posts with a
 * featured post hero section. Users can also create new posts via a
 * modal form.
 *
 * Key data flows:
 * - Fetches featured posts via getFeaturedBlogs(1).
 * - Fetches categories via getBlogCategories() for the filter chips.
 * - Fetches paginated blog list via getBlogs({ category, search, limit })
 *   using a debounced search query (300ms).
 * - Featured section hides when searching or filtering by category.
 *
 * Part of the content/community layer alongside Growth Stories, providing
 * user-generated and curated financial education content.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Search, PenLine } from "lucide-react";

import { BlogCard } from "@/components/BlogCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { CreateBlogForm } from "@/components/forms/CreateBlogForm";
import { getBlogs, getFeaturedBlogs, getBlogCategories } from "@/lib/apiClient";
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
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function Blogs() {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Queries
  const { data: featuredData, isLoading: isLoadingFeatured } = useQuery({
    queryKey: ["blogs", "featured"],
    queryFn: () => getFeaturedBlogs(1),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["blogs", "categories"],
    queryFn: getBlogCategories,
  });

  const { data: blogsData, isLoading: isLoadingBlogs } = useQuery({
    queryKey: ["blogs", "list", activeCategory, debouncedSearch],
    queryFn: () => getBlogs({
      category: activeCategory !== "all" ? activeCategory : undefined,
      search: debouncedSearch || undefined,
      limit: 12,
    }),
  });

  const featuredPost = featuredData?.posts?.[0];
  // If we are searching or filtering by category, don't show the featured post at the top
  const hideFeaturedSection = !!debouncedSearch || activeCategory !== "all";

  return (
    <div className="flex-1 overflow-auto bg-background" data-testid="blogs-page">
      <div className="max-w-7xl mx-auto px-6 py-8">
        
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">Financial Intelligence</h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Curated insights, strategies, and deep dives to help you master your money and build wealth.
            </p>
          </div>
          <Button 
             onClick={() => setIsCreateModalOpen(true)}
             className="gap-2 self-start md:self-auto shadow-sm"
          >
             <PenLine className="w-4 h-4" />
             Write a Post
          </Button>
        </header>

        {/* Featured Post Hero (Hidden when searching/filtering) */}
        {!hideFeaturedSection && (
          <div className="mb-12">
            {isLoadingFeatured ? (
               <Skeleton className="w-full h-[400px] rounded-2xl" />
            ) : featuredPost ? (
               <BlogCard post={featuredPost} featured={true} />
            ) : null}
          </div>
        )}

        {/* Filters and Search */}
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md pt-4 pb-6 mb-8 border-b border-border/50 flex flex-col md:flex-row justify-between items-center gap-4">
          
          <div className="flex flex-wrap gap-2 overflow-x-auto no-scrollbar pb-2 md:pb-0 w-full md:w-auto flex-nowrap md:flex-wrap">
            <Button
              variant={activeCategory === "all" ? "default" : "secondary"}
              size="sm"
              className="rounded-full shrink-0"
              onClick={() => setActiveCategory("all")}
            >
              All Topics
            </Button>
            {categoriesData?.categories?.map((c) => (
              <Button
                key={c.category}
                variant={activeCategory === c.category ? "default" : "secondary"}
                size="sm"
                className="rounded-full shrink-0"
                onClick={() => setActiveCategory(c.category)}
              >
                {c.category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                <span className="ml-2 opacity-50 text-[10px] bg-background/20 px-1.5 rounded-full">{c.count}</span>
              </Button>
            ))}
          </div>

          <div className="relative w-full md:w-64 lg:w-80 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search articles..."
              className="pl-9 bg-muted/50 border-none rounded-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Blog Grid */}
        {isLoadingBlogs ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex flex-col space-y-3">
                <Skeleton className="h-[200px] w-full rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : blogsData?.posts?.length === 0 ? (
          <div className="text-center py-20 bg-muted/20 rounded-2xl border border-dashed border-border">
            <h3 className="text-xl font-semibold mb-2">No articles found</h3>
            <p className="text-muted-foreground">Try adjusting your filters or search terms.</p>
            {(activeCategory !== "all" || searchQuery) && (
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => {
                  setActiveCategory("all");
                  setSearchQuery("");
                }}
              >
                Clear Filters
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
            {blogsData?.posts?.map((post) => (
              <motion.div key={post._id} variants={itemVariants}>
                <BlogCard post={post} />
              </motion.div>
            ))}
          </motion.div>
        )}

      </div>
      
      {/* Create Blog Modal */}
      <CreateBlogForm open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} />
      
    </div>
  );
}
