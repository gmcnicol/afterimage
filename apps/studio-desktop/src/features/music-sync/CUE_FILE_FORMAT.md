# Afterimage Cue File

Afterimage custom cue files are JSON.

Use this shape:

```json
{
  "version": 1,
  "cues": [
    { "timeMs": 0, "label": "Intro", "kind": "chapter" },
    { "timeMs": 15420, "label": "Hit 1", "kind": "beat" },
    { "timeMs": 30960, "label": "Cut point", "kind": "marker" }
  ]
}
```

Fields:

- `timeMs`: required integer or number, cue time from the start of the project tune.
- `label`: optional string. Defaults to `Cue N`.
- `kind`: optional `marker`, `beat`, or `chapter`. Defaults to `marker`.

Importing a cue file replaces existing custom cue markers in the active sequence.
