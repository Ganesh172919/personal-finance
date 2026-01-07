import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Menu, X, Brain, Gauge, BookOpen, FileText, TrendingUp } from "lucide-react";
import { ChatContainer, ChatHistorySidebar } from "@/features/chat";
import { useChatStore } from "@/stores/chatStore";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/ThemeProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";

export default function ChatPage() {
  const params = useParams();
  const sessionId = params.sessionId as string | undefined;
  const { loadSessions } = useChatStore();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top Navigation Bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setShowMobileSidebar(!showMobileSidebar)}
          >
            {showMobileSidebar ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
          
          {/* Logo */}
          <Link href="/dashboard">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Brain className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold hidden sm:inline">Personal Finance</span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {/* Navigation Links */}
          <div className="flex items-center gap-2 mr-2">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="flex items-center gap-2 bg-transparent hover:bg-accent">
                <Gauge className="w-4 h-4" />
                <span className="hidden lg:inline">Dashboard</span>
              </Button>
            </Link>
            
            <Link href="/financial-story">
              <Button variant="ghost" size="sm" className="flex items-center gap-2 bg-transparent hover:bg-accent">
                <BookOpen className="w-4 h-4" /> 
                <span className="hidden lg:inline">Story</span>
              </Button>
            </Link>

            <Link href="/blogs">
              <Button variant="ghost" size="sm" className="flex items-center gap-2 bg-transparent hover:bg-accent">
                <FileText className="w-4 h-4" />
                <span className="hidden lg:inline">Blogs</span>
              </Button>
            </Link>

            <Link href="/growth-stories">
              <Button variant="ghost" size="sm" className="flex items-center gap-2 bg-transparent hover:bg-accent">
                <TrendingUp className="w-4 h-4" />
                <span className="hidden lg:inline">Learning</span>
              </Button>
            </Link>
          </div>

          {/* Theme Toggle */}
          <Button variant="ghost" size="sm" onClick={toggleTheme}>
            {theme === "dark" ? "🌙" : "☀️"}
          </Button>

          {/* User Profile */}
          <div className="flex items-center gap-2">
            <Avatar className="w-8 h-8">
              <AvatarImage src={user?.photoURL || ""} alt={user?.name || ""} />
              <AvatarFallback>{user?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="sm" onClick={logout} className="hidden sm:flex">
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat History Sidebar - Desktop */}
        <aside className="w-80 border-r border-border hidden lg:flex flex-col">
          <ChatHistorySidebar />
        </aside>

        {/* Mobile Sidebar Overlay */}
        {showMobileSidebar && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div 
              className="absolute inset-0 bg-black/50" 
              onClick={() => setShowMobileSidebar(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-80 bg-background border-r border-border shadow-lg">
              <ChatHistorySidebar onSessionSelect={() => setShowMobileSidebar(false)} />
            </aside>
          </div>
        )}

        {/* Chat Container */}
        <main className="flex-1 min-w-0 flex flex-col">
          <ChatContainer sessionId={sessionId} />
        </main>
      </div>
    </div>
  );
}
