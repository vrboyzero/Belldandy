export type AllowlistStore = {
    version: 1;
    allowFrom: string[];
};
export type PairingRequest = {
    clientId: string;
    code: string;
    createdAt: string;
};
export type PairingStore = {
    version: 1;
    pending: PairingRequest[];
};
export declare function resolveStateDir(env?: NodeJS.ProcessEnv): string;
export declare function resolveAllowlistPath(stateDir: string): string;
export declare function resolvePairingPath(stateDir: string): string;
export declare function isClientAllowed(params: {
    clientId: string;
    stateDir?: string;
    env?: NodeJS.ProcessEnv;
}): Promise<boolean>;
export declare function approvePairingCode(params: {
    code: string;
    stateDir?: string;
    env?: NodeJS.ProcessEnv;
}): Promise<{
    ok: true;
    clientId: string;
} | {
    ok: false;
    message: string;
}>;
export declare function revokeClient(params: {
    clientId: string;
    stateDir?: string;
    env?: NodeJS.ProcessEnv;
}): Promise<{
    ok: true;
    removed: boolean;
}>;
export declare function ensurePairingCode(params: {
    clientId: string;
    stateDir?: string;
    env?: NodeJS.ProcessEnv;
}): Promise<{
    code: string;
    createdAt: string;
}>;
export declare function cleanupPending(params: {
    stateDir?: string;
    env?: NodeJS.ProcessEnv;
    dryRun?: boolean;
}): Promise<{
    cleaned: PairingRequest[];
    remaining: number;
}>;
export declare function readAllowlistStore(stateDir: string): Promise<AllowlistStore>;
export declare function writeAllowlistStore(stateDir: string, store: AllowlistStore): Promise<void>;
export declare function readPairingStore(stateDir: string): Promise<PairingStore>;
export declare function writePairingStore(stateDir: string, store: PairingStore): Promise<void>;
//# sourceMappingURL=store.d.ts.map