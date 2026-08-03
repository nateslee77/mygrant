import { useState } from "react";

const PencilIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

export default function InlineEditField({ label, value, displayValue, editable, type = "text", onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft(value ?? "");
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft === "" ? null : draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="text-xs font-medium text-gray-500 mb-0.5">{label}</div>
      {!editing ? (
        <div className="flex items-center gap-2 group min-h-[26px]">
          <span className="text-sm text-[#1F2937]">{displayValue ?? value ?? "—"}</span>
          {editable && (
            <button
              onClick={startEdit}
              className="text-gray-300 group-hover:text-gray-500 hover:text-accent"
              aria-label={`Edit ${label}`}
            >
              <PencilIcon />
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type={type}
            autoFocus
            value={draft ?? ""}
            onChange={(e) => setDraft(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs font-medium text-white bg-accent hover:bg-accent-dark rounded px-2 py-1 disabled:opacity-60"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
