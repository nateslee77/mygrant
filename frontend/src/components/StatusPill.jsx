const STYLES = {
  Active: "bg-status-active/10 text-status-active",
  Closed: "bg-status-closed/10 text-status-closed",
  Withdrawn: "bg-status-withdrawn/10 text-status-withdrawn",
};

export default function StatusPill({ status }) {
  const cls = STYLES[status] || STYLES.Closed;
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}
