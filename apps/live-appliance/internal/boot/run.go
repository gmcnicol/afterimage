package boot

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/example/afterimage/live-appliance/internal/config"
	"github.com/example/afterimage/live-appliance/internal/health"
)

func Run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	server := health.NewServer(cfg.HealthListenAddress)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		if err := server.Start(); err != nil {
			log.Printf("health server stopped: %v", err)
		}
	}()

	log.Printf("afterimage appliance booted in %s mode", cfg.RuntimeMode)
	log.Printf("TODO: attach FFmpeg worker, MIDI input, outputs, and remote control services")

	<-ctx.Done()
	log.Printf("shutdown requested")
	return server.Stop(context.Background())
}
