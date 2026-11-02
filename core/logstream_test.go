package core

import (
	"log/slog"
	"strconv"
	"strings"
	"testing"
	"time"
)

func newTestFanout() *LogFanout {
	return &LogFanout{subs: make(map[chan string]slog.Level)}
}

func TestLogFanout_TailFiltersByLevel(t *testing.T) {
	f := newTestFanout()
	f.ingest("time=1 level=INFO msg=start\n")
	f.ingest("time=2 level=WARN msg=careful\n")
	f.ingest("time=3 level=ERROR msg=boom\n")

	got := f.Tail(10, slog.LevelWarn)
	if len(got) != 2 {
		t.Fatalf("Tail(warn) = %v, want 2 lines", got)
	}
	if !strings.Contains(got[0], "WARN") || !strings.Contains(got[1], "ERROR") {
		t.Fatalf("Tail(warn) lines wrong: %v", got)
	}

	all := f.Tail(10, slog.LevelDebug)
	if len(all) != 3 {
		t.Fatalf("Tail(debug) = %d lines, want 3", len(all))
	}
}

func TestLogFanout_RingCapDropsOldest(t *testing.T) {
	f := newTestFanout()
	for i := 0; i < logRingCap+100; i++ {
		f.ingest("time=x level=INFO msg=n" + strconv.Itoa(i) + "\n")
	}
	got := f.Tail(logRingCap, slog.LevelDebug)
	if len(got) != logRingCap {
		t.Fatalf("ring kept %d lines, want %d", len(got), logRingCap)
	}
	if !strings.Contains(got[0], "n100") {
		t.Fatalf("oldest kept line = %q, want n100", got[0])
	}
	if !strings.Contains(got[len(got)-1], strconv.Itoa(logRingCap+99)) {
		t.Fatalf("newest kept line = %q", got[len(got)-1])
	}
}

func TestLogFanout_PartialLineBufferedAcrossWrites(t *testing.T) {
	f := newTestFanout()
	f.ingest("time=1 level=WA")
	if got := f.Tail(10, slog.LevelDebug); len(got) != 0 {
		t.Fatalf("partial line leaked into ring: %v", got)
	}
	f.ingest("RN msg=done\n")
	got := f.Tail(10, slog.LevelDebug)
	if len(got) != 1 || !strings.Contains(got[0], "WARN") {
		t.Fatalf("split line not reassembled: %v", got)
	}
}

func TestLogFanout_SubscribeReceivesAndUnsubscribes(t *testing.T) {
	f := newTestFanout()
	ch, unsub := f.Subscribe(slog.LevelWarn)
	defer unsub()

	f.ingest("time=1 level=INFO msg=noise\n")
	f.ingest("time=2 level=ERROR msg=for-you\n")

	select {
	case line := <-ch:
		if !strings.Contains(line, "ERROR") {
			t.Fatalf("subscriber got %q, want the ERROR line", line)
		}
	case <-time.After(time.Second):
		t.Fatal("subscriber did not receive the error line")
	}

	// Info lines must be filtered out for a warn-level subscriber.
	select {
	case line := <-ch:
		t.Fatalf("subscriber unexpectedly got %q", line)
	case <-time.After(50 * time.Millisecond):
	}

	unsub()
	f.ingest("time=3 level=ERROR msg=after-unsub\n")
	select {
	case line := <-ch:
		t.Fatalf("got line after unsubscribe: %q", line)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestLogFanout_SlowSubscriberDoesNotBlockEngine(t *testing.T) {
	f := newTestFanout()
	_, unsub := f.Subscribe(slog.LevelInfo)
	defer unsub()

	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; i < logSubChanCap*3; i++ {
			f.ingest("time=x level=INFO msg=flood\n")
		}
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("fanout blocked on a full subscriber channel")
	}
}

func TestLogFanout_ForwardsToWrappedWriter(t *testing.T) {
	f := newTestFanout()
	var sb strings.Builder
	f.next = &sb
	if _, err := f.Write([]byte("time=1 level=INFO msg=hello\n")); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(sb.String(), "msg=hello") {
		t.Fatalf("wrapped writer missed the line: %q", sb.String())
	}
	if got := f.Tail(10, slog.LevelDebug); len(got) != 1 {
		t.Fatalf("ring missed the line: %v", got)
	}
}

func TestParseLogQueryLevel(t *testing.T) {
	cases := map[string]slog.Level{
		"debug":   slog.LevelDebug,
		"DEBUG":   slog.LevelDebug,
		"warn":    slog.LevelWarn,
		"warning": slog.LevelWarn,
		"error":   slog.LevelError,
		"":        slog.LevelInfo,
		"bogus":   slog.LevelInfo,
	}
	for in, want := range cases {
		if got := ParseLogQueryLevel(in); got != want {
			t.Errorf("ParseLogQueryLevel(%q) = %v, want %v", in, got, want)
		}
	}
}
