"use server";

import { redirect } from "next/navigation";
import { getDb } from "@app/core";

// Creative review actions (04-meta-ads-execution.md §5): a human approves
// or rejects each generated asset before anything is uploaded to Meta.
// Approved creatives become eligible for the (future) upload-drafts job;
// rejected ones stay in the ledger so the factory doesn't regenerate the
// same persona × angle blindly.

function back(params: Record<string, string>): never {
  redirect(`/creative?${new URLSearchParams(params).toString()}`);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function setStatus(
  creativeId: string,
  status: "approved" | "rejected",
  tab: string,
): Promise<never> {
  // redirect() throws NEXT_REDIRECT — keep back() out of the try/catch.
  let params: Record<string, string>;
  try {
    const result = await getDb()
      .updateTable("fb_creatives")
      .set({ status })
      .where("creative_id", "=", creativeId)
      .where("status", "=", "generated") // only pending-review rows are actionable
      .executeTakeFirst();
    const changed = Number(result.numUpdatedRows ?? 0) > 0;
    params = changed
      ? { notice: `Creative ${creativeId} ${status}.` }
      : { error: `Creative ${creativeId} is not pending review.` };
  } catch (error) {
    params = { error: messageOf(error) };
  }
  back({ ...(tab !== "all" ? { tab } : {}), ...params });
}

export async function approveCreativeAction(formData: FormData): Promise<void> {
  await setStatus(
    String(formData.get("creativeId") ?? ""),
    "approved",
    String(formData.get("tab") ?? "all"),
  );
}

export async function rejectCreativeAction(formData: FormData): Promise<void> {
  await setStatus(
    String(formData.get("creativeId") ?? ""),
    "rejected",
    String(formData.get("tab") ?? "all"),
  );
}
