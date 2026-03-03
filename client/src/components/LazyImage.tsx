import { useState, useEffect, useRef, type ImgHTMLAttributes } from "react";

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
  /** IntersectionObserver rootMargin for pre-loading near viewport */
  rootMargin?: string;
}

export function LazyImage({
  src,
  placeholderSrc,
  rootMargin = "200px",
  alt = "",
  className = "",
  style,
  ...rest
}: LazyImageProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

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
      {!isLoaded && (
        <div className="absolute inset-0 bg-muted animate-pulse rounded-inherit" />
      )}

      {/* Blur-up placeholder */}
      {placeholderSrc && !isLoaded && (
        <img
          src={placeholderSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover blur-lg scale-105"
        />
      )}

      {/* Actual image */}
      {isVisible && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setIsLoaded(true)}
          className={`w-full h-full object-cover transition-opacity duration-500 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
          loading="lazy"
          decoding="async"
          {...rest}
        />
      )}
    </div>
  );
}
