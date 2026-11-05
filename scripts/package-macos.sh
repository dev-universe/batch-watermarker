#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
target="${1:?Rust target required}"
version="$(sed -n 's/^version = "\([^"]*\)"/\1/p' Cargo.toml | head -1)"
arch="${target%%-*}"
stage="tmp/macos-package-$arch"
app="$stage/Batch Watermarker.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources" release/rust
cp "target/$target/release/batch-watermarker" "$app/Contents/MacOS/Batch Watermarker"
cp "target/$target/release/watermark-cli" "$stage/"
cp README.md LICENSE THIRD_PARTY_NOTICES.md "$stage/"
iconset="$stage/AppIcon.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" assets/icon.png --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" assets/icon.png --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$app/Contents/Resources/AppIcon.icns"
# Build inputs above are copied explicitly into the distribution directory.
cat > "$app/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Batch Watermarker</string>
<key>CFBundleIdentifier</key><string>com.fd2.batchwatermarker</string>
<key>CFBundleName</key><string>Batch Watermarker</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$version</string>
<key>CFBundleVersion</key><string>$version</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>LSMinimumSystemVersion</key><string>11.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSDocumentsFolderUsageDescription</key><string>Open and save watermark documents.</string>
</dict></plist>
EOF
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"
distribution="tmp/macos-distribution-$arch"
mkdir -p "$distribution"
cp -R "$app" "$distribution/"
cp "$stage/watermark-cli" "$stage/README.md" "$stage/LICENSE" "$stage/THIRD_PARTY_NOTICES.md" "$distribution/"
ln -s /Applications "$distribution/Applications"
base="Batch-Watermarker-$version-macos-$arch"
hdiutil create -volname "Batch Watermarker $version" -srcfolder "$distribution" -ov -format UDZO "release/rust/$base.dmg"
ditto -c -k --sequesterRsrc --keepParent "$app" "release/rust/$base.zip"
(cd release/rust && shasum -a 256 "$base.dmg" > "$base.dmg.sha256" && shasum -a 256 "$base.zip" > "$base.zip.sha256")
