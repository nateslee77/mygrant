import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

const EMPTY_FORM = {
  project_name: "",
  grantor: "",
  funding_source: "",
  grant_officer: "",
  scope: "",
  current_exp_date: "",
  orig_exp_date: "",
  amended_exp_date: "",
  grant_amount: "",
  grants_manager: "",
  program_manager: "",
  district: "",
  sharepoint_link: "",
};

const FIELDS = [
  { key: "project_name", label: "Project Name", required: true },
  { key: "grantor", label: "Grantor" },
  { key: "funding_source", label: "Funding Source / Grant Program" },
  { key: "grant_officer", label: "Grant Officer" },
  { key: "grants_manager", label: "Grants Manager" },
  { key: "program_manager", label: "Program Manager" },
  { key: "district", label: "District", type: "number" },
  { key: "current_exp_date", label: "Current Expiration Date", type: "date" },
  { key: "orig_exp_date", label: "Original Expiration Date", type: "date" },
  { key: "amended_exp_date", label: "Amended Expiration Date", type: "date" },
  { key: "grant_amount", label: "Grant Amount", type: "number" },
  { key: "sharepoint_link", label: "SharePoint Folder Link" },
];

export default function NewGrant() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.project_name.trim()) {
      setError("Project Name is required");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        district: form.district === "" ? null : parseInt(form.district, 10),
        grant_amount: form.grant_amount === "" ? null : parseFloat(form.grant_amount),
        current_exp_date: form.current_exp_date || null,
        orig_exp_date: form.orig_exp_date || null,
        amended_exp_date: form.amended_exp_date || null,
      };
      const { data } = await api.post("/grants", payload);
      navigate(`/grants/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create grant");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold text-[#1F2937]">New Grant</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FIELDS.map((f) => (
            <div key={f.key} className={f.key === "project_name" ? "sm:col-span-2" : ""}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {f.label}
                {f.required && <span className="text-status-withdrawn"> *</span>}
              </label>
              <input
                type={f.type || "text"}
                value={form[f.key]}
                onChange={(e) => setField(f.key, e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              />
            </div>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
          <textarea
            rows={4}
            value={form.scope}
            onChange={(e) => setField("scope", e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
          />
        </div>

        {error && <div className="text-sm text-status-withdrawn">{error}</div>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create Grant"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/grants")}
            className="text-sm font-medium text-gray-600 hover:text-gray-800 px-4 py-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
