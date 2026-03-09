import { createHash } from "crypto";
import type { CrawledPage } from "./firecrawl";

/**
 * Pre-analysis content deduplication.
 *
 * Strips repeated content blocks (nav, footer, persistent players, cookie
 * banners, etc.) from crawled page markdown BEFORE any AI analysis runs.
 *
 * Algorithm:
 *   1. Split each page's markdown into blocks (on double-newline boundaries).
 *   2. Normalize whitespace and hash each block.
 *   3. Count how many pages each block-hash appears on.
 *   4. Any block appearing on ≥ threshold% of pages = global component → strip.
 *   5. Return pages with only page-specific content.
 *
 * Deterministic. No AI. Works for any site.
 */

interface DedupResult {
  pages: CrawledPage[];
  strippedBlocks: number;
  globalBlockSamples: string[];
}

const MIN_BLOCK_LENGTH = 40; // Ignore tiny blocks (single words, dividers)
const DEFAULT_THRESHOLD = 0.6; // Block appears on 60%+ of pages → global

function normalizeBlock(block: string): string {
  return block
    .replace(/\s+/g, " ") // collapse whitespace
    .replace(/[^\w\s]/g, "") // strip punctuation for fuzzy matching
    .trim()
    .toLowerCase();
}

function hashBlock(normalized: string): string {
  return createHash("md5").update(normalized).digest("hex");
}

function splitIntoBlocks(markdown: string): string[] {
  // Split on double-newlines (standard markdown paragraph boundaries)
  // Also split on horizontal rules (---, ***) which often separate sections
  return markdown
    .split(/\n{2,}|\n(?:[-*]{3,})\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

export function deduplicatePages(
  pages: CrawledPage[],
  threshold = DEFAULT_THRESHOLD
): DedupResult {
  if (pages.length < 3) {
    // Too few pages to detect global patterns — return as-is
    return { pages, strippedBlocks: 0, globalBlockSamples: [] };
  }

  const minPageCount = Math.max(2, Math.ceil(pages.length * threshold));

  // Phase 1: Split all pages into blocks and hash them
  const pageBlocks: { original: string; hash: string }[][] = [];
  const hashPageCount = new Map<string, number>(); // hash → number of pages it appears on

  for (const page of pages) {
    const blocks = splitIntoBlocks(page.markdown);
    const seen = new Set<string>(); // dedupe within a single page
    const hashed: { original: string; hash: string }[] = [];

    for (const block of blocks) {
      const normalized = normalizeBlock(block);
      if (normalized.length < MIN_BLOCK_LENGTH) {
        // Keep short blocks — they're headings, dividers, not global components
        hashed.push({ original: block, hash: "" });
        continue;
      }

      const hash = hashBlock(normalized);
      hashed.push({ original: block, hash });

      if (!seen.has(hash)) {
        seen.add(hash);
        hashPageCount.set(hash, (hashPageCount.get(hash) ?? 0) + 1);
      }
    }

    pageBlocks.push(hashed);
  }

  // Phase 2: Identify global blocks
  const globalHashes = new Set<string>();
  const globalSamples: string[] = [];

  for (const [hash, count] of hashPageCount) {
    if (count >= minPageCount) {
      globalHashes.add(hash);
    }
  }

  // Collect a few samples for logging
  for (const page of pageBlocks) {
    for (const block of page) {
      if (
        block.hash &&
        globalHashes.has(block.hash) &&
        globalSamples.length < 5
      ) {
        const sample = block.original.slice(0, 120);
        if (!globalSamples.includes(sample)) {
          globalSamples.push(sample);
        }
      }
    }
  }

  // Phase 3: Strip global blocks from each page
  let totalStripped = 0;
  const cleanedPages: CrawledPage[] = pages.map((page, i) => {
    const blocks = pageBlocks[i];
    const kept: string[] = [];

    for (const block of blocks) {
      if (block.hash && globalHashes.has(block.hash)) {
        totalStripped++;
      } else {
        kept.push(block.original);
      }
    }

    const cleanedMarkdown = kept.join("\n\n");

    return {
      ...page,
      markdown: cleanedMarkdown,
    };
  });

  return {
    pages: cleanedPages,
    strippedBlocks: totalStripped,
    globalBlockSamples: globalSamples,
  };
}
