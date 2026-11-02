package core

import (
	"io"
	"log/slog"
	"strconv"
	"strings"
	"sync"
	"time"
)

// LogFanout is an io.Writer decorator that tees slog text output to
// in-process subscribers (management API SSE log stream) while keeping
// the most recent lines in a ring buffer for tailing.
//
// It wraps the writer passed to slog's TextHandler, so it works no matter
// where the engine logs (stdout, daemon file, desktop app data dir).
// Lines are plain text; the level is parsed from the slog "level=…"
// field. Subscriber channels are drop-oldest on overflow: a slow SSE
// client never blocks or loses the engine.
type LogFanout struct {
	next io.Writer

	mu      sync.Mutex
	pending strings.Builder // partial line between Write calls
	ring    []string
	subs    map[chan string]slog.Level
}

const (
	logRingCap    = 1000
	logSubChanCap = 256
	logPendingCap = 64 * 1024
)

var (
	globalLogFanoutOnce sync.Once
	globalLogFanout     *LogFanout
)

// GlobalLogFanout returns the process-wide log fanout. setupLogger wraps
// its writer with it; the management API reads from the same instance.
func GlobalLogFanout() *LogFanout {
	globalLogFanoutOnce.Do(func() {
		globalLogFanout = &LogFanout{subs: make(map[chan string]slog.Level)}
	})
	return globalLogFanout
}

// AttachLogFanout wraps w so everything written through it is also
// captured by the global fanout. Use as the writer for the engine's
// slog handler.
func AttachLogFanout(w io.Writer) io.Writer {
	f := GlobalLogFanout()
	f.mu.Lock()
	f.next = w
	f.mu.Unlock()
	return f
}

// Write implements io.Writer, forwarding to the wrapped writer and
// broadcasting complete lines to subscribers.
func (f *LogFanout) Write(p []byte) (int, error) {
	f.mu.Lock()
	next := f.next
	f.mu.Unlock()

	var writeErr error
	if next != nil {
		if _, err := next.Write(p); err != nil {
			writeErr = err
		}
	}

	f.ingest(string(p))
	return len(p), writeErr
}

func (f *LogFanout) ingest(chunk string) {
	var complete []string
	f.mu.Lock()
	f.pending.WriteString(chunk)
	for {
		s := f.pending.String()
		i := strings.IndexByte(s, '\n')
		if i < 0 {
			break
		}
		f.pending.Reset()
		f.pending.WriteString(s[i+1:])
		if line := strings.TrimSpace(s[:i]); line != "" {
			complete = append(complete, line)
		}
	}
	if f.pending.Len() > logPendingCap {
		// A pathological writer never emitted a newline; drop the backlog
		// rather than grow without bound.
		f.pending.Reset()
	}
	for _, line := range complete {
		f.ring = append(f.ring, line)
	}
	if overflow := len(f.ring) - logRingCap; overflow > 0 {
		f.ring = f.ring[overflow:]
	}
	for ch, minLevel := range f.subs {
		for _, line := range complete {
			if parseLogLineLevel(line) < minLevel {
				continue
			}
			select {
			case ch <- line:
			default: // slow subscriber: drop rather than block the engine
			}
		}
	}
	f.mu.Unlock()
}

// Subscribe registers a subscriber receiving raw log lines at or above
// the given level. The returned func unsubscribes.
func (f *LogFanout) Subscribe(level slog.Level) (<-chan string, func()) {
	ch := make(chan string, logSubChanCap)
	f.mu.Lock()
	f.subs[ch] = level
	f.mu.Unlock()
	return ch, func() {
		f.mu.Lock()
		delete(f.subs, ch)
		f.mu.Unlock()
	}
}

// Tail returns up to n most recent lines at or above level, oldest first.
func (f *LogFanout) Tail(n int, level slog.Level) []string {
	if n <= 0 {
		return nil
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	start := 0
	if len(f.ring) > n {
		start = len(f.ring) - n
	}
	out := make([]string, 0, len(f.ring)-start)
	for _, line := range f.ring[start:] {
		if parseLogLineLevel(line) >= level {
			out = append(out, line)
		}
	}
	return out
}

// parseLogLineLevel extracts the level from a slog TextHandler line
// ("time=… level=INFO msg=…"). Unparseable lines count as Info.
func parseLogLineLevel(line string) slog.Level {
	i := strings.Index(line, "level=")
	if i < 0 {
		return slog.LevelInfo
	}
	v := line[i+len("level="):]
	if j := strings.IndexByte(v, ' '); j >= 0 {
		v = v[:j]
	}
	switch v {
	case "DEBUG":
		return slog.LevelDebug
	case "INFO":
		return slog.LevelInfo
	case "WARN":
		return slog.LevelWarn
	case "ERROR":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// ParseLogQueryLevel maps a query-string level name to slog.Level.
func ParseLogQueryLevel(s string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// logSSEHeartbeat is the interval between SSE comment pings that keep
// proxies from closing an idle log stream.
const logSSEHeartbeat = 15 * time.Second

// jsonEscapeLogLine renders one log line as a JSON string body (without
// the surrounding quotes), escaping per RFC 8259.
func jsonEscapeLogLine(line string) string {
	var b strings.Builder
	for _, r := range line {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				b.WriteString(`\u`)
				b.WriteString(strconv.FormatInt(int64(r), 16))
			} else {
				b.WriteRune(r)
			}
		}
	}
	return b.String()
}
