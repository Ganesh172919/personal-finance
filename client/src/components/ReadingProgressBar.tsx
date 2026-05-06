/**
 * @fileoverview ReadingProgressBar — thin fixed bar at the top of the viewport that
 * fills left-to-right as the user scrolls down the page.
 *
 * WHAT IT DOES
 *  - Attaches a passive scroll listener to `window` and calculates the percentage
 *    of the document that has been scrolled.
 *  - Renders a 1.5-unit-high bar (`bg-primary`) whose width is driven by `progress%`.
 *  - Cleans up the listener on unmount.
 *
 * KEY PROPS & DATA FLOW
 *  - No props — entirely self-contained.
 *  - Internal state: `progress` (0-100).
 *
 * ARCHITECTURE NOTES
 *  - Used on long-form content pages (blogs, growth stories) to give readers a sense
 *    of how far they've progressed through the article.
 *  - Uses `position: fixed; top: 0; z-index: 50` so it overlays all page content.
 *  - Passive scroll listener ensures no scroll-performance penalty.
 */
import { useEffect, useState } from 'react';

export function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      
      const scrollableHeight = documentHeight - windowHeight;
      const scrolledPercentage = (scrollTop / scrollableHeight) * 100;
      
      setProgress(scrolledPercentage);
    };

    // Use passive listener for better performance
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Initial call in case we load halfway down
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="fixed top-0 left-0 w-full h-1.5 bg-border/50 z-50">
      <div 
        className="h-full bg-primary transition-all duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
