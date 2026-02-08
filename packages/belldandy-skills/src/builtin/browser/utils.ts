
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

export interface ContentExtractionResult {
    title: string;
    content: string; // Markdown or Text
    excerpt?: string;
    byline?: string;
    siteName?: string;
}

export function extractReadabilityContent(html: string, url: string): ContentExtractionResult | null {
    const doc = new JSDOM(html, { url });
    const reader = new Readability(doc.window.document);
    const article = reader.parse();

    if (!article) return null;

    const turndownService = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
    });

    // Custom rule to remove images if needed, or keep them
    // For now, keep standard behavior

    const markdown = turndownService.turndown(article.content);

    return {
        title: article.title,
        content: markdown,
        excerpt: article.excerpt,
        byline: article.byline,
        siteName: article.siteName,
    };
}

export function htmlToMarkdown(html: string): string {
    const turndownService = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
    });
    return turndownService.turndown(html);
}
