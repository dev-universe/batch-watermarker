param([string]$Target = 'x86_64-pc-windows-msvc', [string]$NsisPath = '')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$version = (Select-String -LiteralPath "$repo\Cargo.toml" -Pattern '^version = "([^"]+)"').Matches[0].Groups[1].Value
$binaryDir = Join-Path $repo "target\$Target\release"
if (!(Test-Path -LiteralPath "$binaryDir\batch-watermarker.exe")) { $binaryDir = Join-Path $repo 'target\release' }
$outputDir = Join-Path $repo 'release\rust'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$stage = Join-Path $repo "tmp\windows-package-$version"
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item -LiteralPath "$binaryDir\batch-watermarker.exe" -Destination "$stage\Batch Watermarker.exe"
Copy-Item -LiteralPath "$binaryDir\watermark-cli.exe" -Destination $stage
Copy-Item -LiteralPath "$repo\README.md", "$repo\LICENSE", "$repo\THIRD_PARTY_NOTICES.md" -Destination $stage
$zip = Join-Path $outputDir "Batch-Watermarker-$version-windows-x64.zip"
Compress-Archive -Path "$stage\*" -DestinationPath $zip -Force
if (!$NsisPath) {
    $nsis = Get-Command makensis.exe -ErrorAction SilentlyContinue
    if (!$nsis) { $NsisPath = 'C:\Program Files (x86)\NSIS\makensis.exe' } else { $NsisPath = $nsis.Source }
}
if (!(Test-Path -LiteralPath $nsisPath)) { throw 'NSIS is required to create the Windows installer.' }
& $nsisPath "/DVERSION=$version" "/DSTAGE=$stage" "/DOUTPUT=$outputDir" "$PSScriptRoot\windows-installer.nsi"
if ($LASTEXITCODE -ne 0) { throw 'NSIS installer creation failed.' }
foreach ($path in @($zip, (Join-Path $outputDir "Batch-Watermarker-$version-windows-x64-setup.exe"))) {
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText("$path.sha256", "$hash  $([IO.Path]::GetFileName($path))`n", [Text.Encoding]::ASCII)
}
