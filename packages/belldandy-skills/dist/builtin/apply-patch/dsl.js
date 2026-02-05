export const BEGIN_PATCH_MARKER = "*** Begin Patch";
export const END_PATCH_MARKER = "*** End Patch";
export const ADD_FILE_MARKER = "*** Add File: ";
export const DELETE_FILE_MARKER = "*** Delete File: ";
export const UPDATE_FILE_MARKER = "*** Update File: ";
export const MOVE_TO_MARKER = "*** Move to: ";
export const EOF_MARKER = "*** End of File";
export const CHANGE_CONTEXT_MARKER = "@@ ";
export const EMPTY_CHANGE_CONTEXT_MARKER = "@@";
export function parsePatchText(input) {
    const trimmed = input.trim();
    if (!trimmed) {
        throw new Error("Invalid patch: input is empty.");
    }
    const lines = trimmed.split(/\r?\n/);
    const validated = checkPatchBoundariesLenient(lines);
    const hunks = [];
    const lastLineIndex = validated.length - 1;
    let remaining = validated.slice(1, lastLineIndex);
    let lineNumber = 2;
    while (remaining.length > 0) {
        const { hunk, consumed } = parseOneHunk(remaining, lineNumber);
        hunks.push(hunk);
        lineNumber += consumed;
        remaining = remaining.slice(consumed);
    }
    return { hunks, patch: validated.join("\n") };
}
function checkPatchBoundariesLenient(lines) {
    const strictError = checkPatchBoundariesStrict(lines);
    if (!strictError)
        return lines;
    if (lines.length < 4) {
        throw new Error(strictError);
    }
    const first = lines[0];
    const last = lines[lines.length - 1];
    // 处理常见的 shell heredoc 包裹情况
    if ((first === "<<EOF" || first === "<<'EOF'" || first === '<<"EOF"') && last.endsWith("EOF")) {
        const inner = lines.slice(1, lines.length - 1);
        const innerError = checkPatchBoundariesStrict(inner);
        if (!innerError)
            return inner;
        throw new Error(innerError);
    }
    throw new Error(strictError);
}
function checkPatchBoundariesStrict(lines) {
    const firstLine = lines[0]?.trim();
    const lastLine = lines[lines.length - 1]?.trim();
    if (firstLine === BEGIN_PATCH_MARKER && lastLine === END_PATCH_MARKER) {
        return null;
    }
    if (firstLine !== BEGIN_PATCH_MARKER) {
        return `The first line of the patch must be '${BEGIN_PATCH_MARKER}'`;
    }
    return `The last line of the patch must be '${END_PATCH_MARKER}'`;
}
function parseOneHunk(lines, lineNumber) {
    if (lines.length === 0) {
        throw new Error(`Invalid patch hunk at line ${lineNumber}: empty hunk`);
    }
    const firstLine = lines[0].trim(); // use ! as length check covered above
    if (firstLine.startsWith(ADD_FILE_MARKER)) {
        const targetPath = firstLine.slice(ADD_FILE_MARKER.length);
        let contents = "";
        let consumed = 1;
        for (const addLine of lines.slice(1)) {
            if (addLine.startsWith("+")) {
                contents += `${addLine.slice(1)}\n`;
                consumed += 1;
            }
            else {
                break;
            }
        }
        return {
            hunk: { kind: "add", path: targetPath, contents },
            consumed,
        };
    }
    if (firstLine.startsWith(DELETE_FILE_MARKER)) {
        const targetPath = firstLine.slice(DELETE_FILE_MARKER.length);
        return {
            hunk: { kind: "delete", path: targetPath },
            consumed: 1,
        };
    }
    if (firstLine.startsWith(UPDATE_FILE_MARKER)) {
        const targetPath = firstLine.slice(UPDATE_FILE_MARKER.length);
        let remaining = lines.slice(1);
        let consumed = 1;
        let movePath;
        const moveCandidate = remaining[0]?.trim();
        if (moveCandidate?.startsWith(MOVE_TO_MARKER)) {
            movePath = moveCandidate.slice(MOVE_TO_MARKER.length);
            remaining = remaining.slice(1);
            consumed += 1;
        }
        const chunks = [];
        while (remaining.length > 0) {
            if (remaining[0].trim() === "") { // remaining[0] is safe as length checked
                remaining = remaining.slice(1);
                consumed += 1;
                continue;
            }
            if (remaining[0].startsWith("***")) {
                break;
            }
            const { chunk, consumed: chunkLines } = parseUpdateFileChunk(remaining, lineNumber + consumed, chunks.length === 0);
            chunks.push(chunk);
            remaining = remaining.slice(chunkLines);
            consumed += chunkLines;
        }
        if (chunks.length === 0) {
            throw new Error(`Invalid patch hunk at line ${lineNumber}: Update file hunk for path '${targetPath}' is empty`);
        }
        return {
            hunk: {
                kind: "update",
                path: targetPath,
                movePath,
                chunks,
            },
            consumed,
        };
    }
    throw new Error(`Invalid patch hunk at line ${lineNumber}: '${lines[0]}' is not a valid hunk header. Valid hunk headers: '${ADD_FILE_MARKER}{path}', '${DELETE_FILE_MARKER}{path}', '${UPDATE_FILE_MARKER}{path}'`);
}
function parseUpdateFileChunk(lines, lineNumber, allowMissingContext) {
    if (lines.length === 0) {
        throw new Error(`Invalid patch hunk at line ${lineNumber}: Update hunk does not contain any lines`);
    }
    let changeContext;
    let startIndex = 0;
    // Safe indexing as length > 0
    if (lines[0] === EMPTY_CHANGE_CONTEXT_MARKER) {
        startIndex = 1;
    }
    else if (lines[0].startsWith(CHANGE_CONTEXT_MARKER)) {
        changeContext = lines[0].slice(CHANGE_CONTEXT_MARKER.length);
        startIndex = 1;
    }
    else if (!allowMissingContext) {
        throw new Error(`Invalid patch hunk at line ${lineNumber}: Expected update hunk to start with a @@ context marker, got: '${lines[0]}'`);
    }
    if (startIndex >= lines.length) {
        throw new Error(`Invalid patch hunk at line ${lineNumber + 1}: Update hunk does not contain any lines`);
    }
    const chunk = {
        changeContext,
        oldLines: [],
        newLines: [],
        isEndOfFile: false,
    };
    let parsedLines = 0;
    for (const line of lines.slice(startIndex)) {
        if (line === EOF_MARKER) {
            if (parsedLines === 0) {
                throw new Error(`Invalid patch hunk at line ${lineNumber + 1}: Update hunk does not contain any lines`);
            }
            chunk.isEndOfFile = true;
            parsedLines += 1;
            break;
        }
        const marker = line[0];
        if (!marker) {
            chunk.oldLines.push("");
            chunk.newLines.push("");
            parsedLines += 1;
            continue;
        }
        if (marker === " ") {
            const content = line.slice(1);
            chunk.oldLines.push(content);
            chunk.newLines.push(content);
            parsedLines += 1;
            continue;
        }
        if (marker === "+") {
            chunk.newLines.push(line.slice(1));
            parsedLines += 1;
            continue;
        }
        if (marker === "-") {
            chunk.oldLines.push(line.slice(1));
            parsedLines += 1;
            continue;
        }
        if (parsedLines === 0) {
            throw new Error(`Invalid patch hunk at line ${lineNumber + 1}: Unexpected line found in update hunk: '${line}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)`);
        }
        break;
    }
    return { chunk, consumed: parsedLines + startIndex };
}
//# sourceMappingURL=dsl.js.map