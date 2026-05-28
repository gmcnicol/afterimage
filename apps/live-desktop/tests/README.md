# Tests

## Smoke

Run the preview trust smoke path with:

```sh
pnpm --filter @afterimage/live-desktop test:smoke
```

`preview-trust-smoke.test.ts` validates that the canonical fixture can flow from
Studio-owned composition and capture replay state into preview render graph
planning, FFmpeg command-preview adapter readiness, and trust diagnostics.
