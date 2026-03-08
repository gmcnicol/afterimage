package config

import "os"

type Config struct {
	RuntimeMode         string
	HealthListenAddress string
}

func Load() (Config, error) {
	cfg := Config{
		RuntimeMode:         envOrDefault("AFTERIMAGE_RUNTIME_MODE", "live-appliance"),
		HealthListenAddress: envOrDefault("AFTERIMAGE_HEALTH_ADDR", ":8080"),
	}
	return cfg, nil
}

func envOrDefault(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
