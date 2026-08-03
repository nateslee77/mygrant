export default function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h3 className="text-base font-semibold text-[#1F2937] mb-3">{title}</h3>}
        {children}
      </div>
    </div>
  );
}
