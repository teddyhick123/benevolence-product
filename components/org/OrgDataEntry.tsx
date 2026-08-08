"use client";

import { apiRequest, readJson } from "@/lib/api/client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Holding {
  id: string;
  name: string | null;
  portfolio_id: string | null;
}

interface Metric {
  code: string;
  name: string;
  unit: string | null;
}

interface Props {
  orgId: string;
  holdings: Holding[];
  metrics: Metric[];
}

export default function OrgDataEntry({ orgId, holdings, metrics }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const holding_id = formData.get("holding_id") as string;
    const metric_code = formData.get("metric_code") as string;
    const value = parseFloat(formData.get("value") as string);
    const period_end = formData.get("period_end") as string;
    const period_start = formData.get("period_start") as string;
    const source = formData.get("source") as string;

    if (!holding_id || !metric_code || isNaN(value)) {
      setError("Please fill in all required fields");
      setLoading(false);
      return;
    }

    try {
      const res = await apiRequest(`/api/org/${orgId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holding_id,
          metric_code,
          value,
          period_start: period_start || null,
          period_end: period_end || null,
          source: source || null,
        }),
      });

      const data = await readJson(res);

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit metric");
      }

      setSuccess(true);
      (e.target as HTMLFormElement).reset();
      router.refresh();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const selectedMetric = metrics.find(
    (m) => m.code === (document.querySelector('[name="metric_code"]') as HTMLSelectElement)?.value
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          Metric submitted successfully! It will be visible after portfolio owner approval.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Holding */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Holding <span className="text-red-500">*</span>
          </label>
          <select
            name="holding_id"
            required
            className="w-full px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50"
          >
            <option value="">Select holding...</option>
            {holdings.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name || h.id}
              </option>
            ))}
          </select>
        </div>

        {/* Metric */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Metric <span className="text-red-500">*</span>
          </label>
          <select
            name="metric_code"
            required
            className="w-full px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50"
          >
            <option value="">Select metric...</option>
            {metrics.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name} {m.unit ? `(${m.unit})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Value */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Value <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            name="value"
            step="any"
            required
            className="w-full px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50"
            placeholder="Enter value"
          />
        </div>

        {/* Source */}
        <div>
          <label className="block text-sm font-medium mb-1">Source</label>
          <input
            type="text"
            name="source"
            className="w-full px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50"
            placeholder="e.g., Annual Report 2024"
          />
        </div>

        {/* Period Start */}
        <div>
          <label className="block text-sm font-medium mb-1">Period Start</label>
          <input
            type="date"
            name="period_start"
            className="w-full px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50"
          />
        </div>

        {/* Period End */}
        <div>
          <label className="block text-sm font-medium mb-1">Period End</label>
          <input
            type="date"
            name="period_end"
            className="w-full px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50"
          />
        </div>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? "Submitting..." : "Submit Metric"}
        </button>
        <p className="text-xs text-neutral-500 mt-2">
          Submitted metrics will appear in staging until approved by the portfolio owner.
        </p>
      </div>
    </form>
  );
}
