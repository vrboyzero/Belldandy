const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
export class BraveSearchProvider {
    name = "brave";
    async search(options) {
        const apiKey = options.apiKey || process.env.BRAVE_API_KEY;
        if (!apiKey) {
            throw new Error("Missing BRAVE_API_KEY. Please set it in environment variables.");
        }
        const count = Math.min(Math.max(1, options.count || 5), 20);
        const url = new URL(BRAVE_SEARCH_ENDPOINT);
        url.searchParams.set("q", options.query);
        url.searchParams.set("count", String(count));
        if (options.country) {
            url.searchParams.set("country", options.country);
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
        try {
            const res = await fetch(url.toString(), {
                headers: {
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip",
                    "X-Subscription-Token": apiKey,
                },
                signal: controller.signal,
            });
            if (!res.ok) {
                throw new Error(`Brave Search API error: ${res.status} ${res.statusText}`);
            }
            const data = (await res.json());
            const results = data.web?.results || [];
            return results.map((item) => ({
                title: item.title,
                url: item.url,
                snippet: item.description,
                published: item.age,
                source: item.profile?.name,
            }));
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
//# sourceMappingURL=brave.js.map