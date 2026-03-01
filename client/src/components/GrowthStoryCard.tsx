import { motion } from "framer-motion";
import { Link } from "wouter";
import { Clock, Eye, Heart, MapPin, Target } from "lucide-react";
import { IGrowthStory } from "@/types/apiTypes";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
export interface GrowthStoryCardProps {
  story: IGrowthStory;
  featured?: boolean;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  'beginner': 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20',
  'intermediate': 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
  'advanced': 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20',
};

const CATEGORY_COLORS: Record<string, string> = {
  'debt-freedom': 'bg-chart-4 text-chart-4-foreground',
  'wealth-building': 'bg-chart-2 text-chart-2-foreground',
  'early-retirement': 'bg-chart-1 text-chart-1-foreground',
  'side-hustle': 'bg-chart-3 text-chart-3-foreground',
  'tax-optimization': 'bg-chart-5 text-chart-5-foreground',
  'family-finance': 'bg-chart-1/80 text-chart-1-foreground',
  'student-finance': 'bg-chart-4/80 text-chart-4-foreground',
};

export function GrowthStoryCard({ story, featured = false }: GrowthStoryCardProps) {
  const netWorthDiff = (story.financialMetrics?.currentNetWorth || 0) - (story.financialMetrics?.startingNetWorth || 0);
  const formatCompactCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value <= -100000) return `-₹${(Math.abs(value) / 100000).toFixed(1)}L`;
    return `₹${(value / 1000).toFixed(0)}K`;
  };

  if (featured) {
    return (
      <Link href={`/growth-stories/${story.slug}`}>
        <motion.div
           whileHover={{ y: -5 }}
           className="group cursor-pointer rounded-3xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-xl transition-all duration-300"
        >
          <div className="grid grid-cols-1 md:grid-cols-5 h-full">
            {/* Image Section */}
            <div className="md:col-span-2 relative h-64 md:h-full overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-r from-background/10 to-transparent z-10" />
               <img 
                 src={story.coverImage} 
                 alt={story.title}
                 className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
               />
               <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
                 <Badge className={`${CATEGORY_COLORS[story.category]} shadow-md`}>
                    {story.category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                 </Badge>
                 <Badge variant="outline" className={`${DIFFICULTY_COLORS[story.difficulty]} backdrop-blur-md`}>
                    {story.difficulty.charAt(0).toUpperCase() + story.difficulty.slice(1)}
                 </Badge>
               </div>
            </div>

            {/* Content Section */}
            <div className="md:col-span-3 p-6 md:p-8 flex flex-col justify-center">
               <div className="flex items-center space-x-2 text-sm text-primary font-medium mb-3">
                 <Target className="w-4 h-4" />
                 <span>Featured Transformation</span>
               </div>
               
               <h3 className="text-2xl md:text-3xl font-extrabold mb-4 leading-tight group-hover:text-primary transition-colors">
                 {story.title}
               </h3>
               
               <p className="text-muted-foreground mb-6 line-clamp-2 text-lg">
                 {story.summary}
               </p>

               {/* Metrics Highlight */}
               <div className="bg-muted/30 rounded-2xl p-4 mb-6 border border-border/50 flex flex-wrap gap-4 md:gap-8 justify-between items-center group-hover:bg-primary/5 transition-colors">
                  <div className="flex flex-col">
                     <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">Starting Point</span>
                     <span className="text-lg md:text-xl font-bold font-mono">
                        {formatCompactCurrency(story.financialMetrics?.startingNetWorth || 0)}
                     </span>
                  </div>
                  <div className="hidden sm:flex self-center">
                     <span className="text-xl text-primary animate-pulse">→</span>
                  </div>
                  <div className="flex flex-col">
                     <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">Current Net Worth</span>
                     <span className="text-lg md:text-xl font-bold font-mono text-primary">
                        {formatCompactCurrency(story.financialMetrics?.currentNetWorth || 0)}
                     </span>
                  </div>
                  <div className="flex flex-col mt-4 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-t-0 sm:border-l border-border/50 sm:pl-8 w-full sm:w-auto">
                     <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">Timeline</span>
                     <span className="text-lg md:text-xl font-bold flex items-center">
                        <Clock className="w-4 h-4 mr-2 text-muted-foreground" />
                        {story.timeline}
                     </span>
                  </div>
               </div>

               {/* Meta Info */}
               <div className="flex flex-wrap items-center justify-between gap-4 mt-auto">
                 <div className="flex items-center space-x-1.5 text-sm font-medium">
                   <div className="bg-primary/10 p-1.5 rounded-full">
                       <span className="text-lg mx-1">👤</span>
                   </div>
                   <span>{story.persona}</span>
                   <span className="text-muted-foreground flex items-center before:content-['•'] before:mx-2">
                       <MapPin className="w-3.5 h-3.5 mr-1" /> {story.location}
                   </span>
                 </div>
               </div>
            </div>
          </div>
        </motion.div>
      </Link>
    );
  }

  // Standard Card
  return (
    <Link href={`/growth-stories/${story.slug}`}>
      <motion.div whileHover={{ y: -4 }}>
        <Card className="h-full flex flex-col overflow-hidden group cursor-pointer border-border hover:shadow-lg transition-all duration-300">
           {/* Image & Metric Overlay */}
           <div className="relative h-48 overflow-hidden">
             <img 
               src={story.coverImage} 
               alt={story.title}
               className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
             />
             <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
             
             {/* Top badges */}
             <div className="absolute top-3 left-3 flex gap-2">
               <Badge className={`${CATEGORY_COLORS[story.category]} shadow-sm text-[10px] px-2 py-0`}>
                 {story.category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
               </Badge>
             </div>
             <div className="absolute top-3 right-3">
                 <Badge variant="outline" className={`${DIFFICULTY_COLORS[story.difficulty]} text-[10px] px-2 py-0 bg-background/80 backdrop-blur-sm`}>
                     {story.difficulty.charAt(0).toUpperCase() + story.difficulty.slice(1)}
                 </Badge>
             </div>

             {/* Bottom metrics on image */}
             <div className="absolute bottom-3 left-3 pr-3 text-white">
                <div className="flex items-end space-x-2">
                    <span className="text-2xl font-bold font-mono tracking-tighter leading-none group-hover:text-primary transition-colors">
                       {netWorthDiff > 0 ? '+' : ''}{formatCompactCurrency(netWorthDiff)}
                    </span>
                    <span className="text-xs opacity-80 pb-0.5">NW Growth</span>
                </div>
             </div>
           </div>

           <CardHeader className="p-5 pb-2">
              <div className="flex items-center text-xs text-muted-foreground mb-2 space-x-3">
                 <span className="flex items-center"><MapPin className="w-3 h-3 mr-1" /> {story.location}</span>
                 <span className="flex items-center"><Clock className="w-3 h-3 mr-1" /> {story.timeline}</span>
              </div>
              <h3 className="text-xl font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                 {story.title}
              </h3>
           </CardHeader>

           <CardContent className="p-5 pt-0 flex-1">
              <p className="text-muted-foreground text-sm line-clamp-2 mb-4">
                 {story.summary}
              </p>
              
              {/* Strategies Chips */}
              <div className="flex flex-wrap gap-1.5 mt-auto">
                 {story.strategies?.slice(0, 2).map(strategy => (
                    <span key={strategy} className="text-[10px] bg-secondary text-secondary-foreground px-2 py-1 rounded-md border border-border/50">
                       {strategy}
                    </span>
                 ))}
                 {story.strategies?.length > 2 && (
                    <span className="text-[10px] bg-muted text-muted-foreground px-2 py-1 rounded-md">
                       +{story.strategies.length - 2} more
                    </span>
                 )}
              </div>
           </CardContent>

           <CardFooter className="p-4 pt-3 border-t border-border/50 bg-muted/10 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2 font-medium">
                 <span>👤</span>
                 <span className="truncate max-w-[120px]">{story.persona}</span>
              </div>
              
              <div className="flex items-center text-muted-foreground space-x-3">
                  <span className="flex items-center"><Eye className="w-3.5 h-3.5 mr-1" />{story.views}</span>
                  <span className="flex items-center"><Heart className="w-3.5 h-3.5 mr-1" />{story.likes}</span>
              </div>
           </CardFooter>
        </Card>
      </motion.div>
    </Link>
  );
}
