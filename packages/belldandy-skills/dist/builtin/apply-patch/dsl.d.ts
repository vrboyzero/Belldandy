export declare const BEGIN_PATCH_MARKER = "*** Begin Patch";
export declare const END_PATCH_MARKER = "*** End Patch";
export declare const ADD_FILE_MARKER = "*** Add File: ";
export declare const DELETE_FILE_MARKER = "*** Delete File: ";
export declare const UPDATE_FILE_MARKER = "*** Update File: ";
export declare const MOVE_TO_MARKER = "*** Move to: ";
export declare const EOF_MARKER = "*** End of File";
export declare const CHANGE_CONTEXT_MARKER = "@@ ";
export declare const EMPTY_CHANGE_CONTEXT_MARKER = "@@";
export type AddFileHunk = {
    kind: "add";
    path: string;
    contents: string;
};
export type DeleteFileHunk = {
    kind: "delete";
    path: string;
};
export type UpdateFileChunk = {
    changeContext?: string;
    oldLines: string[];
    newLines: string[];
    isEndOfFile: boolean;
};
export type UpdateFileHunk = {
    kind: "update";
    path: string;
    movePath?: string;
    chunks: UpdateFileChunk[];
};
export type Hunk = AddFileHunk | DeleteFileHunk | UpdateFileHunk;
export declare function parsePatchText(input: string): {
    hunks: Hunk[];
    patch: string;
};
//# sourceMappingURL=dsl.d.ts.map