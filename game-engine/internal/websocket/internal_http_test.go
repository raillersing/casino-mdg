package websocket

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestInternalHTTPClientDoesNotFollowRedirects(t *testing.T) {
	var calls atomic.Int32
	destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer destination.Close()
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, destination.URL, http.StatusTemporaryRedirect)
	}))
	defer source.Close()

	req, err := http.NewRequest(http.MethodGet, source.URL, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("X-Game-Engine-Secret", "test-only")
	resp, err := sharedHTTPClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusTemporaryRedirect || calls.Load() != 0 {
		t.Fatalf("unexpected redirect behavior: status=%d calls=%d", resp.StatusCode, calls.Load())
	}
}
