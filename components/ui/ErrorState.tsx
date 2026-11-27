interface ErrorStateProps {
  title?: string;
  message?: string;
  /** When given, shows a Retry button that calls it. */
  onRetry?: () => void;
}

/** "Something went wrong" block with a Retry button, for failed fetches. */
export default function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this. Check your connection and try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div role="alert" className="mx-auto flex max-w-sm flex-col items-center gap-3 rounded-card border border-border bg-surface px-6 py-12 text-center">
      <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-2xl text-danger">
        !
      </span>
      <h2 className="text-h2 text-text">{title}</h2>
      <p className="text-meta text-muted">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 cursor-pointer rounded-control border border-border px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-2"
        >
          Retry
        </button>
      )}
    </div>
  );
}
