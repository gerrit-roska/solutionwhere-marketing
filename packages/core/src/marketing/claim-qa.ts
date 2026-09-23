// Shared publish gate for SEO articles and Facebook ads.
// Solutionwhere is not WCAG or SOC 2 certified, and named customers
// stay out of public copy until Benjamin clears them.

const BLOCKED_CLAIMS: { label: string; pattern: RegExp }[] = [
  { label: "WCAG", pattern: /\bwcag\b/i },
  { label: "SOC 2", pattern: /\bsoc[\s-]*2\b/i },
  { label: "Lyons Township", pattern: /lyons township/i },
  { label: "On Track by 5", pattern: /on track by 5/i },
  { label: "Washoe County School District", pattern: /washoe county school district/i },
  { label: "LPSS", pattern: /\bLPSS\b/ },
];

/** Labels of blocked claims found in text. Empty when the copy is clear. */
export function findBlockedClaims(text: string): string[] {
  return BLOCKED_CLAIMS.filter((row) => row.pattern.test(text)).map(
    (row) => row.label,
  );
}

/** Throws when copy includes a blocked claim. Call before publish or upload. */
export function assertNoBlockedClaims(text: string, surface: string): void {
  const hits = findBlockedClaims(text);
  if (hits.length > 0) {
    throw new Error(`${surface} blocked by claim QA: ${hits.join(", ")}`);
  }
}

/** Replace blocked phrases so a prompt cannot hand a customer name to the model. */
export function redactBlockedClaims(text: string): string {
  let next = text;
  for (const row of BLOCKED_CLAIMS) {
    next = next.replace(row.pattern, "a customer");
  }
  return next;
}
