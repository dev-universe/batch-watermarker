Unicode true
!include "MUI2.nsh"
Name "Batch Watermarker"
OutFile "${OUTPUT}\Batch-Watermarker-${VERSION}-windows-x64-setup.exe"
InstallDir "$LOCALAPPDATA\Programs\Batch Watermarker"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Batch Watermarker"
VIAddVersionKey "FileDescription" "Batch Watermarker installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Copyright (c) 2026 dev-universe"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Korean"
Section "Install"
  SetOutPath "$INSTDIR"
  File "${STAGE}\Batch Watermarker.exe"
  File "${STAGE}\watermark-cli.exe"
  File "${STAGE}\README.md"
  File "${STAGE}\LICENSE"
  File "${STAGE}\THIRD_PARTY_NOTICES.md"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\Batch Watermarker.lnk" "$INSTDIR\Batch Watermarker.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BatchWatermarker" "DisplayName" "Batch Watermarker"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BatchWatermarker" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BatchWatermarker" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BatchWatermarker" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BatchWatermarker" "NoRepair" 1
SectionEnd
Section "Uninstall"
  Delete "$SMPROGRAMS\Batch Watermarker.lnk"
  Delete "$INSTDIR\Batch Watermarker.exe"
  Delete "$INSTDIR\watermark-cli.exe"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\THIRD_PARTY_NOTICES.md"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BatchWatermarker"
SectionEnd
