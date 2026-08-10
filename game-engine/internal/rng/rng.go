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
	// Rejection sampling for uniform distribution
	for {
		v := Uint32()
		if int(v) < n {
			return int(v)
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
