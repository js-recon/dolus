# Dolus

Dependency confusion research tool (PoC).

## Components

| Path | Purpose |
|------|---------|
| `packages/template/` | npm package payload — collects system info on install, spawns a persistent heartbeat |
| `server/` | Next.js 15 dashboard + REST API — receives beacons, tracks live status |
| `cli/` | Go CLI (`dolus`) — manage packages and view beacons from the terminal |

## Server

**Requires Node.js ≥ 26** (uses `node:sqlite` built-in).

```bash
cd server
npm install
```

Required env vars:

| Var | Description |
|-----|-------------|
| `REGISTRY_URL` | npm registry to publish packages to |
| `C2_URL` | Publicly reachable URL of this server (baked into each published package) |
| `DATABASE_PATH` | SQLite db path (default: `./dolus.db`) |
| `REGISTRY_AUTH_TOKEN` | Auth token for the registry (optional if `~/.npmrc` has creds) |

```bash
REGISTRY_URL=http://registry:4873/ C2_URL=http://server:3000 npm run dev
```

Dashboard routes: `/` (overview) · `/packages` (add/manage) · `/beacons` (live status) · `/beacons/:id` (detail)

## CLI

```bash
cd cli
go build -o dolus .
```

```bash
export DOLUS_SERVER_URL=http://localhost:3000

dolus package add my-pkg-name       # publish a package
dolus package list                  # list registered packages
dolus beacon list                   # list all beacons
dolus beacon view 1                 # inspect a specific beacon
```

Config can also live in `~/.dolus/config.json`:
```json
{ "server_url": "http://localhost:3000" }
```

## Package template

`packages/template/` is the npm package that gets published for each claimed name. At publish time the server substitutes `__PKG_NAME__` and `__C2_URL__` placeholders throughout the files.

On install (`postinstall`):
1. Collects hostname, username, OS/arch, network interfaces, env vars, and a depth-3 directory tree of the install working directory
2. POSTs a beacon to `C2_URL/api/beacon`
3. Spawns a detached `heartbeat.js` process that pings `C2_URL/api/heartbeat` every 60 seconds

## Testing

```bash
# Server unit tests (publish template rendering + schema)
cd server && npm test

# CLI
cd cli && go test ./...
```

CI runs automatically on every push via GitHub Actions (`.github/workflows/ci.yml`).
