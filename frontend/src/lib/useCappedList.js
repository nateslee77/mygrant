import { useMemo, useState } from "react";

// Shared "show first N, then View All / Show less" behavior for any list/table
// on the dashboard or elsewhere. Resets to collapsed whenever the underlying
// item set changes (e.g. switching the expiring-grants window).
export function useCappedList(items, limit = 10) {
  const [expanded, setExpanded] = useState(false);

  const visibleItems = useMemo(() => {
    if (expanded || items.length <= limit) return items;
    return items.slice(0, limit);
  }, [items, limit, expanded]);

  return {
    visibleItems,
    expanded,
    hasMore: items.length > limit,
    remainingCount: Math.max(0, items.length - limit),
    toggle: () => setExpanded((e) => !e),
    collapse: () => setExpanded(false),
  };
}
