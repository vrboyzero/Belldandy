import type { SearchProvider, SearchResult, WebSearchOptions } from "./types.js";
export declare class SerpApiProvider implements SearchProvider {
    name: string;
    search(options: WebSearchOptions): Promise<SearchResult[]>;
}
//# sourceMappingURL=serpapi.d.ts.map