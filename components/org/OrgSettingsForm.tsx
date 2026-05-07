"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Organization {
  id: string;
  name: string;
  ein: string | null;
  website: string | null;
  description: string | null;
  logo_url: string | null;
}

interface Props {
  org: Organization;
  isAdmin: boolean;
}

export default function OrgSettingsForm({ org, isAdmin }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const ein = formData.get("ein") as string;
    const website = formData.get("website") as string;
    const description = formData.get("description") as string;

    try {
      const res = await fetch(`/api/org/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ein, website, description }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update organization");
      }

      setSuccess(true);
      router.refresh();

      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          Settings updated successfully!
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Organization Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="name"
            defaultValue={org.name}
            required
            disabled={!isAdmin}
            className="w-full px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 disabled:bg-neutral-50 disabled:text-neutral-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">EIN</label>
          <input
            type="text"
            name="ein"
            defaultValue={org.ein || ""}
            pattern="[0-9]{2}-[0-9]{7}"
            disabled={!isAdmin}
            className="w-full px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 disabled:bg-neutral-50 disabled:text-neutral-500"
            placeholder="XX-XXXXXXX"
          />
          <p className="text-xs text-neutral-500 mt-1">
            Employer Identification Number (format: XX-XXXXXXX)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Website</label>
          <input
            type="url"
            name="website"
            defaultValue={org.website || ""}
            disabled={!isAdmin}
            className="w-full px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 disabled:bg-neutral-50 disabled:text-neutral-500"
            placeholder="https://yourorg.org"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Logo URL</label>
          <input
            type="url"
            name="logo_url"
            defaultValue={org.logo_url || ""}
            disabled={!isAdmin}
            className="w-full px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 disabled:bg-neutral-50 disabled:text-neutral-500"
            placeholder="https://yourorg.org/logo.png"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          name="description"
          defaultValue={org.description || ""}
          rows={3}
          disabled={!isAdmin}
          className="w-full px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 resize-none disabled:bg-neutral-50 disabled:text-neutral-500"
          placeholder="Brief description of your organization..."
        />
      </div>

      {isAdmin && (
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
      )}
    </form>
  );
}
