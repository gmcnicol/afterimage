# Scene detection

Scene detection is an offline-first feature.

It is used to:

- analyse long-form footage
- find candidate cuts
- build edit material for Studio mode

Live runtimes may consume pre-analysed clip metadata but should not depend on heavyweight analysis in the hot path.
