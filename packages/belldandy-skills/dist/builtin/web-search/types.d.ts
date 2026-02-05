export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    published?: string;
    source?: string;
}
export interface WebSearchOptions {
    query: string;
    count?: number;
    country?: string;
    apiKey?: string;
}
export interface SearchProvider {
    name: string;
    search(options: WebSearchOptions): Promise<SearchResult[]>;
}
//# sourceMappingURL=types.d.ts.map