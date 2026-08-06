export default function OpenLinkButton({ url, label = "Open ↗", size = "sm", className = "" }) {
  if (!url) return null;

  const sizeClasses = size === "sm" ? "text-xs px-3 py-1" : "text-sm px-4 py-1.5";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 bg-accent hover:bg-accent-dark text-white font-medium rounded-md whitespace-nowrap ${sizeClasses} ${className}`}
    >
      {label}
    </a>
  );
}
