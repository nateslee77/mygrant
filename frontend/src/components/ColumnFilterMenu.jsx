import { useEffect, useRef, useState } from "react";

export default function ColumnFilterMenu({ options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = selected.length > 0;

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleValue(value) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <span className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`ml-1 align-middle ${active ? "text-accent" : "text-gray-400 hover:text-gray-600"}`}
        aria-label="Filter column"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-30 normal-case font-normal text-gray-700"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 text-xs">
            <button onClick={() => onChange(options)} className="text-accent hover:underline">
              Select all
            </button>
            <button onClick={() => onChange([])} className="text-accent hover:underline">
              Clear
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {options.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">No values</div>}
            {options.map((opt) => (
              <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggleValue(opt)}
                  className="rounded border-gray-300 text-accent focus:ring-accent"
                />
                <span className="truncate">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}
