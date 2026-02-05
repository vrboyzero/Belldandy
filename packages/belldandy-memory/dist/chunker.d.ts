export interface ChunkOptions {
    maxLength?: number;
    overlap?: number;
}
export declare class Chunker {
    private maxLength;
    private overlap;
    constructor(options?: ChunkOptions);
    splitText(content: string): string[];
    private splitByHeaders;
}
//# sourceMappingURL=chunker.d.ts.map