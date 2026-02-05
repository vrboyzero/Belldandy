import type { SearchProvider, SearchResult, WebSearchOptions } from "./types.js";
export declare class BraveSearchProvider implements SearchProvider {
    name: string;
    search(options: WebSearchOptions): Promise<SearchResult[]>;
}
//# sourceMappingURL=brave.d.ts.map