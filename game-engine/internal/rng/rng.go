package rng

import (
	"crypto/rand"
	"encoding/binary"
)

// CSPRNG using crypto/rand (audit-ready)
func Uint32() uint32 {
	var buf [4]byte
	if _, err := rand.Read(buf[:]); err != nil {
		panic("RNG failure: " + err.Error())
	}
	return binary.BigEndian.Uint32(buf[:])
}

func Intn(n int) int {
	if n <= 0 {
		panic("n must be positive")
	}
	// Rejection sampling for a uniform value in [0,n). Comparing the raw
	// uint32 directly to n would make normal card-deck draws practically loop
	// forever.
	limit := ^uint32(0) - (^uint32(0) % uint32(n))
	for {
		v := Uint32()
		if v < limit {
			return int(v % uint32(n))
		}
	}
}

// Shuffle implements Fisher-Yates using CSPRNG
func Shuffle(n int, swap func(i, j int)) {
	for i := n - 1; i > 0; i-- {
		j := Intn(i + 1)
		swap(i, j)
	}
}
