package main

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStaticRouting(t *testing.T) {
	root := t.TempDir()
	_ = os.Mkdir(filepath.Join(root, "assets"), 0755)
	_ = os.WriteFile(filepath.Join(root, "index.html"), []byte("<html>Ting</html>"), 0644)
	_ = os.WriteFile(filepath.Join(root, "assets", "worker.mjs"), []byte("export {};"), 0644)
	app := handler(root)
	for _, test := range []struct {
		path    string
		status  int
		content string
	}{
		{"/", 200, "text/html"}, {"/plan", 200, "text/html"},
		{"/share/person.schedule.token", 200, "text/html"},
		{"/assets/worker.mjs", 200, "text/javascript"},
		{"/assets/missing.mjs", 404, "text/plain"},
		{"/ocr/missing.js", 404, "text/plain"},
		{"/samples/missing.pdf", 404, "text/plain"},
		{"/healthz", 200, "text/plain"},
	} {
		t.Run(test.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			app.ServeHTTP(response, httptest.NewRequest("GET", test.path, nil))
			if response.Code != test.status || !strings.HasPrefix(response.Header().Get("Content-Type"), test.content) {
				t.Fatalf("got %d %s", response.Code, response.Header().Get("Content-Type"))
			}
		})
	}
	response := httptest.NewRecorder()
	app.ServeHTTP(response, httptest.NewRequest("POST", "/plan", nil))
	if response.Code != 405 {
		t.Fatalf("POST allowed: %d", response.Code)
	}
}
