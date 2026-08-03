export function formatCurrency(value) {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}
