"use client";

import { uploadJson } from "@/lib/api/client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Holding {
  id: string;
  name: string | null;
  portfolio_id: string | null;
}

interface Props {
  orgId: string;
  holdings: Holding[];
}

export default function OrgReportUploader({ orgId, holdings }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [holdingId, setHoldingId] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [factsCount, setFactsCount] = useState(0);
  const [aiMode, setAiMode] = useState(true);

  const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !holdingId) return;

    if (file.size > MAX_FILE_SIZE) {
      setStatus("error");
      setMsg(`File too large. Maximum size is 200MB, but your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`);
      return;
    }

    setStatus("uploading");
    setMsg("Processing document... This may take a moment for large files.");
    setFactsCount(0);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("holding_id", holdingId);
      fd.append("ai_mode", aiMode ? "true" : "false");

      const data = await uploadJson<any>(`/api/org/${orgId}/upload`, fd, { method: "POST" });

      setFactsCount(data.factsExtracted || 0);
      setStatus("done");
      setMsg(
        data.factsExtracted > 0
          ? `Extracted ${data.factsExtracted} metrics. Pending portfolio owner approval.`
          : data.message || "No metrics found in document."
      );

      router.refresh();
    } catch (err: any) {
      setStatus("error");
      setMsg(err?.message || "Upload failed");
    }
  }

  function reset() {
    setFile(null);
    setStatus("idle");
    setMsg("");
    setFactsCount(0);
  }

  const disabled = !file || !holdingId || status === "uploading";

  return (
    <div className="space-y-4">
      {/* AI mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-neutral-800">AI Mode</div>
          <div className="text-xs text-neutral-600">
            Extract any metrics found in the document
          </div>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <span className="text-sm text-neutral-700">Off</span>
          <input
            type="checkbox"
            checked={aiMode}
            onChange={(e) => setAiMode(e.target.checked)}
            className="h-5 w-9 appearance-none bg-neutral-200 rounded-full relative transition outline-none before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:shadow before:transition checked:bg-azure checked:before:translate-x-4"
          />
          <span className="text-sm text-neutral-700">On</span>
        </label>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        {/* Holding selector */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Holding <span className="text-red-500">*</span>
          </label>
          <select
            value={holdingId}
            onChange={(e) => setHoldingId(e.target.value)}
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

        {/* File drop zone */}
        <div
          className="flex flex-col items-center justify-center w-full p-6 border-2 border-dashed rounded-xl cursor-pointer hover:border-azure/50 bg-white text-center"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]);
          }}
        >
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.pdf,.docx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
            id="orgReportFileInput"
          />
          <label htmlFor="orgReportFileInput" className="cursor-pointer text-sm text-azure">
            {file
              ? `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`
              : "Click to choose a file or drag and drop here"}
          </label>
          <p className="text-xs text-neutral-500 mt-1">
            CSV, XLSX, XLS, PDF, or DOCX (up to 200MB)
          </p>
        </div>

        <button
          disabled={disabled}
          className="px-5 py-2.5 rounded-md bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 disabled:opacity-50 transition"
        >
          {status === "uploading" ? "Processing..." : "Upload Report"}
        </button>
      </form>

      {/* Processing indicator */}
      {status === "uploading" && (
        <div className="p-4 rounded-2xl bg-azure/5 border border-azure/20 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-azure border-t-transparent rounded-full animate-spin" />
            <div className="flex-1">
              <div className="text-sm font-medium text-neutral-800">{msg}</div>
              <div className="text-xs text-neutral-500 mt-1">
                Large documents are split into sections and processed individually.
              </div>
            </div>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="text-sm text-red-600 p-3 rounded-lg bg-red-50 border border-red-200">
          {msg}
        </div>
      )}

      {status === "done" && (
        <div className="p-3 rounded-2xl bg-green-50 border border-green-200 flex items-center gap-3 flex-wrap">
          <span>{msg}</span>
          <button onClick={reset} className="text-sm underline font-medium text-azure">
            Upload Another
          </button>
        </div>
      )}

      <p className="text-xs text-neutral-500">
        Uploaded metrics will be reviewed by portfolio owners before appearing in dashboards.
      </p>
    </div>
  );
}
