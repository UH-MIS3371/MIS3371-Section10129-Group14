// Downloads daily prices for each scenario once and writes frontend/data/scenarios.js.
// Run: node scripts/fetch-scenarios.mjs   (no API key needed)
import { writeFileSync, mkdirSync } from "node:fs";

const SCENARIOS = [
  {
    id: "crisis-2008", name: "2008 Financial Crisis", start: "2008-09-02", end: "2008-12-31", benchmark: "SPY",
    blurb: "Lehman Brothers collapses and banks need a government rescue.",
    stocks: {
      BAC: "Bank of America", C: "Citigroup", GS: "Goldman Sachs", MS: "Morgan Stanley", AIG: "AIG", FNMA: "Fannie Mae",
      F: "Ford", AAPL: "Apple", XOM: "Exxon Mobil", WMT: "Walmart", SKF: "UltraShort Financials ETF", SPY: "S&P 500 ETF"
    },
    news: [
      ["2008-09-08", "Fannie Mae and Freddie Mac are placed under government control."],
      ["2008-09-15", "Lehman Brothers files for bankruptcy. Bank of America agrees to buy Merrill Lynch."],
      ["2008-09-16", "The Federal Reserve announces an $85 billion rescue loan for AIG."],
      ["2008-09-26", "Regulators seize Washington Mutual and sell its banking business to JPMorgan Chase."],
      ["2008-09-29", "The House rejects the $700 billion bailout bill. The Dow falls 778 points."],
      ["2008-10-03", "Congress passes the bailout (TARP) and President Bush signs it."],
      ["2008-10-13", "The Dow jumps 936 points, its biggest point gain ever at the time."],
      ["2008-11-24", "The government announces a rescue package for Citigroup."],
      ["2008-12-16", "The Federal Reserve cuts interest rates to nearly zero."]
    ]
  },
  {
    id: "dotcom-2000", name: "Dot-com Bust", start: "2000-03-01", end: "2000-12-29", benchmark: "QQQ",
    blurb: "Internet stocks hit record highs, then the bubble bursts.",
    stocks: {
      MSFT: "Microsoft", CSCO: "Cisco", INTC: "Intel", AMZN: "Amazon", ORCL: "Oracle", QCOM: "Qualcomm",
      EBAY: "eBay", NVDA: "NVIDIA", AAPL: "Apple", QQQ: "Nasdaq-100 ETF"
    },
    news: [
      ["2000-03-10", "The Nasdaq closes at a record high above 5,000."],
      ["2000-04-03", "A judge rules that Microsoft broke antitrust law. The Nasdaq drops sharply."],
      ["2000-04-14", "The Nasdaq falls almost 10% in a single day."],
      ["2000-06-07", "A judge orders Microsoft to be split into two companies."],
      ["2000-11-08", "The presidential election ends without a clear winner."],
      ["2000-12-13", "The Supreme Court's Bush v. Gore decision settles the election."]
    ]
  },
  {
    id: "covid-2020", name: "COVID Crash", start: "2020-02-03", end: "2020-06-30", benchmark: "SPY",
    blurb: "A pandemic shuts down travel, then stimulus sparks a fast rebound.",
    stocks: {
      AAL: "American Airlines", CCL: "Carnival", NCLH: "Norwegian Cruise Line", ZM: "Zoom", PTON: "Peloton", NFLX: "Netflix",
      AMZN: "Amazon", MRNA: "Moderna", TSLA: "Tesla", XOM: "Exxon Mobil", SPY: "S&P 500 ETF"
    },
    news: [
      ["2020-02-24", "The Dow falls more than 1,000 points as the virus spreads outside China."],
      ["2020-03-03", "The Federal Reserve makes an emergency half-point rate cut."],
      ["2020-03-09", "An oil price war begins. A circuit breaker halts trading for 15 minutes."],
      ["2020-03-11", "The World Health Organization declares a pandemic."],
      ["2020-03-16", "The Fed cuts rates to nearly zero. The Dow has its worst day since 1987."],
      ["2020-03-23", "The Fed announces unlimited bond buying."],
      ["2020-03-27", "The $2 trillion CARES Act stimulus is signed into law."],
      ["2020-04-20", "US oil futures fall below zero for the first time."],
      ["2020-05-18", "Moderna reports encouraging early results from its vaccine trial."],
      ["2020-06-05", "The jobs report surprises with 2.5 million jobs added in May."]
    ]
  },
  {
    id: "meme-2021", name: "Meme Stock Squeeze", start: "2021-01-04", end: "2021-02-26", benchmark: "SPY",
    blurb: "Online traders pile into GameStop and squeeze short sellers.",
    stocks: {
      GME: "GameStop", AMC: "AMC Entertainment", BB: "BlackBerry", KOSS: "Koss", NOK: "Nokia", PLTR: "Palantir",
      TSLA: "Tesla", SPY: "S&P 500 ETF"
    },
    news: [
      ["2021-01-11", "GameStop adds Chewy co-founder Ryan Cohen to its board."],
      ["2021-01-25", "GameStop and AMC become the most talked-about stocks on Reddit."],
      ["2021-01-27", "The frenzy spreads: AMC, Koss and BlackBerry soar alongside GameStop."],
      ["2021-01-28", "Robinhood and other brokers stop customers from buying GameStop and AMC."],
      ["2021-02-02", "GameStop shares collapse as the squeeze unwinds."],
      ["2021-02-18", "Congress holds a hearing with the CEOs of Robinhood, Citadel and Reddit."]
    ]
  },
  {
    id: "rates-2022", name: "2022 Rate Hikes", start: "2022-01-03", end: "2022-10-31", benchmark: "SPY",
    blurb: "Inflation climbs and the Fed raises rates faster than in decades.",
    stocks: {
      META: "Meta Platforms", NFLX: "Netflix", TSLA: "Tesla", COIN: "Coinbase", HOOD: "Robinhood", ARKK: "ARK Innovation ETF",
      PTON: "Peloton", XOM: "Exxon Mobil", AAPL: "Apple", SPY: "S&P 500 ETF"
    },
    news: [
      ["2022-02-03", "Meta falls 26% after reporting its first drop in daily users."],
      ["2022-02-24", "Russia invades Ukraine. Oil prices surge."],
      ["2022-03-16", "The Fed raises interest rates for the first time since 2018."],
      ["2022-04-20", "Netflix falls 35% after losing subscribers."],
      ["2022-05-04", "The Fed raises rates by half a point, the most since 2000."],
      ["2022-05-12", "Crypto prices crash after the TerraUSD stablecoin collapses."],
      ["2022-06-13", "The S&P 500 enters a bear market."],
      ["2022-06-15", "The Fed raises rates by 0.75 points, the most since 1994."],
      ["2022-09-13", "Inflation comes in higher than expected. The S&P 500 drops 4.3%."]
    ]
  }
];

const day = (seconds) => new Date(seconds * 1000).toISOString().slice(0, 10);
const round = (n) => Math.round(n * 100) / 100;

// Yahoo prices and volumes are adjusted for later stock splits, so convert back to what people saw at the time
async function download(symbol, start, end) {
  const from = Date.parse(start) / 1000;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${from}&period2=${Math.floor(Date.now() / 1000)}&interval=1d&events=split`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  const data = (await res.json()).chart.result[0];
  const splits = Object.values((data.events && data.events.splits) || {});
  const q = data.indicators.quote[0];
  const rows = {};
  data.timestamp.forEach((t, i) => {
    const date = day(t);
    if (date > end || q.close[i] == null) return;
    const factor = splits.filter((s) => day(s.date) > date).reduce((f, s) => f * s.numerator / s.denominator, 1);
    rows[date] = [q.open[i], q.high[i], q.low[i], q.close[i]].map((p) => round(p * factor)).concat(Math.round(q.volume[i] / factor));
  });
  return rows;
}

// About one year of history before each scenario, so the chart has context on day one.
// History only goes back as far as every stock was trading (Zoom listed in 2019).
const HISTORY_DAYS = 365;

const out = [];
for (const s of SCENARIOS) {
  const historyStart = new Date(Date.parse(s.start) - HISTORY_DAYS * 864e5).toISOString().slice(0, 10);
  const rows = {};
  for (const symbol of Object.keys(s.stocks)) rows[symbol] = await download(symbol, historyStart, s.end);
  const symbols = Object.keys(s.stocks);
  const dates = Object.keys(rows[s.benchmark]).sort().filter((d) => d >= s.start || symbols.every((sym) => rows[sym][d]));
  const stocks = {};
  for (const [symbol, name] of Object.entries(s.stocks)) {
    if (dates.some((d) => !rows[symbol][d])) throw new Error(`${symbol} is missing days in ${s.id}`);
    stocks[symbol] = { name, bars: dates.map((d) => rows[symbol][d]) };
  }
  const start = dates.findIndex((d) => d >= s.start);
  out.push({ id: s.id, name: s.name, blurb: s.blurb, benchmark: s.benchmark, start, dates, stocks, news: s.news });
  console.log(`${s.id}: ${start} days of history, ${dates.length - start} trading days, ${symbols.length} stocks`);
}

mkdirSync("frontend/data", { recursive: true });
writeFileSync("frontend/data/scenarios.js", "// Generated by scripts/fetch-scenarios.mjs. Daily prices: Yahoo Finance.\nconst SCENARIOS = " + JSON.stringify(out) + ";\n");
