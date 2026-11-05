Batch Watermarker 2.0.0 replaces the Electron/React/TypeScript application with a native Rust desktop app and CLI.

- Both watermark and grouped transparent-image editors are implemented in Rust.
- PDF preview/rendering, SVG/raster codecs, layered composition, and exports use Rust implementations. Node.js, Chromium, Sharp, PDF.js, and external PDF runtimes are removed.
- Preserves vector PDFs, offers 600/450/300 DPI image-only profiles, and handles crop/rotation, transparent watermarks, and per-group overrides.
- Bounded source/transform caches, cached PDF preview bases, coalesced asynchronous previews, exact-size rendering, and optimized release builds reduce repeated work and memory copies.
- Adds a CLI with JSON batch/project support and machine-readable results.
- Atomic publication, overwrite preflight, exclusive numbered group outputs, error isolation, and cancellation protect existing files.
- CI validates Windows, macOS, and Linux and produces Windows x64 portable/installer and Apple Silicon/Intel Mac packages with SHA-256 checksums.

Windows ZIP includes GUI and CLI. Mac DMGs include app and CLI; Mac ZIPs contain the app. Packages are unsigned on Windows and ad-hoc signed on macOS; Apple notarization is not configured. Encrypted PDFs are unsupported. GUI projects remain session-local, as in 1.x. SVG inputs in the normal editor export as PNG.

Validation and reproducible benchmark details are recorded in docs/rust-validation.md in the source repository.
