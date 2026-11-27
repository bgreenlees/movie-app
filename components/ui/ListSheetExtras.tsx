"use client";

interface ListSheetExtrasProps {
  /** Only for a title that is already on a list. */
  onRemove?: () => void;
  onNotForMe: () => void;
  /** The title is already marked "Not for me": the item then undoes it. */
  notForMe?: boolean;
  disabled?: boolean;
}

const item =
  "flex w-full min-h-11 cursor-pointer items-center gap-2 rounded-control px-3 text-left text-sm font-medium hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The items under the list choices in the Add / Update sheet: a divider, then
 * "Not for me" and (when on a list) "Remove from my list". They used to live in
 * the poster's ⋯ menu.
 */
export default function ListSheetExtras({ onRemove, onNotForMe, notForMe = false, disabled }: ListSheetExtrasProps) {
  return (
    <div role="group" aria-label="More options" className="mt-2 border-t border-border pt-2">
      <button type="button" onClick={onNotForMe} disabled={disabled} aria-pressed={notForMe} className={`${item} text-text`}>
        <span aria-hidden="true" className="w-4 text-center">✕</span>
        {notForMe ? "Marked not for me (undo)" : "Not for me"}
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} disabled={disabled} className={`${item} text-danger`}>
          <span aria-hidden="true" className="w-4 text-center">🗑</span>
          Remove from my list
        </button>
      )}
    </div>
  );
}
