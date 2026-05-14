import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase";
import { parseDocumentChunked } from "@/lib/document-parser";
import { extractFactsFromText } from "@/lib/ai/document-extractor";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for large file processing

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

function deduplicateFacts(facts: any[]): any[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.metric_code}|${fact.period_end || ""}|${fact.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// POST /api/org/[orgId]/upload - Upload a report
export async function POST(req: NextRequest, { params }: RouteParams) {
  const adminClient = createAdminClient();
  let uploadId: string | undefined;

  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    // Check edit access
    const { data: canEdit } = await supabase.rpc("can_edit_org", { p_org_id: orgId });
    if (!canEdit) {
      return NextResponse.json({ error: "Not authorized to upload" }, { status: 403 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Parse form data
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const holding_id = form.get("holding_id") as string;
    const aiMode = ((form.get("ai_mode") as string) ?? "true") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!holding_id) {
      return NextResponse.json({ error: "holding_id is required" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is 200MB, but your file is ${(
            file.size /
            (1024 * 1024)
          ).toFixed(1)}MB.`,
        },
        { status: 400 }
      );
    }

    // Verify the holding belongs to this org.
    const { data: holding } = await supabase
      .from("holdings")
      .select("id, portfolio_id")
      .eq("org_id", orgId)
      .eq("id", holding_id)
      .is("deleted_at", null)
      .single();

    if (!holding) {
      return NextResponse.json(
        { error: "Holding does not belong to this organization" },
        { status: 400 }
      );
    }

    const portfolioId = holding.portfolio_id;

    // Create upload record
    const fileName = file.name;
    const ext = fileName.split(".").pop() || "";

    const { data: upload, error: uploadError } = await adminClient
      .from("uploads")
      .insert({
        org_id: orgId,
        portfolio_id: portfolioId,
        uploaded_by: user.id,
        filename: fileName,
        original_name: fileName,
        storage_path: `org/${orgId}/uploads/${crypto.randomUUID()}-${fileName}`,
        mime_type: file.type || null,
        size_bytes: file.size,
        file_name: fileName,
        file_ext: ext,
        status: "processing",
        holding_id,
        ai_mode: aiMode,
      })
      .select()
      .single();

    if (uploadError || !upload) {
      return NextResponse.json(
        { error: uploadError?.message || "Failed to create upload record" },
        { status: 500 }
      );
    }

    uploadId = upload.id;

    if (!aiMode) {
      // Non-AI mode: just mark as completed
      await adminClient
        .from("uploads")
        .update({ status: "completed" })
        .eq("id", uploadId);

      return NextResponse.json({
        uploadId,
        factsExtracted: 0,
        message: "File uploaded. AI extraction was disabled.",
      });
    }

    // Process the document in chunks
    const buffer = Buffer.from(await file.arrayBuffer());
    const chunks = await parseDocumentChunked(buffer, fileName);

    if (chunks.length === 0) {
      await adminClient
        .from("uploads")
        .update({ status: "completed" })
        .eq("id", uploadId);

      return NextResponse.json({
        uploadId,
        factsExtracted: 0,
        chunksProcessed: 0,
        message: "No readable content found in document.",
      });
    }

    // Get existing metric codes for extraction
    const { data: metricsData } = await adminClient
      .from("metrics")
      .select("code");
    const metricCodes = (metricsData || []).map((m: { code: string }) => m.code);

    // Extract facts from each chunk
    const allFacts: any[] = [];
    for (const chunk of chunks) {
      try {
        const result = await extractFactsFromText(chunk.text, {
          restrictedMetrics: metricCodes.length > 0 ? metricCodes : undefined,
        });
        if (result.facts && result.facts.length > 0) {
          allFacts.push(...result.facts);
        }
      } catch (chunkError) {
        console.error(`[OrgUpload] Error processing chunk:`, chunkError);
      }
    }

    // Deduplicate facts
    const uniqueFacts = deduplicateFacts(allFacts);

    if (uniqueFacts.length === 0) {
      await adminClient
        .from("uploads")
        .update({ status: "completed" })
        .eq("id", uploadId);

      return NextResponse.json({
        uploadId,
        factsExtracted: 0,
        chunksProcessed: chunks.length,
        message: "No metrics found in document.",
      });
    }

    // Insert facts into staging (not approved, with org context)
    const stagingFacts = uniqueFacts.map((fact) => ({
      upload_id: uploadId,
      holding_id,
      metric_code: fact.metric_code,
      value: fact.value,
      unit: fact.unit,
      period_start: fact.period_start || null,
      period_end: fact.period_end || null,
      source: fact.source || fileName,
      verification_level: "ai_extracted_org",
      data_quality_score: fact.confidence,
      submitted_by_org_id: orgId,
      approved: false,
      raw: fact,
    }));

    const { error: insertError } = await adminClient
      .from("staging_metric_facts")
      .insert(stagingFacts);

    if (insertError) {
      console.error("[OrgUpload] Error inserting staging facts:", insertError);
      await adminClient
        .from("uploads")
        .update({ status: "failed" })
        .eq("id", uploadId);

      return NextResponse.json(
        { error: "Failed to save extracted metrics" },
        { status: 500 }
      );
    }

    // Mark upload as completed
    await adminClient
      .from("uploads")
      .update({ status: "completed" })
      .eq("id", uploadId);

    return NextResponse.json({
      uploadId,
      factsExtracted: uniqueFacts.length,
      chunksProcessed: chunks.length,
      message: `Extracted ${uniqueFacts.length} metrics. Pending portfolio owner approval.`,
    });
  } catch (err: any) {
    console.error("[OrgUpload] Error:", err);

    if (uploadId) {
      await adminClient
        .from("uploads")
        .update({ status: "failed" })
        .eq("id", uploadId);
    }

    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
