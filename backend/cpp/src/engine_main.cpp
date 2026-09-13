// ===========================================================================
//  engine_main.cpp — the CampusPulse C++ engine (executable: campus_engine)
//
//  This is the program the Node API shells out to for the SCHOOL BUS seat
//  rules: who may ask for a monthly seat, how many are left, whether the
//  driver may accept one. It is a plain, portable command-line filter, so it
//  can also be driven by hand:
//
//      echo '{"roads":[],"passes":[]}' | ./build/campus_engine ferry.planMonth
//      ./build/campus_engine info
//
//  Room availability is NOT here. It is a pure, side-effect-free calculation
//  over the timetable and the clock, and it lives in one readable TypeScript
//  module (backend/src/rooms/availability.ts) that the API calls directly —
//  sending the whole timetable through a subprocess on every page view would
//  cost far more than it explains.
//
//  Contract
//  --------
//    argv[1]  the command name
//    stdin    one JSON object (the request)
//    stdout   one JSON object:  {"ok":true,"result":…}
//                          or:  {"ok":false,"error":"…"}
//    exit 0   the command ran (even when ok:false — a rule said no)
//    exit 2   the command name is unknown / the request was not valid JSON
//
//  The Node side (backend/src/engine.ts) parses that object. If the binary is
//  missing it falls back to a TypeScript implementation of the same rules, so
//  the app still runs before anyone has compiled the C++.
// ===========================================================================

#include "Json.hpp"
#include "SeatPlanner.hpp"
#include "MonthlyPassPlanner.hpp"

#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#ifdef _WIN32
#include <io.h>
#else
#include <unistd.h>
#endif

using bng::Json;

namespace {

constexpr const char* kEngineVersion = "1.0.0";

// ---------------------------------------------------------------------------
// JSON -> domain structs
// ---------------------------------------------------------------------------

seatplan::TripRow readTrip(const Json& value) {
  seatplan::TripRow trip;
  trip.tripId = value["tripId"].asInt();
  trip.routeId = value["routeId"].asInt();
  trip.vehicleId = value["vehicleId"].asInt();
  trip.driverId = value["driverId"].asInt();
  trip.totalSeats = static_cast<int>(value["totalSeats"].asInt());
  trip.fareCents = static_cast<int>(value["fareCents"].asInt());
  trip.status = value["status"].asString("scheduled");
  trip.routeStatus = value["routeStatus"].asString("active");
  trip.vehicleStatus = value["vehicleStatus"].asString("operational");
  return trip;
}

std::vector<seatplan::TripRow> readTrips(const Json& value) {
  std::vector<seatplan::TripRow> trips;
  for (const auto& entry : value.items()) trips.push_back(readTrip(entry));
  return trips;
}

std::vector<seatplan::BookingRow> readBookings(const Json& value) {
  std::vector<seatplan::BookingRow> bookings;
  for (const auto& entry : value.items()) {
    seatplan::BookingRow booking;
    booking.id = entry["id"].asInt();
    booking.tripId = entry["tripId"].asInt();
    booking.userId = entry["userId"].asInt();
    booking.seatCount = static_cast<int>(entry["seatCount"].asInt(1));
    booking.status = entry["status"].asString("pending");
    bookings.push_back(booking);
  }
  return bookings;
}

ferrypass::RoadMonth readRoadMonth(const Json& value) {
  ferrypass::RoadMonth road;
  road.routeId = value["routeId"].asInt();
  road.vehicleId = value["vehicleId"].asInt();
  road.driverId = value["driverId"].asInt();
  road.totalSeats = static_cast<int>(value["totalSeats"].asInt());
  road.monthlyFareCents = static_cast<int>(value["monthlyFareCents"].asInt());
  road.month = value["month"].asString("");
  road.routeStatus = value["routeStatus"].asString("active");
  road.vehicleStatus = value["vehicleStatus"].asString("operational");
  return road;
}

std::vector<ferrypass::RoadMonth> readRoadMonths(const Json& value) {
  std::vector<ferrypass::RoadMonth> roads;
  for (const auto& entry : value.items()) roads.push_back(readRoadMonth(entry));
  return roads;
}

std::vector<ferrypass::PassRow> readPasses(const Json& value) {
  std::vector<ferrypass::PassRow> passes;
  for (const auto& entry : value.items()) {
    ferrypass::PassRow pass;
    pass.id = entry["id"].asInt();
    pass.routeId = entry["routeId"].asInt();
    pass.userId = entry["userId"].asInt();
    pass.seatCount = static_cast<int>(entry["seatCount"].asInt(1));
    pass.month = entry["month"].asString("");
    pass.status = entry["status"].asString("pending");
    passes.push_back(pass);
  }
  return passes;
}

Json writePassDecision(const ferrypass::PassDecision& decision) {
  Json out = Json::object();
  out.set("allowed", Json(decision.allowed));
  out.set("reason", Json(decision.reason));
  out.set("fareCents", Json(static_cast<long long>(decision.fareCents)));
  out.set("availableSeats", Json(static_cast<long long>(decision.availableSeats)));
  return out;
}

// ---------------------------------------------------------------------------
// domain structs -> JSON
// ---------------------------------------------------------------------------

Json writeDecision(const seatplan::Decision& decision) {
  Json out = Json::object();
  out.set("allowed", Json(decision.allowed));
  out.set("reason", Json(decision.reason));
  out.set("fareCents", Json(static_cast<long long>(decision.fareCents)));
  out.set("availableSeats", Json(static_cast<long long>(decision.availableSeats)));
  return out;
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

Json runCommand(const std::string& command, const Json& request) {
  if (command == "info") {
    Json out = Json::object();
    out.set("engine", Json("c++"));
    out.set("version", Json(kEngineVersion));
    out.set("standard", Json(static_cast<long long>(__cplusplus)));
    Json commands = Json::array();
    for (const char* name : {"info", "ferry.plan", "ferry.canRequest", "ferry.canConfirm", "ferry.capacityFloor",
                             "ferry.planMonth", "ferry.canRequestMonth", "ferry.canAcceptMonth",
                             "ferry.monthCapacityFloor"})
      commands.push(Json(name));
    out.set("commands", commands);
    return out;
  }

  if (command == "ferry.plan") {
    const auto plans = seatplan::SeatPlanner::plan(readTrips(request["trips"]), readBookings(request["bookings"]));
    Json out = Json::array();
    for (const auto& seats : plans) {
      Json item = Json::object();
      item.set("tripId", Json(seats.tripId));
      item.set("totalSeats", Json(static_cast<long long>(seats.totalSeats)));
      item.set("occupiedSeats", Json(static_cast<long long>(seats.occupiedSeats)));
      item.set("pendingSeats", Json(static_cast<long long>(seats.pendingSeats)));
      item.set("availableSeats", Json(static_cast<long long>(seats.availableSeats)));
      item.set("loadPercent", Json(seats.loadPercent));
      item.set("bookable", Json(seats.bookable));
      out.push(item);
    }
    Json wrapper = Json::object();
    wrapper.set("trips", out);
    return wrapper;
  }

  if (command == "ferry.canRequest")
    return writeDecision(seatplan::SeatPlanner::canRequest(readTrip(request["trip"]), readBookings(request["bookings"]),
                                                           request["userId"].asInt(), static_cast<int>(request["seatCount"].asInt(1))));

  if (command == "ferry.canConfirm")
    return writeDecision(seatplan::SeatPlanner::canConfirm(readTrip(request["trip"]), readBookings(request["bookings"]), request["bookingId"].asInt()));

  if (command == "ferry.capacityFloor") {
    const int floor = seatplan::SeatPlanner::committedSeatsForVehicle(request["vehicleId"].asInt(), readTrips(request["trips"]), readBookings(request["bookings"]));
    Json out = Json::object();
    out.set("committedSeats", Json(static_cast<long long>(floor)));
    return out;
  }

  // --- the ferry sold by the month -----------------------------------------

  if (command == "ferry.planMonth") {
    const auto plans = ferrypass::MonthlyPassPlanner::plan(readRoadMonths(request["roads"]), readPasses(request["passes"]));
    Json out = Json::array();
    for (const auto& seats : plans) {
      Json item = Json::object();
      item.set("routeId", Json(seats.routeId));
      item.set("month", Json(seats.month));
      item.set("totalSeats", Json(static_cast<long long>(seats.totalSeats)));
      item.set("occupiedSeats", Json(static_cast<long long>(seats.occupiedSeats)));
      item.set("pendingSeats", Json(static_cast<long long>(seats.pendingSeats)));
      item.set("availableSeats", Json(static_cast<long long>(seats.availableSeats)));
      item.set("loadPercent", Json(seats.loadPercent));
      item.set("sellable", Json(seats.sellable));
      out.push(item);
    }
    Json wrapper = Json::object();
    wrapper.set("roads", out);
    return wrapper;
  }

  if (command == "ferry.canRequestMonth")
    return writePassDecision(ferrypass::MonthlyPassPlanner::canRequest(readRoadMonth(request["road"]), readPasses(request["passes"]),
                                                                       request["userId"].asInt(),
                                                                       static_cast<int>(request["seatCount"].asInt(1)),
                                                                       request["currentMonth"].asString("")));

  if (command == "ferry.canAcceptMonth")
    return writePassDecision(
        ferrypass::MonthlyPassPlanner::canAccept(readRoadMonth(request["road"]), readPasses(request["passes"]), request["passId"].asInt()));

  if (command == "ferry.monthCapacityFloor") {
    const int floor = ferrypass::MonthlyPassPlanner::committedSeatsForRoute(request["routeId"].asInt(), readPasses(request["passes"]));
    Json out = Json::object();
    out.set("committedSeats", Json(static_cast<long long>(floor)));
    return out;
  }

  throw std::runtime_error("Unknown engine command: " + command);
}

/** True when stdin is an interactive terminal — then there is nothing to read. */
bool stdinIsTerminal() {
#ifdef _WIN32
  return _isatty(_fileno(stdin)) != 0;
#else
  return isatty(fileno(stdin)) != 0;
#endif
}

Json readRequest(int argc, char** argv) {
  // The payload normally arrives on stdin; a second argument is accepted so
  // the engine can be poked from a shell without a here-doc. When the engine
  // is run by hand with no payload at all (`campus_engine info`) stdin is a
  // terminal, and reading it would hang — so that case returns an empty
  // request instead.
  if (argc >= 3) return Json::parse(argv[2]);
  if (stdinIsTerminal()) return Json::object();
  std::ostringstream buffer;
  buffer << std::cin.rdbuf();
  const std::string text = buffer.str();
  if (text.find_first_not_of(" \t\r\n") == std::string::npos) return Json::object();
  return Json::parse(text);
}

}  // namespace

int main(int argc, char** argv) {
  std::ios::sync_with_stdio(false);

  if (argc < 2) {
    std::cout << R"JSON({"ok":false,"error":"Usage: campus_engine <command> [json] — the payload may also be piped on stdin"})JSON" << '\n';
    return 2;
  }

  const std::string command = argv[1];
  Json request;
  try {
    request = readRequest(argc, argv);
  } catch (const std::exception& error) {
    Json out = Json::object();
    out.set("ok", Json(false));
    out.set("error", Json(std::string("Invalid JSON request: ") + error.what()));
    std::cout << out.dump() << '\n';
    return 2;
  }

  try {
    Json out = Json::object();
    out.set("ok", Json(true));
    out.set("result", runCommand(command, request));
    std::cout << out.dump() << '\n';
    return 0;
  } catch (const std::exception& error) {
    const bool unknownCommand = std::string(error.what()).rfind("Unknown engine command", 0) == 0;
    Json out = Json::object();
    out.set("ok", Json(false));
    out.set("error", Json(std::string(error.what())));
    std::cout << out.dump() << '\n';
    return unknownCommand ? 2 : 0;
  }
}
