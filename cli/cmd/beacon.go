package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"text/tabwriter"
	"time"

	"github.com/spf13/cobra"
)

var beaconCmd = &cobra.Command{
	Use:   "beacon",
	Short: "View beacons",
}

var beaconListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all beacons",
	Run: func(cmd *cobra.Command, args []string) {
		if !requireServer() {
			os.Exit(1)
		}
		client := &http.Client{Timeout: 15 * time.Second}
		resp, err := client.Get(serverURL + "/api/beacons")
		if err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
		defer resp.Body.Close()
		data, _ := io.ReadAll(resp.Body)
		var beacons []struct {
			ID       int    `json:"id"`
			PkgName  string `json:"pkg_name"`
			Hostname string `json:"hostname"`
			Platform string `json:"platform"`
			Arch     string `json:"arch"`
			Username string `json:"username"`
			LastSeen int64  `json:"last_seen"`
		}
		if err := json.Unmarshal(data, &beacons); err != nil {
			fmt.Println(string(data))
			return
		}
		now := time.Now().Unix()
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "ID\tHOSTNAME\tPACKAGE\tOS\tUSER\tLAST SEEN\tSTATUS")
		for _, b := range beacons {
			status := "DEAD"
			if now-b.LastSeen < 120 {
				status = "ALIVE"
			}
			fmt.Fprintf(w, "%d\t%s\t%s\t%s/%s\t%s\t%s\t%s\n",
				b.ID, orDash(b.Hostname), b.PkgName, orDash(b.Platform), orDash(b.Arch),
				orDash(b.Username), time.Unix(b.LastSeen, 0).Format("2006-01-02 15:04"), status,
			)
		}
		w.Flush()
	},
}

var beaconViewCmd = &cobra.Command{
	Use:   "view <id>",
	Short: "Show beacon details",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		if !requireServer() {
			os.Exit(1)
		}
		client := &http.Client{Timeout: 15 * time.Second}
		resp, err := client.Get(serverURL + "/api/beacons/" + args[0])
		if err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
		defer resp.Body.Close()
		data, _ := io.ReadAll(resp.Body)
		var b struct {
			ID        int    `json:"id"`
			PkgName   string `json:"pkg_name"`
			Hostname  string `json:"hostname"`
			Username  string `json:"username"`
			Platform  string `json:"platform"`
			Arch      string `json:"arch"`
			OSRelease string `json:"os_release"`
			CWD       string `json:"cwd"`
			EnvVars   string `json:"env_vars"`
			LastSeen  int64  `json:"last_seen"`
			CreatedAt int64  `json:"created_at"`
			Heartbeats []struct {
				TS int64 `json:"ts"`
			} `json:"heartbeats"`
		}
		if err := json.Unmarshal(data, &b); err != nil {
			fmt.Println(string(data))
			return
		}
		now := time.Now().Unix()
		status := "DEAD"
		if now-b.LastSeen < 120 {
			status = "ALIVE"
		}
		fmt.Printf("%-14s %s (%s)\n", "hostname:", orDash(b.Hostname), status)
		fmt.Printf("%-14s %s\n", "user:", orDash(b.Username))
		fmt.Printf("%-14s %s / %s\n", "platform:", orDash(b.Platform), orDash(b.Arch))
		fmt.Printf("%-14s %s\n", "os release:", orDash(b.OSRelease))
		fmt.Printf("%-14s %s\n", "cwd:", orDash(b.CWD))
		fmt.Printf("%-14s %s\n", "package:", b.PkgName)
		fmt.Printf("%-14s %s\n", "first seen:", time.Unix(b.CreatedAt, 0).Format("2006-01-02 15:04:05"))
		fmt.Printf("%-14s %s\n", "last seen:", time.Unix(b.LastSeen, 0).Format("2006-01-02 15:04:05"))

		if b.EnvVars != "" {
			fmt.Println("\nenv vars:")
			var ev map[string]string
			if json.Unmarshal([]byte(b.EnvVars), &ev) == nil {
				for k, v := range ev {
					fmt.Printf("  %-12s %s\n", k+":", v)
				}
			}
		}

		if len(b.Heartbeats) > 0 {
			fmt.Printf("\nheartbeats (last %d):\n", len(b.Heartbeats))
			for _, h := range b.Heartbeats {
				fmt.Printf("  %s\n", time.Unix(h.TS, 0).Format("2006-01-02 15:04:05"))
			}
		}
	},
}

func init() {
	beaconCmd.AddCommand(beaconListCmd)
	beaconCmd.AddCommand(beaconViewCmd)
}

func orDash(s string) string {
	if s == "" {
		return "—"
	}
	return s
}
