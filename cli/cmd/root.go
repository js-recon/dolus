package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

var serverURL string

var rootCmd = &cobra.Command{
	Use:   "dolus",
	Short: "Dolus C2 CLI",
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	cobra.OnInitialize(loadServerURL)
	rootCmd.AddCommand(packageCmd)
	rootCmd.AddCommand(beaconCmd)
}

func loadServerURL() {
	if u := os.Getenv("DOLUS_SERVER_URL"); u != "" {
		serverURL = u
		return
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}
	data, err := os.ReadFile(filepath.Join(home, ".dolus", "config.json"))
	if err != nil {
		return
	}
	var cfg struct {
		ServerURL string `json:"server_url"`
	}
	if json.Unmarshal(data, &cfg) == nil && cfg.ServerURL != "" {
		serverURL = cfg.ServerURL
	}
}

func requireServer() bool {
	if serverURL == "" {
		fmt.Fprintln(os.Stderr, "error: set DOLUS_SERVER_URL or ~/.dolus/config.json")
		return false
	}
	return true
}
