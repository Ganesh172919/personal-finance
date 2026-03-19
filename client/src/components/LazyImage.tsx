import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

/**
 * LazyImage — loads images only when they enter the viewport.
 *
 * Uses IntersectionObserver for visibility detection and shows
 * a placeholder shimmer until the image has loaded. Supports
 * blur-up transition for a premium feel.
 */

interface LazyImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string;
  /** Optional low-res placeholder for blur-up effect */
  placeholderSrc?: string;
  /** Optional fallback source when the main image fails */
  fallbackSrc?: string;
  /** IntersectionObserver rootMargin for pre-loading near viewport */
  rootMargin?: string;
  /** Optional classes applied directly to the image */
  imageClassName?: string;
}

export function LazyImage({
  src,
  placeholderSrc,
  fallbackSrc,
  rootMargin = "200px",
  alt = "",
  className = "",
  imageClassName = "",
  style,
  ...rest
}: LazyImageProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [showFallbackSurface, setShowFallbackSurface] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentSrc(src);
    setIsLoaded(false);
    setShowFallbackSurface(false);
  }, [src]);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div
      ref={imgRef}
      className={`relative overflow-hidden ${className}`}
      style={style}
    >
      {/* Shimmer placeholder */}
      {!isLoaded && !showFallbackSurface && (
        <div className="absolute inset-0 bg-muted animate-pulse rounded-inherit" />
      )}

      {/* Blur-up placeholder */}
      {placeholderSrc && !isLoaded && !showFallbackSurface && (
        <img
          src={placeholderSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover blur-lg scale-105"
        />
      )}

      {/* Actual image */}
      {isVisible && currentSrc && (
        <img
          src={currentSrc}
          alt={alt}
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            if (fallbackSrc && currentSrc !== fallbackSrc) {
              setCurrentSrc(fallbackSrc);
              setIsLoaded(false);
              return;
            }

            setShowFallbackSurface(true);
            setIsLoaded(true);
          }}
          className={`w-full h-full object-cover transition-opacity duration-500 ${
            isLoaded ? "opacity-100" : "opacity-0"
          } ${imageClassName}`}
          loading="lazy"
          decoding="async"
          {...rest}
        />
      )}

      {showFallbackSurface ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-muted via-muted/80 to-accent/70"
        />
      ) : null}
    </div>
  );
}
