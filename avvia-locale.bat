@echo off
REM ====================================================
REM  Arbora - avvio server di sviluppo locale
REM  Doppio click per lanciare l'app in locale (hot reload)
REM ====================================================
cd /d "%~dp0"

echo.
echo === Avvio Arbora in locale ===
echo.

REM Installa le dipendenze solo la prima volta (se manca node_modules)
if not exist "node_modules" (
    echo Prima esecuzione: installo le dipendenze, attendi...
    echo.
    call npm install
    echo.
)

echo Avvio del server di sviluppo...
echo Il browser si aprira' da solo. Per fermare: chiudi questa finestra o premi Ctrl+C.
echo.

call npm run dev -- --open

pause
