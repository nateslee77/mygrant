import { useState } from "react";

const PROPERTY_DETAILS_URL =
  "https://assessorportal.assessor.lacounty.gov/webcenter/portal/assessorportal/pages_propertyDetails";
const OWNERSHIP_SNAPSHOT_URL =
  "https://assessorportal.assessor.lacounty.gov/webcenter/portal/assessorportal/Ownership+Snapshot";

function buildPropertyDetailsUrl(ain) {
  return `${PROPERTY_DETAILS_URL}?ain=${ain}&pType=R&searchType=A&stype=A`;
}

function buildOwnershipSnapshotUrl(ain) {
  return `${OWNERSHIP_SNAPSHOT_URL}?ain=${ain}&pType=R`;
}

export default function PropertyLookup() {
  const [ain, setAin] = useState("");

  const digitsOnly = ain.replace(/\D/g, "");
  const isValid = digitsOnly.length === 10;

  function handleAinChange(e) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
    setAin(digits);
  }

  function openLink(builder) {
    if (!isValid) return;
    window.open(builder(digitsOnly), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-500 mb-1">LA County Assessor Lookup</h2>
        <p className="text-sm text-gray-500 mb-4">
          Enter a 10-digit Assessor's Identification Number (AIN) to open the property's record on the LA County
          Assessor Portal. Requires you to already be signed into the county portal in this browser.
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1">AIN</label>
        <input
          type="text"
          inputMode="numeric"
          value={ain}
          onChange={handleAinChange}
          placeholder="8026005900"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
        />
        {ain.length > 0 && !isValid && (
          <p className="text-xs text-status-withdrawn mt-1">AIN must be exactly 10 digits ({digitsOnly.length}/10).</p>
        )}

        <div className="flex gap-3 mt-4">
          <button
            onClick={() => openLink(buildPropertyDetailsUrl)}
            disabled={!isValid}
            className="bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Property Details
          </button>
          <button
            onClick={() => openLink(buildOwnershipSnapshotUrl)}
            disabled={!isValid}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Ownership Snapshot
          </button>
        </div>
      </div>
    </div>
  );
}
