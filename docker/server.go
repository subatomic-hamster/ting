// Static serving only. The original TypeScript engine runs in the browser.
// No request paths, user answers, credentials or uploads are logged or stored here.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

func port() string {
	if value := os.Getenv("PORT"); value != "" {
		return value
	}
	return "8080"
}

func handler(root string) http.Handler {
	// Module workers must never receive index.html or an incorrect MIME type.
	_ = mime.AddExtensionType(".mjs", "text/javascript")
	_ = mime.AddExtensionType(".js", "text/javascript")
	_ = mime.AddExtensionType(".wasm", "application/wasm")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.URL.Path == "/healthz" {
			w.Header().Set("Content-Type", "text/plain")
			w.Header().Set("Cache-Control", "no-store")
			if r.Method != http.MethodHead {
				_, _ = io.WriteString(w, "ok\n")
			}
			return
		}
		clean := path.Clean("/" + r.URL.Path)
		name := filepath.Join(root, filepath.FromSlash(strings.TrimPrefix(clean, "/")))
		info, err := os.Stat(name)
		if err == nil && !info.IsDir() {
			if strings.HasPrefix(clean, "/assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				w.Header().Set("Cache-Control", "no-cache")
			}
			http.ServeFile(w, r, name)
			return
		}
		// Dotted share tokens are app routes; missing worker/assets must be 404s.
		if strings.HasPrefix(clean, "/assets/") || strings.HasPrefix(clean, "/ocr/") ||
			strings.HasPrefix(clean, "/samples/") || (path.Ext(clean) != "" && !strings.HasPrefix(clean, "/share/")) {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, filepath.Join(root, "index.html"))
	})
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--healthcheck" {
		client := &http.Client{Timeout: 2 * time.Second}
		response, err := client.Get("http://127.0.0.1:" + port() + "/healthz")
		if err != nil {
			os.Exit(1)
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			os.Exit(1)
		}
		return
	}
	root := os.Getenv("TING_SITE_DIR")
	if root == "" {
		root = "/site"
	}
	if _, err := os.Stat(filepath.Join(root, "index.html")); err != nil {
		log.Fatal("Site bundle missing")
	}
	// This runtime intentionally has no API keys, remote backend or model dependency.
	config, _ := json.Marshal(map[string]any{"useMocks": true, "ocrAssetBase": "/ocr"})
	app := handler(root)
	server := &http.Server{
		Addr: ":" + port(),
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/config.js" && (r.Method == http.MethodGet || r.Method == http.MethodHead) {
				w.Header().Set("Content-Type", "text/javascript")
				w.Header().Set("Cache-Control", "no-store")
				w.Header().Set("X-Content-Type-Options", "nosniff")
				if r.Method != http.MethodHead {
					_, _ = fmt.Fprintf(w, "window.TING_CONFIG = %s;\n", config)
				}
				return
			}
			app.ServeHTTP(w, r)
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("Ting offline demo listening on :%s", port())
	log.Fatal(server.ListenAndServe())
}
