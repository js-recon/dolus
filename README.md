# Dolus

<p align="center">
  <img src="assets/dolus-logo.png" alt="Dolus" width="120">
</p>

> *dolus* (Latin) — deceit, trickery, fraud; in Roman law, intentional wrongdoing.

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

```
dolus login <server>                    authenticate and store token
dolus logout                            clear stored credentials

dolus packages                          list packages
dolus packages publish <name>           publish a package
dolus packages delete <id>              delete and unpublish a package

dolus beacons                           list active beacons
dolus beacons show <id>                 show beacon details + heartbeat history
dolus beacons destroy <id>              queue beacon for self-destruction
dolus beacons shell <id>                open interactive shell on a beacon
```

Credentials are stored in `~/.dolus.json`.

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
