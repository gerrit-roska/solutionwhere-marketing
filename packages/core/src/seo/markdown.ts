// Minimal markdown -> HTML for generated articles. Handles headings,
// paragraphs, and dash/star/numbered lists — what the generator is prompted
// to emit. Links are stripped to anchor text: published copy bans
// hyperlinks, and without this a stray model-emitted link renders as
// literal "[text](url)".
//
// Strapi Blocks cannot render markdown tables. sanitizeArticleMarkdown
// converts pipe tables to lists and strips a leading title heading so a
// model that ignores the playbook still publishes readable copy.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function isHorizontalRule(line: string): boolean {
  return /^(-{3,}|\*{3,}|_{3,})$/.test(line);
}

function isPipeRow(line: string): boolean {
  return line.startsWith("|") && line.includes("|", 1);
}

function splitPipeCells(line: string): string[] {
  const trimmed = line.replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isSeparatorCells(cells: string[]): boolean {
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")) || cell === "")
  );
}

function looksLikeHeaderRow(cells: string[]): boolean {
  const joined = cells.join(" ").toLowerCase();
  return /license|certificate type|renewal cycle|hours required|unit of measure|approving body|deadline|fee|submission/.test(
    joined,
  );
}

function formatTableRow(cells: string[]): string {
  const filled = cells.filter((cell) => cell.length > 0);
  if (filled.length === 0) return "";
  const [lead, ...rest] = filled;
  return rest.length > 0 ? `- ${lead}: ${rest.join(", ")}` : `- ${lead}`;
}

/** Turn markdown pipe tables into bullet lists. Drop separator and header rows. */
export function convertPipeTables(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!isPipeRow(trimmed)) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    const rows: string[][] = [];
    while (i < lines.length && isPipeRow(lines[i].trim())) {
      const cells = splitPipeCells(lines[i].trim());
      if (!isSeparatorCells(cells)) rows.push(cells);
      i += 1;
    }
    const data =
      rows.length >= 2 && looksLikeHeaderRow(rows[0]) ? rows.slice(1) : rows;
    for (const cells of data) {
      const item = formatTableRow(cells);
      if (item) out.push(item);
    }
  }
  return out.join("\n");
}

function stripLeadingTitleHeading(markdown: string, title?: string): string {
  if (!title) return markdown;
  const normalizedTitle = title.trim().toLowerCase();
  const lines = markdown.replace(/^\uFEFF/, "").split("\n");
  let start = 0;
  while (start < lines.length && lines[start].trim() === "") start += 1;
  const heading = /^(#{1,6})\s+(.+)$/.exec(lines[start]?.trim() ?? "");
  if (!heading) return markdown;
  if (heading[2].trim().toLowerCase() !== normalizedTitle) return markdown;
  lines.splice(start, 1);
  if (lines[start]?.trim() === "") lines.splice(start, 1);
  return lines.join("\n");
}

/**
 * Last-pass cleanup before CMS conversion: drop a duplicated title heading,
 * skip thematic-break lines, convert pipe tables the CMS cannot render,
 * and keep the public brand as Solutionwhere.
 */
export function sanitizeArticleMarkdown(
  markdown: string,
  title?: string,
): string {
  let next = convertPipeTables(markdown);
  next = stripLeadingTitleHeading(next, title);
  next = next.replace(/Wisdomwhere|Wisdomware/gi, "Solutionwhere");
  return next
    .split("\n")
    .filter((line) => !isHorizontalRule(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function markdownToHtml(markdown: string, title?: string): string {
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let listTag: "ul" | "ol" = "ul";

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = (): void => {
    if (list.length === 0) return;
    blocks.push(
      `<${listTag}>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</${listTag}>`,
    );
    list = [];
  };

  for (const rawLine of sanitizeArticleMarkdown(markdown, title).split(
    /\r?\n/,
  )) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length + 1, 4);
      blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(line);
    if (unordered) {
      flushParagraph();
      if (list.length > 0 && listTag !== "ul") flushList();
      listTag = "ul";
      list.push(unordered[1]);
      continue;
    }

    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (ordered) {
      flushParagraph();
      if (list.length > 0 && listTag !== "ol") flushList();
      listTag = "ol";
      list.push(ordered[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks.join("\n");
}
