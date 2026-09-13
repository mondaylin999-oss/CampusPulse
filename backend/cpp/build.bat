@echo off
REM ==========================================================================
REM  Builds the CampusPulse C++ engine on Windows.
REM
REM      backend\cppuild.bat
REM
REM  Produces  backend\cppuild\campus_engine.exe  (or build\Release\).
REM  Needs CMake + Visual Studio Build Tools, or g++ from MSYS2 / MinGW.
REM ==========================================================================
setlocal
cd /d "%~dp0"

where cmake >nul 2>nul
if %errorlevel%==0 (
  cmake -S . -B build
  cmake --build build --config Release
  echo.
  echo Built: %cd%uild\campus_engine.exe
  goto :eof
)

echo CMake was not found - falling back to a direct g++ build.
where g++ >nul 2>nul
if not %errorlevel%==0 (
  echo Neither CMake nor g++ is installed. The API will use its TypeScript
  echo fallback until one of them is available.
  exit /b 1
)
if not exist build mkdir build
g++ -std=c++20 -O2 -Iinclude src/FerryBusManagementService.cpp src/SeatPlanner.cpp src/MonthlyPassPlanner.cpp src/engine_main.cpp -o build/campus_engine.exe
echo.
echo Built: %cd%uild\campus_engine.exe
