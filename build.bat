@echo off
echo 🛡️ Building JADE Extension...

REM Create dist folder
if exist dist rmdir /s /q dist
mkdir dist\jade-extension

REM Copy files
xcopy manifest.json dist\jade-extension\ /Y
xcopy inject.js dist\jade-extension\ /Y
xcopy background dist\jade-extension\background\ /E /Y
xcopy content dist\jade-extension\content\ /E /Y
xcopy popup dist\jade-extension\popup\ /E /Y
xcopy options dist\jade-extension\options\ /E /Y
xcopy README.md dist\jade-extension\ /Y
xcopy test.html dist\jade-extension\ /Y
xcopy INSTALLATION.md dist\jade-extension\ /Y
xcopy CHECKLIST.md dist\jade-extension\ /Y

REM Create ZIP (requires PowerShell or 7-Zip)
powershell -Command "Compress-Archive -Path 'dist\jade-extension\*' -DestinationPath 'jade-extension.zip' -Force"

echo ✅ Build complete!
echo 📦 Extension packaged: jade-extension.zip
echo 📁 Unpacked files: dist\jade-extension\
echo.
echo 📌 To install:
echo 1. Go to chrome://extensions/
echo 2. Enable Developer Mode
echo 3. Click 'Load unpacked'
echo 4. Select 'dist\jade-extension\' folder
pause