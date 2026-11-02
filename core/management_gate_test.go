package core

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// writeTestConfig creates a config file with distinct mtimes between writes.
func writeTestConfig(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.toml")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func mgmtRequest(t *testing.T, method, url, token string, body string, header map[string]string) (*http.Response, mgmtResponse) {
	t.Helper()
	var rd *strings.Reader
	if body == "" {
		rd = strings.NewReader("")
	} else {
		rd = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, url, rd)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	for k, v := range header {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	var r mgmtResponse
	_ = json.NewDecoder(resp.Body).Decode(&r)
	return resp, r
}

func TestMgmt_Config_ExposesMtimeHeader(t *testing.T) {
	path := writeTestConfig(t, "[log]\nlevel = \"info\"\n")
	srv, ts, _ := testManagementServer(t, "tok")
	srv.SetConfigFilePath(path)

	// /config returns the raw TOML body (text/plain), not mgmtJSON.
	req, _ := http.NewRequest("GET", ts.URL+"/api/v1/config", nil)
	req.Header.Set("Authorization", "Bearer tok")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	want := mtimeString(t, path)
	if got := resp.Header.Get(HeaderConfigMtime); got != want {
		t.Fatalf("X-Config-Mtime = %q, want %q", got, want)
	}
}

// TestMgmt_GlobalSettings_MtimeConflictRejected guards the dual-track
// write-back (ADR-0002): a form loaded before the TOML editor saved must
// get a 409 instead of silently clobbering the file-track edit.
func TestMgmt_GlobalSettings_MtimeConflictRejected(t *testing.T) {
	path := writeTestConfig(t, "language = \"en\"\n")
	srv, ts, _ := testManagementServer(t, "tok")
	srv.SetConfigFilePath(path)
	srv.SetSaveGlobalSettings(func(updates map[string]any) error { return nil })

	mtimeV1 := mtimeString(t, path)

	// File track saves while the form is open.
	time.Sleep(20 * time.Millisecond)
	if err := os.WriteFile(path, []byte("language = \"zh\"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	mtimeV2 := mtimeString(t, path)
	if mtimeV1 == mtimeV2 {
		t.Fatal("mtime did not advance between writes; test setup broken")
	}

	// Stale form save → 409.
	resp, r := mgmtRequest(t, "PATCH", ts.URL+"/api/v1/settings", "tok",
		`{"language":"en"}`, map[string]string{HeaderConfigLoadedMtime: mtimeV1})
	resp.Body.Close()
	if r.OK {
		t.Fatal("stale loaded_mtime must be rejected")
	}
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d, want 409", resp.StatusCode)
	}

	// Fresh mtime → accepted.
	resp, r = mgmtRequest(t, "PATCH", ts.URL+"/api/v1/settings", "tok",
		`{"language":"en"}`, map[string]string{HeaderConfigLoadedMtime: mtimeV2})
	resp.Body.Close()
	if !r.OK {
		t.Fatalf("fresh loaded_mtime rejected: %s", r.Error)
	}
	if got := resp.Header.Get(HeaderConfigMtime); got == "" {
		t.Fatal("successful save must echo X-Config-Mtime for chained saves")
	}

	// No header → backwards-compatible passthrough.
	resp, r = mgmtRequest(t, "PATCH", ts.URL+"/api/v1/settings", "tok", `{"language":"ja"}`, nil)
	resp.Body.Close()
	if !r.OK {
		t.Fatalf("headerless save rejected: %s", r.Error)
	}
}

func TestMgmt_GlobalProviders_MtimeConflictRejected(t *testing.T) {
	path := writeTestConfig(t, "x = 1\n")
	srv, ts, _ := testManagementServer(t, "tok")
	srv.SetConfigFilePath(path)
	srv.SetAddGlobalProvider(func(info GlobalProviderInfo) error { return nil })

	time.Sleep(20 * time.Millisecond)
	stale := mtimeString(t, path)
	if err := os.WriteFile(path, []byte("x = 2\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	resp, r := mgmtRequest(t, "POST", ts.URL+"/api/v1/providers", "tok",
		`{"name":"p1"}`, map[string]string{HeaderConfigLoadedMtime: stale})
	resp.Body.Close()
	if r.OK || resp.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d ok = %v, want 409 conflict", resp.StatusCode, r.OK)
	}
}

func TestMgmt_ProjectSettings_MtimeConflictRejected(t *testing.T) {
	path := writeTestConfig(t, "x = 1\n")
	srv, ts, _ := testManagementServer(t, "tok")
	srv.SetConfigFilePath(path)
	srv.SetSaveProjectSettings(func(name string, u ProjectSettingsUpdate) error { return nil })

	time.Sleep(20 * time.Millisecond)
	stale := mtimeString(t, path)
	if err := os.WriteFile(path, []byte("x = 2\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	resp, r := mgmtRequest(t, "PATCH", ts.URL+"/api/v1/projects/test-project", "tok",
		`{"language":"zh"}`, map[string]string{HeaderConfigLoadedMtime: stale})
	resp.Body.Close()
	if r.OK || resp.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d ok = %v, want 409 conflict", resp.StatusCode, r.OK)
	}
}

func mtimeString(t *testing.T, path string) string {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	return strconv.FormatInt(info.ModTime().UnixNano(), 10)
}

func TestMgmt_LogStream_SSE_TailLevelAndRedaction(t *testing.T) {
	srv, ts, _ := testManagementServer(t, "sekret-token")
	srv.SetConfigFilePath("")

	f := GlobalLogFanout()
	prevNext := f.next
	t.Cleanup(func() { f.mu.Lock(); f.next = prevNext; f.mu.Unlock() })

	// Feed lines including a secret that must be redacted in the stream.
	f.ingest("time=1 level=INFO msg=booted token=sekret-token\n")
	f.ingest("time=2 level=ERROR msg=boom\n")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", ts.URL+"/api/v1/logs/stream?token=sekret-token&tail=10&level=info", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Fatalf("content-type = %q", ct)
	}

	scanner := bufio.NewScanner(resp.Body)
	var events []string
	for len(events) < 2 {
		if !scanner.Scan() {
			t.Fatalf("stream ended early: %v", scanner.Err())
		}
		line := scanner.Text()
		if strings.HasPrefix(line, "data: ") {
			events = append(events, strings.TrimPrefix(line, "data: "))
		}
	}

	joined := strings.Join(events, "\n")
	if !strings.Contains(joined, "msg=booted") || !strings.Contains(joined, "msg=boom") {
		t.Fatalf("missing expected lines in %q", joined)
	}
	if strings.Contains(joined, "sekret-token") {
		t.Fatalf("token leaked in stream: %q", joined)
	}
	if !strings.Contains(joined, "[REDACTED]") {
		t.Fatalf("expected redaction marker in %q", joined)
	}
}

func TestMgmt_DoctorAgents_ProbesRegisteredAgents(t *testing.T) {
	RegisterAgent("testprobe", func(opts map[string]any) (Agent, error) {
		return &doctorProbeAgent{}, nil
	})
	t.Cleanup(func() {
		delete(agentFactories, "testprobe")
	})

	_, ts, _ := testManagementServer(t, "tok")
	resp, r := mgmtRequest(t, "GET", ts.URL+"/api/v1/doctor/agents", "tok", "", nil)
	resp.Body.Close()
	if !r.OK {
		t.Fatalf("GET /doctor/agents failed: %s", r.Error)
	}
	raw, _ := json.Marshal(r.Data)
	var payload struct {
		Agents []map[string]any `json:"agents"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, a := range payload.Agents {
		if a["agent"] == "testprobe" {
			found = true
			if a["installed"] != false {
				t.Fatalf("probe for missing binary should report installed=false: %v", a)
			}
			if a["binary"] != "cc-connect-definitely-not-installed-xyz" {
				t.Fatalf("binary = %v", a["binary"])
			}
			if a["display_name"] != "Probe" {
				t.Fatalf("display_name = %v, want Probe", a["display_name"])
			}
		}
	}
	if !found {
		t.Fatalf("testprobe missing from %s", raw)
	}
}

// doctorProbeAgent pretends to be an agent whose CLI is never on PATH.
type doctorProbeAgent struct {
	Agent
}

func (d *doctorProbeAgent) Name() string            { return "testprobe" }
func (d *doctorProbeAgent) CLIBinaryName() string   { return "cc-connect-definitely-not-installed-xyz" }
func (d *doctorProbeAgent) CLIDisplayName() string  { return "Probe" }

func TestMgmt_LogStream_MethodNotAllowed(t *testing.T) {
	_, ts, _ := testManagementServer(t, "tok")
	resp, r := mgmtRequest(t, "POST", ts.URL+"/api/v1/logs/stream", "tok", "", nil)
	resp.Body.Close()
	if r.OK || resp.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", resp.StatusCode)
	}
}
