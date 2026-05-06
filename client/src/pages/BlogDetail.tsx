/**
 * @fileoverview Single blog post detail view with markdown rendering.
 *
 * Fetches a blog post by slug (from the URL route) and renders it with
 * full markdown support (remark-gfm), a reading progress bar, like
 * button with optimistic cache update, share/copy link, and related
 * posts at the bottom.
 *
 * Key data flows:
 * - getBlogBySlug(slug) loads the post, author info, and metadata.
 * - toggleBlogLike(slug) increments the like count; the React Query
 *   cache is updated optimistically via setQueryData.
 *
 * Cover images and author avatars are resolved through resolveBlogCoverImage
 * and resolveAuthorAvatar helpers for CDN-aware URLs.
 *
 * Routed at /blogs/:slug; linked from the Blogs listing page.  Shows
 * a skeleton while loading and an error alert if the post is not found.
 */

import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, Eye, Heart, Share2, AlertCircle } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { getBlogBySlug, toggleBlogLike } from "@/lib/apiClient";
import { Button } from "@/components/ui/Button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/hooks/useToast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { ReadingProgressBar } from "@/components/ReadingProgressBar";
import { LazyImage } from "@/components/LazyImage";
import { resolveAuthorAvatar, resolveBlogCoverImage } from "@/lib/media";

const CATEGORY_COLORS: Record<string, string> = {
  'investing': 'bg-chart-1 text-chart-1-foreground',
  'budgeting': 'bg-chart-2 text-chart-2-foreground',
  'tax-planning': 'bg-chart-3 text-chart-3-foreground',
  'debt-management': 'bg-chart-4 text-chart-4-foreground',
  'retirement': 'bg-chart-5 text-chart-5-foreground',
};

const getCategoryLabel = (cat: string) => {
    return cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default function BlogDetail() {
  const [, params] = useRoute("/blogs/:slug");
  const slug = params?.slug;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLiked, setIsLiked] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["blog", slug],
    queryFn: () => getBlogBySlug(slug!),
    enabled: !!slug,
  });

  const likeMutation = useMutation({
    mutationFn: toggleBlogLike,
    onSuccess: (res) => {
      setIsLiked(true);
      // Optimistically update the cache
      queryClient.setQueryData(["blog", slug], (old: any) => {
          if (!old?.post) return old;
          return {
              ...old,
              post: { ...old.post, likes: res.likes }
          }
      });
    },
    onError: () => {
      toast({
        title: "Action failed",
        description: "Could not like the post.",
        variant: "destructive",
      });
    }
  });

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Link copied to clipboard",
      description: "You can now share it with others.",
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 w-full max-w-4xl mx-auto px-6 py-8">
        <Skeleton className="h-8 w-32 mb-8" />
        <Skeleton className="h-[400px] w-full rounded-2xl mb-8" />
        <div className="space-y-4 mb-8 max-w-2xl mx-auto">
           <Skeleton className="h-12 w-3/4" />
           <Skeleton className="h-6 w-1/2" />
        </div>
        <div className="space-y-4 max-w-2xl mx-auto">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    );
  }

  if (isError || !data?.post) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 h-full">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Post</AlertTitle>
          <AlertDescription>
             {error?.message || "We couldn't find the article you're looking for. It may have been removed or the URL is incorrect."}
          </AlertDescription>
        </Alert>
        <Link href="/blogs">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Blogs
          </Button>
        </Link>
      </div>
    );
  }

  const post = data.post;
  const publishedDate = post.publishedAt ? formatDistanceToNow(new Date(post.publishedAt), { addSuffix: true }) : '';
  const coverImage = resolveBlogCoverImage(post.coverImage);
  const authorAvatar = resolveAuthorAvatar(post.author.avatar, post.author.name);

  return (
    <div className="flex-1 overflow-auto bg-background relative" data-testid="blog-detail-page">
      <ReadingProgressBar />
      
      <div className="max-w-4xl mx-auto px-6 py-8">
        
        {/* Navigation */}
        <div className="mb-8">
          <Link href="/blogs">
            <Button variant="ghost" className="text-muted-foreground hover:text-foreground pl-0 group">
              <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
              Back to Articles
            </Button>
          </Link>
        </div>

        {/* Hero Section */}
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-10 text-center max-w-3xl mx-auto"
        >
          <div className="mb-6 flex justify-center">
            <Badge className={`${CATEGORY_COLORS[post.category] || 'bg-primary'} text-sm px-3 py-1 cursor-default shadow-sm hover:scale-105 transition-transform`}>
              {getCategoryLabel(post.category)}
            </Badge>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6 leading-tight max-w-2xl mx-auto">
            {post.title}
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8">
            {post.excerpt}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground border-y border-border py-4">
             <div className="flex items-center space-x-3">
               <Avatar className="h-10 w-10 border border-border">
                 <AvatarImage src={authorAvatar} alt={post.author.name} />
                 <AvatarFallback>{post.author.name.charAt(0)}</AvatarFallback>
               </Avatar>
               <div className="text-left leading-tight">
                  <p className="font-semibold text-foreground">{post.author.name}</p>
                  <p className="text-xs">{post.author.bio}</p>
               </div>
             </div>
             
             <div className="h-8 w-px bg-border hidden sm:block"></div>
             
             <div className="flex items-center gap-4">
                <span className="flex items-center"><Clock className="w-4 h-4 mr-1.5" />{post.readTime} min read</span>
                <span className="flex items-center"><Eye className="w-4 h-4 mr-1.5" />{post.views} views</span>
                <span className="flex items-center text-xs opacity-70 border bg-muted/40 px-2 py-0.5 rounded-full">{publishedDate}</span>
             </div>
          </div>
        </motion.div>

        {/* Cover Image */}
        <motion.div 
           initial={{ opacity: 0, scale: 0.95 }}
           animate={{ opacity: 1, scale: 1 }}
           transition={{ delay: 0.1 }}
           className="w-full relative aspect-video rounded-3xl overflow-hidden mb-12 shadow-xl border border-border/50"
        >
          <LazyImage
            src={coverImage}
            fallbackSrc={coverImage}
            alt={post.title}
            className="h-full"
          />
        </motion.div>

        {/* Article Body */}
        <div className="max-w-2xl mx-auto">
          <div className="prose prose-lg dark:prose-invert prose-headings:font-bold prose-a:text-primary hover:prose-a:text-primary/80 max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {post.content}
            </ReactMarkdown>
          </div>
          
          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
             <div className="mt-12 pt-6 border-t border-border flex flex-wrap gap-2">
                {post.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="font-normal opacity-80 cursor-default">
                        #{tag}
                    </Badge>
                ))}
             </div>
          )}

          {/* Engagement Footer */}
          <div className="mt-10 py-8 border-y border-border flex items-center justify-between">
            <Button 
                variant={isLiked ? "default" : "outline"} 
                size="lg" 
                className="rounded-full gap-2 shadow-sm"
                onClick={() => !isLiked && likeMutation.mutate(post._id)}
                disabled={likeMutation.isPending || isLiked}
            >
                <Heart className={`w-5 h-5 ${isLiked ? "fill-current text-white" : ""}`} /> 
                {isLiked ? 'Liked' : 'Helpful'} ({post.likes})
            </Button>
            
            <Button 
               variant="ghost" 
               size="lg" 
               className="rounded-full gap-2 hover:bg-muted"
               onClick={handleCopyLink}
            >
                <Share2 className="w-5 h-5" /> Copy Link
            </Button>
          </div>

          {/* Related Posts */}
          {post.relatedPosts && post.relatedPosts.length > 0 && (
            <div className="mt-16">
              <h3 className="text-2xl font-bold mb-6">Read Next</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                 {post.relatedPosts.slice(0, 2).map((relatedPost: any) => (
                     <Link key={relatedPost._id} href={`/blogs/${relatedPost.slug}`}>
                        <div className="group cursor-pointer bg-card hover:bg-muted/40 border border-border rounded-xl p-4 transition-all">
                           <div className="text-xs text-muted-foreground mb-2 flex justify-between">
                               <span>{relatedPost.category.split('-').join(' ')}</span>
                               <span>{relatedPost.readTime} min read</span>
                           </div>
                           <h4 className="font-semibold group-hover:text-primary line-clamp-2 transition-colors">{relatedPost.title}</h4>
                        </div>
                     </Link>
                 ))}
              </div>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}
