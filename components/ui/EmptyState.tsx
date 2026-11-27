import type { ReactNode } from "react";
import Link from "next/link";
import { primaryActionClass } from "@/components/ui/StatusPage";

interface EmptyStateProps {
  /** Decorative glyph/emoji or an SVG; hidden from screen readers. */
  icon: ReactNode;
  title: string;
  body?: string;
  /** Optional call to action: a link (`href`) or a button (`onClick`). */
  action?: { label: string; href?: string; onClick?: () => void };
}

/** Friendly "nothing here yet" block: icon, title, one line of help and an optional next step. */
export default function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 rounded-card border border-dashed border-border px-6 py-12 text-center">
      <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-2xl">
        {icon}
      </span>
      <h2 className="text-h2 text-text">{title}</h2>
      {body && <p className="text-meta text-muted">{body}</p>}
      {action &&
        (action.href ? (
          <Link href={action.href} className={`${primaryActionClass} mt-2 bg-accent`}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={`${primaryActionClass} mt-2 cursor-pointer bg-accent`}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
