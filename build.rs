fn main() {
    println!("cargo:rerun-if-changed=assets/icon.ico");
    println!("cargo:rerun-if-changed=Cargo.toml");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        winresource::WindowsResource::new()
            .set_icon("assets/icon.ico")
            .set("ProductName", "Batch Watermarker")
            .set(
                "FileDescription",
                "Batch Watermarker native Rust application",
            )
            .set("LegalCopyright", "Copyright (c) 2026 dev-universe")
            .compile()
            .expect("Windows resources must compile");
    }
}
