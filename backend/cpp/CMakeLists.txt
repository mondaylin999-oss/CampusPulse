cmake_minimum_required(VERSION 3.16)
project(CampusPulseEngine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if (NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

# All three executables end up next to the build directory root, which is where
# backend/src/engine.ts looks for  campus_engine(.exe).
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY        ${CMAKE_BINARY_DIR})
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_DEBUG  ${CMAKE_BINARY_DIR})
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_BINARY_DIR})

# ---------------------------------------------------------------------------
# The domain library: every business rule of CampusPulse lives here.
# ---------------------------------------------------------------------------
add_library(campus_core
  src/FerryBusManagementService.cpp
  src/SeatPlanner.cpp
  src/MonthlyPassPlanner.cpp
)
target_include_directories(campus_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)

if (MSVC)
  target_compile_options(campus_core PRIVATE /W4)
else()
  target_compile_options(campus_core PRIVATE -Wall -Wextra -Wpedantic)
endif()

# ---------------------------------------------------------------------------
# campus_engine — the JSON command-line filter the Node API calls.
# ---------------------------------------------------------------------------
add_executable(campus_engine src/engine_main.cpp)
target_link_libraries(campus_engine PRIVATE campus_core)
