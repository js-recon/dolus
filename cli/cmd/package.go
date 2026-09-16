package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/spf13/cobra"
)

var packageCmd = &cobra.Command{
	Use:   "package",
	Short: "Manage packages",
}

var packageAddCmd = &cobra.Command{
	Use:   "add [name...]",
	Short: "Publish packages to the registry",
	Args:  cobra.MinimumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		if !requireServer() {
			os.Exit(1)
		}
		body, _ := json.Marshal(map[string]any{"names": args})
		client := &http.Client{Timeout: 60 * time.Second}
		resp, err := client.Post(serverURL+"/api/packages", "application/json", bytes.NewReader(body))
		if err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
		defer resp.Body.Close()
		data, _ := io.ReadAll(resp.Body)
		var result struct {
			Results []struct {
				Name   string `json:"name"`
				Status string `json:"status"`
				Output string `json:"output"`
			} `json:"results"`
		}
		if json.Unmarshal(data, &result) == nil {
			for _, r := range result.Results {
				fmt.Printf("%-40s %s\n", r.Name, r.Status)
				if r.Output != "" && r.Status == "failed" {
					fmt.Println("  ", strings.TrimSpace(r.Output))
				}
			}
		} else {
			fmt.Println(string(data))
		}
	},
}

var packageListCmd = &cobra.Command{
	Use:   "list",
	Short: "List registered packages",
	Run: func(cmd *cobra.Command, args []string) {
		if !requireServer() {
			os.Exit(1)
		}
		client := &http.Client{Timeout: 15 * time.Second}
		resp, err := client.Get(serverURL + "/api/packages")
		if err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
		defer resp.Body.Close()
		data, _ := io.ReadAll(resp.Body)
		var pkgs []struct {
			ID        int    `json:"id"`
			Name      string `json:"name"`
			Status    string `json:"status"`
			CreatedAt int64  `json:"created_at"`
		}
		if err := json.Unmarshal(data, &pkgs); err != nil {
			fmt.Println(string(data))
			return
		}
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "ID\tNAME\tSTATUS\tCREATED")
		for _, p := range pkgs {
			fmt.Fprintf(w, "%d\t%s\t%s\t%s\n", p.ID, p.Name, p.Status, time.Unix(p.CreatedAt, 0).Format("2006-01-02 15:04"))
		}
		w.Flush()
	},
}

func init() {
	packageCmd.AddCommand(packageAddCmd)
	packageCmd.AddCommand(packageListCmd)
}
