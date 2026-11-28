"use client";

import { useEffect, useRef, useState } from "react";
import { columnsFromTemplate } from "./pairPicks";

/**
 * Measures how many columns a CSS grid currently lays out (the poster grid is
 * `auto-fill`, so it depends on the viewport). Attach `ref` to an element with
 * the grid classes; it re-measures whenever that element is resized.
 * Returns `fallback` until measured (and where ResizeObserver doesn't exist).
 */
export function useGridColumns(fallback = 3) {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const n = columnsFromTemplate(getComputedStyle(el).gridTemplateColumns);
      if (n > 0) setColumns(n);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, columns };
}
