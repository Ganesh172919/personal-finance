import { motion } from "framer-motion";
import { Bell, ArrowRight, BookOpen, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

// Corrected Imports: All component imports now use PascalCase
import { getBlogs, getFeaturedGrowthStories } from "@/lib/apiClient";
import { BlogCard } from "@/components/BlogCard";
import { GrowthStoryCard } from "@/components/GrowthStoryCard";
import { IBlogPost, IGrowthStory } from "@/types/apiTypes";

// Corrected Imports: All component imports now use PascalCase
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/ThemeProvider";
import { AICommandBar } from "@/components/AiCommandBar";
import { FinancialVitals } from "@/components/FinancialVitals";
import { ActionableInsights } from "@/components/ActionableInsights";

import { InvestmentPortfolio } from "@/components/InvestmentPortfolio";
import { SpendingAnalysis } from "@/components/SpendingAnalysis";
import { GoalProgress } from "@/components/GoalProgress";
import { QuickActions } from "@/components/QuickActions";
import { RecentActivity } from "@/components/RecentActivity";
import { TasksWidget } from "@/components/TasksWidget";

export default function Dashboard() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const learningCourses = [
    {
      title: "SIP Investing 101",
      description: "Learn the basics of systematic investment planning",
      duration: "15 min read",
      gradient: "from-chart-1 to-chart-2",
      textColor: "text-chart-1",
    },
    {
      title: "Tax Optimization",
      description: "Maximize your savings through smart tax planning",
      duration: "20 min read",
      gradient: "from-chart-3 to-chart-4",
      textColor: "text-chart-3",
    },
    {
      title: "Emergency Planning",
      description: "Build a robust financial safety net",
      duration: "12 min read",
      gradient: "from-chart-2 to-chart-5",
      textColor: "text-chart-2",
    },
  ];

  return (
    <main className="flex-1 flex flex-col h-screen bg-background" data-testid="dashboard">
      {/* Header with AI Command Bar */}
      <header className="bg-card border-b border-border p-6 shadow-sm z-10 sticky top-0">
        <div className="flex items-center justify-between mb-4">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="text-2xl font-semibold text-foreground">
              {getGreeting()}, {user?.name?.split(" ")[0] || "User"}
            </h2>
            <p className="text-muted-foreground">
              Let's optimize your financial strategy today
            </p>
          </motion.div>
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              data-testid="button-notifications"
            >
              <Bell className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              data-testid="button-theme-toggle"
            >
              {theme === "dark" ? "🌙" : "☀️"}
            </Button>
          </div>
        </div>

        <AICommandBar />
      </header>

      {/* Dashboard Content */}
      <div className="flex-1 p-6 overflow-auto scroll-smooth">
        <div className="max-w-7xl mx-auto space-y-8">
        <FinancialVitals />

            {/* Main Layout Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                
                {/* Left Main Column */}
                <div className="xl:col-span-2 space-y-8">
                    <ActionableInsights />
                </div>

                {/* Right Sidebar Column */}
                <div className="space-y-8">
                    <QuickActions />
                    <TasksWidget />
                    <GoalProgress />
                    <RecentActivity />
                </div>
            </div>

            {/* Full Width Section */}
            <div className="space-y-8">
                 <InvestmentPortfolio />
                 <SpendingAnalysis />
            </div>

        {/* Financial Education Section */}
        <motion.div
          className="mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          data-testid="education-section"
        >
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-foreground">Continue Learning</h3>
              <Button
                variant="ghost"
                className="text-primary hover:text-primary/80 text-sm font-medium"
              >
                View All Courses
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {learningCourses.map((course, index) => (
                <motion.div
                  key={course.title}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 + 1.2 }}
                  className={`bg-gradient-to-br ${course.gradient} rounded-lg p-6 text-white relative overflow-hidden cursor-pointer`}
                  whileHover={{ scale: 1.05 }}
                  data-testid={`course-${course.title
                    .toLowerCase()
                    .replace(/\s/g, "-")}`}
                >
                  <div className="relative z-10">
                    <h4 className="font-semibold mb-2">{course.title}</h4>
                    <p className="text-sm opacity-90 mb-4">
                      {course.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs opacity-75">
                        {course.duration}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        className={`bg-white ${course.textColor} hover:bg-white/90`}
                      >
                        Start
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* --- Content Discovery Sections (Blogs & Growth Stories) --- */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mt-8">
            {/* Blogs Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
            >
              <Card className="p-6 h-full flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <BookOpen className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">Latest Insights</h3>
                  </div>
                  <Link href="/blogs">
                    <Button variant="ghost" className="text-primary hover:text-primary/80 group text-sm font-medium">
                      View all blogs <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                    </Button>
                  </Link>
                </div>
                
                <ContentPreviewSection type="blogs" />
              </Card>
            </motion.div>

            {/* Growth Stories Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
            >
              <Card className="p-6 h-full flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-chart-2/10 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-chart-2" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">Inspiring Journeys</h3>
                  </div>
                  <Link href="/growth-stories">
                    <Button variant="ghost" className="text-chart-2 hover:text-chart-2/80 group text-sm font-medium">
                      View all stories <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                    </Button>
                  </Link>
                </div>
                
                <ContentPreviewSection type="stories" />
              </Card>
            </motion.div>
        </div>
        </div>
      </div>
    </main>
  );
}

// Helper component for dashboard content previews
function ContentPreviewSection({ type }: { type: 'blogs' | 'stories' }) {
  const { data: blogData, isLoading: loadingBlogs } = useQuery({
    queryKey: ["blogs", "latest-preview"],
    queryFn: () => getBlogs({ limit: 2 }),
    enabled: type === 'blogs'
  });

  const { data: storyData, isLoading: loadingStories } = useQuery({
    queryKey: ["growth-stories", "featured-preview"],
    queryFn: () => getFeaturedGrowthStories(2),
    enabled: type === 'stories'
  });

  if (type === 'blogs') {
    if (loadingBlogs) return <div className="space-y-4">{[1, 2].map(i => <div key={i} className="h-40 bg-muted/50 rounded-xl animate-pulse" />)}</div>;
    
    return (
      <div className="space-y-4 flex-1">
        {blogData?.posts?.slice(0, 2).map((post: IBlogPost) => (
           <div key={post._id} className="relative group">
              <BlogCard post={post} />
              <Link href={`/blogs/${post.slug}`} className="absolute inset-0 z-10">
                 <span className="sr-only">Read {post.title}</span>
              </Link>
           </div>
        ))}
      </div>
    );
  }

  if (type === 'stories') {
    if (loadingStories) return <div className="space-y-4">{[1, 2].map(i => <div key={i} className="h-40 bg-muted/50 rounded-xl animate-pulse" />)}</div>;
    
    return (
      <div className="space-y-4 flex-1">
        {storyData?.stories?.slice(0, 2).map((story: IGrowthStory) => (
           <div key={story._id} className="relative group">
              <GrowthStoryCard story={story} />
              <Link href={`/growth-stories/${story.slug}`} className="absolute inset-0 z-10">
                 <span className="sr-only">Read {story.title}</span>
              </Link>
           </div>
        ))}
      </div>
    );
  }

  return null;
}
