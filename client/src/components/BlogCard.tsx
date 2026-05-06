/**
 * @fileoverview BlogCard — renders a blog post as either a large featured hero card
 * or a standard grid card, with cover image, category badge, author avatar, and engagement stats.
 *
 * WHAT IT DOES
 *  - When `featured=true`: renders a full-width hero with gradient overlay, large title,
 *    excerpt, author info, read time, views, and likes.
 *  - When `featured=false`: renders a compact card with cover image, category badge,
 *    title, excerpt, and footer with author + engagement stats.
 *  - Uses `LazyImage` for performant cover image loading and `formatDistanceToNow` for
 *    relative publish dates.
 *
 * KEY PROPS & DATA FLOW
 *  - `post` (IBlogPost) — the blog post data object.
 *  - `featured` (boolean) — toggles hero vs. grid layout.
 *  - `resolveBlogCoverImage` / `resolveAuthorAvatar` — media URL resolution helpers.
 *
 * ARCHITECTURE NOTES
 *  - Used on the /blogs listing page; featured variant appears at the top of the page.
 *  - Links to `/blogs/:slug` via wouter's `<Link>` for client-side navigation.
 *  - `CATEGORY_COLORS` maps nine blog categories to theme-aware background/text classes.
 */
import { motion } from "framer-motion";
import { Clock, Eye, Heart, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { IBlogPost } from "@/types/apiTypes";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { LazyImage } from "@/components/LazyImage";
import { resolveAuthorAvatar, resolveBlogCoverImage } from "@/lib/media";

interface BlogCardProps {
  post: IBlogPost;
  featured?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  'investing': 'bg-chart-1 text-chart-1-foreground',
  'budgeting': 'bg-chart-2 text-chart-2-foreground',
  'tax-planning': 'bg-chart-3 text-chart-3-foreground',
  'debt-management': 'bg-chart-4 text-chart-4-foreground',
  'retirement': 'bg-chart-5 text-chart-5-foreground',
  'insurance': 'bg-chart-1/80 text-chart-1-foreground',
  'real-estate': 'bg-chart-2/80 text-chart-2-foreground',
  'market-news': 'bg-chart-3/80 text-chart-3-foreground',
  'personal-growth': 'bg-chart-4/80 text-chart-4-foreground',
};

const getCategoryLabel = (cat: string) => {
    return cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function BlogCard({ post, featured = false }: BlogCardProps) {
  const publishedDate = post.publishedAt ? formatDistanceToNow(new Date(post.publishedAt), { addSuffix: true }) : '';
  const coverImage = resolveBlogCoverImage(post.coverImage);
  const authorAvatar = resolveAuthorAvatar(post.author.avatar, post.author.name);

  if (featured) {
    return (
      <Link href={`/blogs/${post.slug}`}>
        <motion.div
          whileHover={{ y: -5 }}
          className="group block relative overflow-hidden rounded-2xl cursor-pointer"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/60 to-transparent z-10" />
          <LazyImage
            src={coverImage}
            fallbackSrc={coverImage}
            alt={post.title}
            className="h-[400px]"
            imageClassName="transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute bottom-0 left-0 w-full p-8 z-20 flex flex-col justify-end">
            <div className="flex items-center space-x-3 mb-4">
              <Badge className={CATEGORY_COLORS[post.category] || 'bg-primary'}>
                {getCategoryLabel(post.category)}
              </Badge>
              <div className="flex items-center text-white/80 text-sm font-medium">
                <TrendingUp className="w-4 h-4 mr-1" />
                Featured Post
              </div>
            </div>
            
            <h2 className="text-3xl font-bold text-white mb-3 leading-tight group-hover:text-primary transition-colors">
              {post.title}
            </h2>
            <p className="text-white/80 line-clamp-2 md:line-clamp-3 mb-6 max-w-3xl text-lg">
              {post.excerpt}
            </p>

            <div className="flex items-center justify-between mt-auto">
              <div className="flex items-center space-x-3">
                <Avatar className="h-10 w-10 border-2 border-white/20">
                  <AvatarImage src={authorAvatar} alt={post.author.name} />
                  <AvatarFallback>{post.author.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-white">{post.author.name}</p>
                  <p className="text-xs text-white/60">{publishedDate}</p>
                </div>
              </div>
              <div className="flex items-center space-x-4 text-xs text-white/80 font-medium hidden sm:flex">
                <span className="flex items-center"><Clock className="w-3.5 h-3.5 mr-1.5" /> {post.readTime} min read</span>
                <span className="flex items-center"><Eye className="w-3.5 h-3.5 mr-1.5" /> {post.views}</span>
                <span className="flex items-center"><Heart className="w-3.5 h-3.5 mr-1.5 text-red-400" /> {post.likes}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </Link>
    );
  }

  return (
    <Link href={`/blogs/${post.slug}`}>
      <motion.div whileHover={{ y: -4 }}>
        <Card className="h-full flex flex-col overflow-hidden group cursor-pointer border-border hover:shadow-lg transition-all duration-300 hover:border-border/80">
          <div className="relative h-48 overflow-hidden">
            <LazyImage
              src={coverImage}
              fallbackSrc={coverImage}
              alt={post.title}
              className="h-full"
              imageClassName="transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute top-4 left-4">
              <Badge className={`${CATEGORY_COLORS[post.category] || 'bg-primary'} shadow-sm`}>
                {getCategoryLabel(post.category)}
              </Badge>
            </div>
          </div>

          <CardHeader className="p-5 pb-0 flex-1">
            <h3 className="text-xl font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2 mb-2">
              {post.title}
            </h3>
            <p className="text-muted-foreground text-sm line-clamp-3">
              {post.excerpt}
            </p>
          </CardHeader>

          <CardFooter className="p-5 pt-4 border-t border-border/50 mt-4 bg-muted/20">
            <div className="flex items-center justify-between w-full">
               <div className="flex items-center space-x-2">
                 <Avatar className="h-8 w-8 border border-border">
                   <AvatarImage src={authorAvatar} alt={post.author.name} />
                   <AvatarFallback>{post.author.name.charAt(0)}</AvatarFallback>
                 </Avatar>
                 <div className="flex flex-col">
                    <span className="text-xs font-semibold text-foreground/90 leading-none">{post.author.name}</span>
                    <span className="text-[10px] text-muted-foreground mt-1">{publishedDate}</span>
                 </div>
               </div>
               
               <div className="flex items-center text-muted-foreground space-x-3 text-[11px] font-medium">
                  <span className="flex items-center"><Clock className="w-3 h-3 mr-1" />{post.readTime}m</span>
                  <span className="flex items-center"><Heart className="w-3 h-3 mr-1" />{post.likes}</span>
               </div>
            </div>
          </CardFooter>
        </Card>
      </motion.div>
    </Link>
  );
}
