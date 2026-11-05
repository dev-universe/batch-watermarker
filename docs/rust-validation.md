# 2.0.0 Rust validation

Validated with 34 tests on Windows x64 with Rust 1.99.1; CI repeats engine/UI-state checks on Windows, macOS, and Linux.

The suite covers physical SVG units, viewBox sizing, external SVG rejection, allocation limits, alpha/DPI in PNG/JPEG/TIFF/WebP, crop/rotation/inherited PDF resources, vector text retention, image-only text removal, exact RGB reconstruction, adaptive predictors, 4:4:4 JPEG, fixed source dimensions, layer opacity/order, backgrounds, local inheritance/JSON roundtrips, atomic writes, duplicate/cross-input preflight, concurrent naming, failed-group rollback, cancellation, cache invalidation, unchanged source hashes, CLI export, independent GUI histories/profiles, import order, and preview generation invalidation.

Required checks: cargo fmt --all -- --check; cargo clippy --locked --all-targets -- -D warnings; cargo test --locked --all-targets; cargo build --release --locked --bins.

## Synthetic benchmark

Reproduce with cargo run --release --example benchmark -- tmp/rust-benchmark. The fixture is an A4 SVG with staves/notes and a translucent watermark. Timing includes composition and PDF encoding. Cached preview pixels are checked against the initial result. These describe this fixture on the development machine, not a guarantee or a comparison with 1.x.

| Measurement | Result |
| --- | --- |
| Cold 1400px preview | 228.45 ms |
| Cached preview, mean of 20 | 12.22 ms |
| Cold / cached | 18.69× |
| 600 DPI original | 4961 × 7016px, 261660 bytes, 1934 ms |
| 450 DPI quality | 3721 × 5262px, 172986 bytes, 1498 ms |
| 300 DPI distribution | 2481 × 3508px, 119268 bytes, 772 ms |

The 600 DPI profile is checked for exact decoded RGB. Lower profiles preserve physical dimensions and choose smaller JPEG/lossless streams; this flat artwork often stays lossless.

Native GUI smoke checks use synthetic files only. Windows installer packaging is verified with portable NSIS. CI verifies macOS bundles and ad-hoc signatures. Apple notarization and Windows code signing are not configured.
