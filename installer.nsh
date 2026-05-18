; Custom NSIS macros for electron-builder.
; Wired through electron-builder.json[nsis.include].

!include "LogicLib.nsh"

; Forces per-user install and skips the "for all users / only for me" page.
; See node_modules/app-builder-lib/templates/nsis/multiUserUi.nsh.
!macro customInstallMode
    StrCpy $isForceCurrentInstall "1"
!macroend
