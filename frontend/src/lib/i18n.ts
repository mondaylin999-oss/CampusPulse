// ===========================================================================
//  i18n.ts — English ⇄ Myanmar.
//
//  HOW IT WORKS
//  ------------
//  The key IS the English text. `t("Find a Room")` returns the Burmese when
//  the language is Myanmar and the exact English back when it is not, or when
//  a phrase has no translation yet. Nothing breaks if a line is missing — it
//  simply stays in English, so this file can be filled in over time.
//
//  TO CORRECT OR ADD A PHRASE
//  --------------------------
//  Find the English on the left and edit the Burmese on the right. That is the
//  whole job — no ids, no other file to touch. If you add a NEW English string
//  in a screen, add the same string here as a key.
//
//  Numbers, times, room numbers, kyat amounts and people's names are never
//  translated.
// ===========================================================================

export type Language = "en" | "my";

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  my: "မြန်မာ",
};

/** English → Myanmar. Anything not listed falls back to the English. */
export const MYANMAR: Record<string, string> = {
  // --- the shell and navigation --------------------------------------------
  CampusPulse: "CampusPulse",
  Campus: "ကျောင်းဝင်း",
  Home: "ပင်မစာမျက်နှာ",
  "Find a Room": "အခန်းလွတ် ရှာရန်",
  Find: "ရှာရန်",
  "Buildings & Rooms": "အဆောင်များနှင့် အခန်းများ",
  Rooms: "အခန်းများ",
  Timetable: "အချိန်ဇယား",
  "School Bus": "ကျောင်းကား",
  Bus: "ကျောင်းကား",
  "My Bus": "ကျွန်ုပ်၏ ကား",
  "Route & Map": "လမ်းကြောင်းနှင့် မြေပုံ",
  Route: "လမ်းကြောင်း",
  Profile: "ကိုယ်ရေးအချက်အလက်",
  "Admin Overview": "စီမံခန့်ခွဲမှု ခြုံငုံချက်",
  Admin: "စီမံခန့်ခွဲမှု",
  "Timetable Manager": "အချိန်ဇယား စီမံခန့်ခွဲမှု",
  "Campus & Rooms": "ကျောင်းဝင်းနှင့် အခန်းများ",
  "Timetable Changes": "အချိန်ဇယား ပြောင်းလဲမှုများ",
  Changes: "ပြောင်းလဲမှုများ",
  "People & Drivers": "အသုံးပြုသူများနှင့် ယာဉ်မောင်းများ",
  People: "အသုံးပြုသူများ",
  Administrator: "စီမံခန့်ခွဲသူ",
  Student: "ကျောင်းသား",
  "Bus driver": "ကားမောင်းသူ",
  Agent: "ကိုယ်စားလှယ်",
  "Log in": "ဝင်ရန်",
  "Agent login": "ကိုယ်စားလှယ် ဝင်ရောက်ရန်",
  "Log out": "ထွက်ရန်",
  "Sign in": "ဝင်ရန်",
  Connected: "ချိတ်ဆက်ပြီး",
  "Connecting…": "ချိတ်ဆက်နေသည်…",
  "Not connected — the server is not answering": "ချိတ်ဆက်မှု မရှိပါ — ဆာဗာ တုံ့ပြန်မှု မရှိပါ",
  Menu: "မီနူး",
  Close: "ပိတ်ရန်",
  Language: "ဘာသာစကား",
  Theme: "အသွင်အပြင်",
  "Dark mode": "အမှောင် အသွင်",
  "Light mode": "အလင်း အသွင်",

  // --- the room board ------------------------------------------------------
  "Need an empty classroom?": "အခန်းလွတ် လိုအပ်နေပါသလား?",
  "Find Available Room": "အခန်းလွတ် ရှာရန်",
  "Find an available room": "အခန်းလွတ် ရှာရန်",
  "Free right now": "ယခု လွတ်နေသည်",
  "Free now": "ယခု လွတ်နေသည်",
  Available: "လွတ်နေသည်",
  Occupied: "အသုံးပြုနေသည်",
  Closed: "ပိတ်ထားသည်",
  "Free briefly": "ခဏသာ လွတ်သည်",
  "Available soon": "မကြာမီ လွတ်မည်",
  Building: "အဆောင်",
  Buildings: "အဆောင်များ",
  Floor: "အထပ်",
  Floors: "အထပ်များ",
  Room: "အခန်း",
  "Room number": "အခန်းနံပါတ်",
  "Any building": "အဆောင် အားလုံး",
  "Any floor": "အထပ် အားလုံး",
  "All floors": "အထပ် အားလုံး",
  "I need it for": "အသုံးပြုလိုသော အချိန်",
  "30 minutes": "၃၀ မိနစ်",
  "1 hour": "၁ နာရီ",
  "2 hours": "၂ နာရီ",
  "3 hours": "၃ နာရီ",
  Now: "ယခု",
  Next: "နောက်တစ်ခု",
  "Nothing else today": "ယနေ့ အခြား မရှိတော့ပါ",
  "Nothing scheduled today": "ယနေ့ အချိန်ဇယား မရှိပါ",
  "Today in this room": "ယနေ့ ဤအခန်းတွင်",
  "Normal weekly timetable": "ပုံမှန် အပတ်စဉ် အချိန်ဇယား",
  "University holiday": "တက္ကသိုလ် ပိတ်ရက်",
  "Class cancelled": "အတန်း ဖျက်သိမ်းသည်",
  "Room changed": "အခန်း ပြောင်းသည်",
  "Time changed": "အချိန် ပြောင်းသည်",
  "Extra class": "အပို အတန်း",
  "Room closed": "အခန်း ပိတ်ထားသည်",
  "Class / batch": "အတန်း",
  Subject: "ဘာသာရပ်",
  Subjects: "ဘာသာရပ်များ",
  Teacher: "ဆရာ/ဆရာမ",
  Day: "နေ့",
  Starts: "စချိန်",
  Ends: "ဆုံးချိန်",
  Monday: "တနင်္လာ",
  Tuesday: "အင်္ဂါ",
  Wednesday: "ဗုဒ္ဓဟူး",
  Thursday: "ကြာသပတေး",
  Friday: "သောကြာ",
  Saturday: "စနေ",
  Sunday: "တနင်္ဂနွေ",

  // --- shared words --------------------------------------------------------
  Month: "လ",
  Months: "လများ",
  Seats: "ထိုင်ခုံများ",
  Seat: "ထိုင်ခုံ",
  Status: "အခြေအနေ",
  Name: "အမည်",
  Phone: "ဖုန်းနံပါတ်",
  Price: "စျေးနှုန်း",
  Total: "စုစုပေါင်း",
  Today: "ယနေ့",
  Date: "ရက်စွဲ",
  "Every day": "နေ့စဉ်",
  Morning: "မနက်",
  Evening: "ညနေ",
  Save: "သိမ်းရန်",
  Cancel: "ပယ်ဖျက်ရန်",
  Accept: "လက်ခံရန်",
  Approve: "ခွင့်ပြုရန်",
  Refuse: "ငြင်းပယ်ရန်",
  Confirm: "အတည်ပြုရန်",
  Add: "ထည့်ရန်",
  Remove: "ဖယ်ရှားရန်",
  Delete: "ဖျက်ရန်",
  Edit: "ပြင်ဆင်ရန်",
  Update: "ပြင်ဆင်ရန်",
  Search: "ရှာရန်",
  Refresh: "ပြန်လည်ရယူရန်",
  "Try again": "ထပ်စမ်းကြည့်ပါ",
  Loading: "ခဏစောင့်ပါ",
  "Loading…": "ခဏစောင့်ပါ…",
  Waiting: "စောင့်ဆိုင်းဆဲ",
  Confirmed: "အတည်ပြုပြီး",
  Cancelled: "ပယ်ဖျက်ပြီး",
  Pending: "စောင့်ဆိုင်းဆဲ",
  Active: "လုပ်ဆောင်ဆဲ",
  Inactive: "ရပ်ဆိုင်းထား",
  Unavailable: "မရရှိနိုင်ပါ",
  Operational: "အသုံးပြုနိုင်သည်",
  Maintenance: "ပြုပြင်ထိန်းသိမ်းရေး",
  Reported: "တင်ပြထားသည်",
  Resolved: "ဖြေရှင်းပြီး",

  // --- sign in -------------------------------------------------------------
  Username: "အသုံးပြုသူအမည်",
  Password: "စကားဝှက်",
  "Signing in…": "ဝင်ရောက်နေသည်…",
  "Create an account": "အကောင့်အသစ် ဖွင့်ရန်",

  // --- the school bus, student ---------------------------------------------
  "Bus routes": "ကား လမ်းကြောင်းများ",
  "My requests": "ကျွန်ုပ်၏ တောင်းဆိုမှုများ",
  "Bus leaves": "ကား ထွက်ချိန်",
  "Give it up": "ထိုင်ခုံ စွန့်လွှတ်ရန်",
  "Show route map": "လမ်းကြောင်း မြေပုံ ကြည့်ရန်",
  "Hide route map": "မြေပုံ ဖျောက်ရန်",
  "Open in OpenStreetMap": "OpenStreetMap တွင် ဖွင့်ရန်",

  // --- the school bus, driver ----------------------------------------------
  "Problems with the bus": "ကား ပြဿနာများ",
  "Open problems": "မဖြေရှင်းရသေးသော ပြဿနာများ",
  "I am available": "ကျွန်ုပ် အားနေသည်",
  "Not available": "အားမနေပါ",
  "Leaves in the morning": "မနက် ထွက်ချိန်",
  "Comes back in the evening": "ညနေ ပြန်ချိန်",
  "Selling from": "ရောင်းစတင်မည့်လ",
  "Selling until": "ရောင်းပြီးဆုံးမည့်လ",
  "Start point": "စတင်မည့်နေရာ",
  Destination: "ဆုံးမှတ်",
  "Pickup stops": "ကြိုမည့် မှတ်တိုင်များ",
  "Save route": "လမ်းကြောင်း သိမ်းရန်",
  "Route line": "လမ်းကြောင်း မျဉ်း",
  "Publish route line": "လမ်းကြောင်းမျဉ်း တင်ရန်",
  "Add point": "အမှတ် ထည့်ရန်",
  Colour: "အရောင်",
  "Report a problem": "ပြဿနာ တင်ပြရန်",

  // --- the office ----------------------------------------------------------
  "Add an account": "အကောင့် ဖွင့်ရန်",
  "Create account": "အကောင့် ဖွင့်ရန်",
  Role: "ရာထူး",
  Deactivate: "ပိတ်ရန်",
  Activate: "ဖွင့်ရန်",
  "Nothing waiting": "စောင့်ဆိုင်းနေသည် မရှိပါ",
  "Add a session": "အတန်းချိန် ထည့်ရန်",
  "Add session": "အတန်းချိန် ထည့်ရန်",
  "Add building": "အဆောင် ထည့်ရန်",
  "Add room": "အခန်း ထည့်ရန်",
  "Add class": "အတန်း ထည့်ရန်",
  "Add subject": "ဘာသာရပ် ထည့်ရန်",
  "Publish change": "ပြောင်းလဲမှု ကြေညာရန်",
};

export function translate(text: string, language: Language) {
  if (language === "en") return text;
  return MYANMAR[text] ?? text;
}
