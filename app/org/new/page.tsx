"use client";

import { apiRequest, readJson } from "@/lib/api/client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewOrgPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const ein = formData.get("ein") as string;
    const website = formData.get("website") as string;
    const description = formData.get("description") as string;

    try {
      const res = await apiRequest("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ein, website, description }),
      });

      const data = await readJson(res);

      if (!res.ok) {
        throw new Error(data.error || "Failed to create organization");
      }

      router.push(`/org/${data.id}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto py-8">
      <div className="mb-6">
        <Link href="/org" className="text-azure hover:underline text-sm">
          &larr; Back to organizations
        </Link>
      </div>

      <div className="card p-6">
        <h1 className="text-2xl font-semibold mb-6">Create Organization</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Organization Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              className="w-full px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50"
              placeholder="Your Organization"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">EIN (Optional)</label>
            <input
              type="text"
              name="ein"
              pattern="[0-9]{2}-[0-9]{7}"
              className="w-full px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50"
              placeholder="XX-XXXXXXX"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Employer Identification Number (format: XX-XXXXXXX)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Website (Optional)</label>
            <input
              type="url"
              name="website"
              className="w-full px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50"
              placeholder="https://yourorg.org"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description (Optional)</label>
            <textarea
              name="description"
              rows={3}
              className="w-full px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 resize-none"
              placeholder="Brief description of your organization..."
            />
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Organization"}
            </button>
          </div>
        </form>

        <p className="text-xs text-neutral-500 mt-4 text-center">
          You will be the admin of this organization and can invite others.
        </p>
      </div>
    </div>
  );
}
