#!/usr/bin/env bash
# ===========================================================================
#  Builds the CampusPulse C++ engine (macOS / Linux / Git Bash / WSL).
#
#      bash backend/cpp/build.sh
#
#  Produces  backend/cpp/build/campus_engine  — the binary the Node API calls
#  for the school-bus seat rules. Until it exists the API uses the TypeScript
#  twin of the same rules and says so on /health, so this build is optional.
#
#  CMake is tried first; if it is missing OR cannot find a generator (common
#  in Git Bash on Windows, where CMake looks for nmake), the script falls back
#  to a plain g++ call, which is all this engine actually needs.
# ===========================================================================
set -u
cd "$(dirname "$0")"

SOURCES="src/FerryBusManagementService.cpp src/SeatPlanner.cpp src/MonthlyPassPlanner.cpp"

if command -v cmake >/dev/null 2>&1; then
  if cmake -S . -B build -DCMAKE_BUILD_TYPE=Release >/dev/null 2>&1 && cmake --build build --config Release; then
    echo
    echo "Built: $(pwd)/build/campus_engine"
    exit 0
  fi
  echo "CMake could not configure a build here — falling back to a direct g++ build."
  rm -rf build
fi

COMPILER="${CXX:-g++}"
if ! command -v "$COMPILER" >/dev/null 2>&1; then
  echo "Neither CMake nor $COMPILER is usable."
  echo "The API will keep using its TypeScript fallback — nothing is broken."
  exit 1
fi

mkdir -p build
$COMPILER -std=c++20 -O2 -Iinclude $SOURCES src/engine_main.cpp -o build/campus_engine
echo
echo "Built: $(pwd)/build/campus_engine"
