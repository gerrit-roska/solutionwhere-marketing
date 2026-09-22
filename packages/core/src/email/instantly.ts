import { sequencerEnv } from "./config";

const BASE = "https://api.instantly.ai/api/v2";

export type InstantlyCampaignStatus = -99 | -2 | -1 | 0 | 1 | 2 | 3 | 4;

export interface InstantlyCampaign {
  id: string;
  name: string;
  status: InstantlyCampaignStatus;
  email_list?: string[] | null;
  sequences?: unknown;
}

export interface InstantlyAccount {
  email: string;
  status?: number | string;
  warmup_status?: number | string;
  provider?: string;
  domain?: string;
}

interface Paginated<T> {
  items?: T[];
  next_starting_after?: string | null;
}

async function instantlyRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { INSTANTLY_API_KEY } = sequencerEnv();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${INSTANTLY_API_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Instantly ${init.method ?? "GET"} ${path} ${res.status}: ${text.slice(0, 800)}`,
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function listAll<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (startingAfter) query.set("starting_after", startingAfter);
    const sep = path.includes("?") ? "&" : "?";
    const body = await instantlyRequest<Paginated<T>>(`${path}${sep}${query}`);
    items.push(...(body.items ?? []));
    if (!body.next_starting_after) break;
    startingAfter = body.next_starting_after;
  }
  return items;
}

export function listCampaigns(): Promise<InstantlyCampaign[]> {
  return listAll<InstantlyCampaign>("/campaigns");
}

export function listAccounts(): Promise<InstantlyAccount[]> {
  return listAll<InstantlyAccount>("/accounts");
}

export function listDfyOrders(): Promise<unknown[]> {
  return listAll<unknown>("/dfy-email-account-orders");
}

export function listDfyOrderedAccounts(): Promise<unknown[]> {
  return listAll<unknown>("/dfy-email-account-orders/accounts");
}

export async function checkDfyDomainAvailability(
  domains: string[],
): Promise<unknown> {
  return instantlyRequest("/dfy-email-account-orders/domains/check", {
    method: "POST",
    body: JSON.stringify({ domains }),
  });
}

export function getCampaign(id: string): Promise<InstantlyCampaign> {
  return instantlyRequest<InstantlyCampaign>(`/campaigns/${id}`);
}

export function patchCampaign(
  id: string,
  payload: Record<string, unknown>,
): Promise<InstantlyCampaign> {
  return instantlyRequest<InstantlyCampaign>(`/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createCampaign(
  payload: Record<string, unknown>,
): Promise<InstantlyCampaign> {
  return instantlyRequest<InstantlyCampaign>("/campaigns", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function pauseCampaign(id: string): Promise<InstantlyCampaign> {
  return instantlyRequest<InstantlyCampaign>(`/campaigns/${id}/pause`, {
    method: "POST",
  });
}

export function createLead(
  body: Record<string, unknown>,
): Promise<{ id?: string }> {
  return instantlyRequest("/leads", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listLeads(
  body: Record<string, unknown>,
): Promise<{ items?: unknown[] }> {
  return instantlyRequest("/leads/list", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export const CAMPAIGN_STATUS: Record<number, string> = {
  0: "draft",
  1: "active",
  2: "paused",
  3: "completed",
  4: "running_subsequences",
  [-1]: "accounts_unhealthy",
  [-2]: "bounce_protect",
  [-99]: "account_suspended",
};
