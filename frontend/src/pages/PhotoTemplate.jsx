import { useState } from "react";
import { api } from "../lib/api";

const MAX_PHOTOS = 6;
const MIN_PHOTOS = 2;

export default function PhotoTemplate() {
  const [projectName, setProjectName] = useState("");
  const [status, setStatus] = useState("completed");
  const [photos, setPhotos] = useState([]); // [{ file, label, previewUrl }]
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const canAddMore = photos.length < MAX_PHOTOS;
  const isValid = projectName.trim().length > 0 && photos.length >= MIN_PHOTOS && photos.length <= MAX_PHOTOS;

  function handleFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow re-selecting the same file later
    const room = MAX_PHOTOS - photos.length;
    const toAdd = files.slice(0, room);
    const newPhotos = toAdd.map((file) => ({
      file,
      label: "",
      previewUrl: URL.createObjectURL(file),
    }));
    setPhotos((prev) => [...prev, ...newPhotos]);
    setError("");
  }

  function updateLabel(index, value) {
    setPhotos((prev) => prev.map((p, i) => (i === index ? { ...p, label: value } : p)));
  }

  function removePhoto(index) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleGenerate() {
    if (!isValid) return;
    setError("");
    setGenerating(true);
    try {
      const formData = new FormData();
      formData.append("project_name", projectName.trim());
      formData.append("status", status);
      photos.forEach((p) => {
        formData.append("photos", p.file);
        formData.append("labels", p.label);
      });

      const response = await api.post("/photo-template", formData, { responseType: "blob" });

      const disposition = response.headers["content-disposition"] || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `${projectName}_photos.docx`;

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      if (err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try {
          setError(JSON.parse(text).detail || "Failed to generate document");
        } catch {
          setError("Failed to generate document");
        }
      } else {
        setError(err.response?.data?.detail || "Failed to generate document");
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-1">Photo Summary Template</h2>
          <p className="text-sm text-gray-500">
            Upload 2–6 project photos to generate a downloadable landscape Word document with your photos centered
            in a table, labels, project status, and title — ready to save wherever you keep project records.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Val Verde Park Erosion Repair Project"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <div className="inline-flex rounded-md border border-gray-200 p-0.5 bg-gray-50">
            {[
              { label: "Completed", value: "completed" },
              { label: "In Progress", value: "in_progress" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className={`px-4 py-1.5 text-sm rounded font-medium ${
                  status === opt.value ? "bg-white shadow-sm text-accent-dark" : "text-gray-500"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">
              Photos ({photos.length}/{MAX_PHOTOS})
            </label>
            {canAddMore && (
              <label className="text-sm text-accent hover:underline font-medium cursor-pointer">
                + Add photos
                <input type="file" accept="image/*" multiple onChange={handleFilesSelected} className="hidden" />
              </label>
            )}
          </div>

          {photos.length === 0 && (
            <div className="border border-dashed border-gray-300 rounded-md py-8 text-center text-sm text-gray-400">
              No photos yet — add at least {MIN_PHOTOS}.
            </div>
          )}

          {photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.map((p, i) => (
                <div key={i} className="border border-gray-200 rounded-md overflow-hidden">
                  <div className="relative">
                    <img src={p.previewUrl} alt={`Photo ${i + 1}`} className="w-full h-28 object-cover" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 bg-white/90 hover:bg-white text-status-withdrawn rounded-full w-6 h-6 flex items-center justify-center text-sm shadow"
                      aria-label={`Remove photo ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                  <input
                    type="text"
                    value={p.label}
                    onChange={(e) => updateLabel(i, e.target.value)}
                    placeholder="Label (optional)"
                    className="w-full text-xs px-2 py-1.5 border-t border-gray-200 focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <div className="text-sm text-status-withdrawn">{error}</div>}

        <button
          onClick={handleGenerate}
          disabled={!isValid || generating}
          className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {generating ? "Generating…" : "Generate & Download"}
        </button>
      </div>
    </div>
  );
}
