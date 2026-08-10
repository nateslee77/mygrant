export default function ExpiredBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 whitespace-nowrap"
      title="Past its expiration date but still open"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2 1 21h22L12 2zm0 6a1.2 1.2 0 0 1 1.2 1.2v5.2a1.2 1.2 0 0 1-2.4 0V9.2A1.2 1.2 0 0 1 12 8zm0 9.6a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z" />
      </svg>
      Expired
    </span>
  );
}
