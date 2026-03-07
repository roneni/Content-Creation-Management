import Firecrawl from "@mendable/firecrawl-js";

const firecrawl = new Firecrawl({
  apiKey: process.env.FIRECRAWL_API_KEY!,
});

export interface CrawledPage {
  url: string;
  title: string;
  description: string;
  markdown: string;
  statusCode: number;
  sourceUrl: string;
}

export interface MapResult {
  links: string[];
}

export async function mapSite(url: string): Promise<MapResult> {
  const result = await firecrawl.map(url);
  return {
    links: result.links?.map((link) => link.url) ?? [],
  };
}

export async function crawlSite(
  url: string,
  options: { limit?: number } = {}
): Promise<CrawledPage[]> {
  const limit = options.limit ?? 50;
  const result = await firecrawl.crawl(url, {
    limit,
    scrapeOptions: { formats: ["markdown"] },
  });
  const pages: CrawledPage[] = (result.data ?? []).map((doc) => ({
    url: doc.metadata?.sourceURL ?? "",
    title: doc.metadata?.title ?? "",
    description: doc.metadata?.description ?? "",
    markdown: doc.markdown ?? "",
    statusCode: doc.metadata?.statusCode ?? 200,
    sourceUrl: doc.metadata?.sourceURL ?? "",
  }));
  return pages;
}

export async function startCrawl(
  url: string,
  options: { limit?: number } = {}
): Promise<string> {
  const limit = options.limit ?? 50;
  const result = await firecrawl.startCrawl(url, {
    limit,
    scrapeOptions: { formats: ["markdown"] },
  });
  return result.id;
}

export async function getCrawlStatus(jobId: string) {
  return await firecrawl.getCrawlStatus(jobId);
}
