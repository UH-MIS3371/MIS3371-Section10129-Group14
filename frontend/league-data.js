// MarketStreet Weekly League data (demo season), shared by league.js and the Home page.
// One hardcoded week (5 market days). Each day has a headline modelled on real market events and the price moves it
// caused. Everyone starts with $10,000; 9 pretend rivals buy on day 1 and hold. Kept in this browser (localStorage).

const LEAGUE_KEY = "marketstreet-league-demo";
const START_CASH = 1000000; // cents

const LEAGUE_STOCKS = {
  AAPL: { name: "Apple", price: 19000 },
  NVDA: { name: "NVIDIA", price: 12000 },
  MSFT: { name: "Microsoft", price: 41000 },
  JPM: { name: "JPMorgan Chase", price: 19500 },
  XOM: { name: "Exxon Mobil", price: 11200 },
  DAL: { name: "Delta Air Lines", price: 4800 },
  WMT: { name: "Walmart", price: 6800 },
  KO: { name: "Coca-Cola", price: 6200 }
};

// Percent move of each stock on each day, caused by that day's headline.
// preview is what was known in advance (the scheduled event, never the outcome), shown under "Coming up".
const WEEK = [
  { day: "Monday", preview: "Fed chair speaks at 1 PM", headline: "Fed hints at a rate cut later this year", note: "Cheaper borrowing lifts growth stocks; banks earn a little less on loans.",
    moves: { AAPL: 2.5, NVDA: 4, MSFT: 2, JPM: -1, XOM: 0, DAL: 1, WMT: 0.5, KO: 0 } },
  { day: "Tuesday", preview: "Nothing scheduled. Watch for surprises.", headline: "Oil supply shock after a major pipeline outage", note: "Oil producers gain; airlines pay more for fuel.",
    moves: { AAPL: -0.5, NVDA: -1, MSFT: -0.5, JPM: -0.5, XOM: 7, DAL: -6, WMT: -0.5, KO: 0 } },
  { day: "Wednesday", preview: "Regional banks report earnings", headline: "Rumours of a regional bank failure spread", note: "Fear hits banks hardest; investors move to safe, everyday brands.",
    moves: { AAPL: -2, NVDA: -3, MSFT: -1.5, JPM: -8, XOM: -1, DAL: -3, WMT: 1, KO: 1.5 } },
  { day: "Thursday", preview: "Apple reports earnings after the close", headline: "Apple beats earnings and chip demand surges", note: "Tech rallies, and banks bounce back as the rumours fade.",
    moves: { AAPL: 6, NVDA: 5, MSFT: 1, JPM: 3, XOM: -1, DAL: 2, WMT: 0, KO: 0 } },
  { day: "Friday", preview: "Monthly jobs report at 7:30 AM", headline: "Jobs report beats expectations", note: "A strong economy lifts almost everything into the weekend.",
    moves: { AAPL: 1.5, NVDA: 2, MSFT: 1, JPM: 2, XOM: 1, DAL: 3, WMT: 0.5, KO: 0.5 } }
];

// prices[0] is the open before Monday; prices[d] is the close after day d's headline
const PRICES = [Object.fromEntries(Object.entries(LEAGUE_STOCKS).map(([s, v]) => [s, v.price]))];
for (const d of WEEK) PRICES.push(Object.fromEntries(Object.entries(PRICES[PRICES.length - 1]).map(([s, p]) => [s, Math.round(p * (1 + d.moves[s] / 100))])));

// Pretend rivals: how they split $10,000 on day 1, then they hold all week
const RIVALS = [
  { name: "Maya", style: "All-in tech", mix: { NVDA: 1 } },
  { name: "Leo", style: "Plays it safe", mix: { WMT: 0.5, KO: 0.5 } },
  { name: "Sam", style: "Oil bull", mix: { XOM: 1 } },
  { name: "Priya", style: "Balanced", mix: Object.fromEntries(Object.keys(LEAGUE_STOCKS).map((s) => [s, 1 / 8])) },
  { name: "Diego", style: "Bank fan", mix: { JPM: 1 } },
  { name: "Grace", style: "Apple loyal", mix: { AAPL: 1 } },
  { name: "Noah", style: "Cash is king", mix: {} },
  { name: "Ava", style: "Travel bug", mix: { DAL: 0.6, AAPL: 0.4 } },
  { name: "Kai", style: "Big tech", mix: { AAPL: 0.34, MSFT: 0.33, NVDA: 0.33 } }
].map((r) => {
  let cash = START_CASH;
  const holdings = {};
  for (const [s, share] of Object.entries(r.mix)) {
    const qty = Math.floor((START_CASH * share) / PRICES[1][s]);
    holdings[s] = qty;
    cash -= qty * PRICES[1][s];
  }
  return { ...r, cash, holdings };
});

function leagueFresh() {
  return { joined: localDay(), day: 1, cash: START_CASH, holdings: {}, trades: [] };
}

function leagueLoad() {
  try {
    const saved = JSON.parse(localStorage.getItem(LEAGUE_KEY));
    if (saved && saved.joined && saved.day >= 1 && saved.day <= WEEK.length) return saved;
  } catch (e) {
    // nothing saved
  }
  return null;
}

function leagueSave(state) {
  try {
    localStorage.setItem(LEAGUE_KEY, JSON.stringify(state));
  } catch (e) {
    // storage blocked: the week restarts on refresh
  }
}

// Days open so far: day 1 on the day you join, one more each real day (all of them in presenter mode)
function leagueUnlocked(state, demo) {
  if (demo) return WEEK.length;
  const days = Math.floor((new Date(localDay()) - new Date(state.joined)) / 86400000);
  return Math.min(WEEK.length, days + 1);
}

const leagueValue = (p, day) => p.cash + Object.entries(p.holdings).reduce((sum, [s, q]) => sum + q * PRICES[day][s], 0);

// Everyone ranked by value on that day, best first
function leagueStandings(state, day) {
  const user = signedInUser();
  const me = { name: user && !user.isGuest ? user.name : "You", style: "That's you", cash: state.cash, holdings: state.holdings, you: true };
  return [me, ...RIVALS].map((p) => ({ ...p, value: leagueValue(p, day) })).sort((a, b) => b.value - a.value).map((p, i) => ({ ...p, rank: i + 1 }));
}

// The day's biggest movers, largest move first: [[symbol, percent], ...]
function leagueMovers(day, count = 3) {
  return Object.entries(WEEK[day - 1].moves).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, count);
}

// Pre-season history so each chart has a shape: 20 trading days that walk to the season's opening price.
// Seeded per stock, so everyone sees the same history.
const PRESEASON_DAYS = 20;
function seeded(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}
const PRESEASON = Object.fromEntries(Object.keys(LEAGUE_STOCKS).map((s) => {
  const rand = seeded(s);
  const prices = [PRICES[0][s]];
  for (let i = 1; i < PRESEASON_DAYS; i++) prices.unshift(Math.round(prices[0] / (1 + (rand() - 0.48) * 0.04)));
  return [s, prices];
}));

// [[label, dollars], ...] for chart.js: the pre-season, then each season day up to `day`
function leagueHistory(symbol, day) {
  const pre = PRESEASON[symbol].map((c, i) => [i === PRESEASON_DAYS - 1 ? "Open" : "−" + (PRESEASON_DAYS - 1 - i) + "d", c / 100]);
  return pre.concat(WEEK.slice(0, day).map((d) => [d.day.slice(0, 3), PRICES[WEEK.indexOf(d) + 1][symbol] / 100]));
}
