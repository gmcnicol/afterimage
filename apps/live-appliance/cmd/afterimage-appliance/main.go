package main

import (
	"log"

	"github.com/example/afterimage/live-appliance/internal/boot"
)

func main() {
	if err := boot.Run(); err != nil {
		log.Fatal(err)
	}
}
