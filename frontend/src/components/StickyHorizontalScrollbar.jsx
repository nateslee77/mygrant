import { useEffect, useRef, useState } from "react";

// A horizontal scrollbar pinned to the bottom of the browser viewport, kept in
// sync with a wide scrollable element (e.g. a data table) that's taller than
// the screen. Solves the classic "native scrollbar is scrolled out of view"
// problem: the real scrollbar lives at the bottom of the table's content,
// which can be far below the fold, so this renders a second one that always
// tracks the table's on-screen position and stays reachable.
export default function StickyHorizontalScrollbar({ targetRef }) {
  const phantomRef = useRef(null);
  const syncingRef = useRef(false);
  const [metrics, setMetrics] = useState(null); // { left, width, contentWidth } or null when not needed

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    function measure() {
      const el = targetRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const overflows = el.scrollWidth > el.clientWidth + 1;
      const inView = rect.top < window.innerHeight && rect.bottom > 0;
      if (overflows && inView) {
        setMetrics({ left: rect.left, width: rect.width, contentWidth: el.scrollWidth });
      } else {
        setMetrics(null);
      }
    }

    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(target);

    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [targetRef]);

  useEffect(() => {
    const target = targetRef.current;
    const phantom = phantomRef.current;
    if (!target || !phantom) return;

    function onTargetScroll() {
      if (syncingRef.current) return;
      syncingRef.current = true;
      phantom.scrollLeft = target.scrollLeft;
      syncingRef.current = false;
    }
    function onPhantomScroll() {
      if (syncingRef.current) return;
      syncingRef.current = true;
      target.scrollLeft = phantom.scrollLeft;
      syncingRef.current = false;
    }

    target.addEventListener("scroll", onTargetScroll);
    phantom.addEventListener("scroll", onPhantomScroll);
    return () => {
      target.removeEventListener("scroll", onTargetScroll);
      phantom.removeEventListener("scroll", onPhantomScroll);
    };
  }, [targetRef, metrics !== null]);

  if (!metrics) return null;

  return (
    <div
      ref={phantomRef}
      className="fixed bottom-0 z-40 overflow-x-auto overflow-y-hidden bg-white border-t border-gray-200"
      style={{ left: metrics.left, width: metrics.width, height: 14 }}
      aria-hidden="true"
    >
      <div style={{ width: metrics.contentWidth, height: 1 }} />
    </div>
  );
}
