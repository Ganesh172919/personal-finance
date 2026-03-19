type InlineLoaderProps = {
  label?: string;
  className?: string;
};

export function InlineLoader({
  label = "Loading...",
  className = "",
}: InlineLoaderProps) {
  return (
    <div className={`flex items-center justify-center gap-3 py-10 text-sm text-muted-foreground ${className}`}>
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
      <span>{label}</span>
    </div>
  );
}
