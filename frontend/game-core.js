"use strict";
// MarketStreet Scenario Mode: the game rules, shared by the Lambda (the official copy) and the browser
// (for previews and animation). Nothing here touches the page or the database.
// Copied to frontend/game-core.js by `npm run sync-core`; a test checks the two copies match.
//
// s = one scenario from the price data; g = one game's state. Money is always whole cents.
// Functions that change a game change the g they are given and return what happened.
(function (root) {
  const START_CASH = 10000000; // $100,000

  // During a day the price moves open → low → high → close (or open → high → low → close on a down day),
  // so it always stays inside that day's real range and ends on the real close.
  function pathOf(bar) {
    const [open, high, low, close] = bar;
    return close >= open ? [open, low, high, close] : [open, high, low, close];
  }

  function priceAt(bar, progress) {
    const path = pathOf(bar);
    const leg = Math.min(Math.floor(progress * 3), 2);
    const t = progress * 3 - leg;
    return Math.round((path[leg] + (path[leg + 1] - path[leg]) * t) * 100);
  }

  function price(s, g, symbol) {
    return priceAt(s.stocks[symbol].bars[g.day], g.progress);
  }

  // Works for the player (g) and the bot (g.bot): both have cash and holdings.
  // A short position is negative shares, so it lowers the value when the price rises.
  function totalValue(s, g, account) {
    const a = account || g;
    let total = a.cash;
    for (const symbol in a.holdings) total += a.holdings[symbol] * price(s, g, symbol);
    return total;
  }

  function shortValue(s, g) {
    let total = 0;
    for (const symbol in g.holdings) total += Math.max(0, -g.holdings[symbol]) * price(s, g, symbol);
    return total;
  }

  function benchStart(s) {
    return Math.round(s.stocks[s.benchmark].bars[s.start][0] * 100);
  }

  function newGame(s) {
    return {
      scenarioId: s.id, day: s.start, progress: 0, status: "active",
      cash: START_CASH, holdings: {}, basis: {}, bot: { cash: START_CASH, holdings: {} }, closes: [], log: []
    };
  }

  function record(g, who, side, qty, symbol, priceCents) {
    g.log.push({ day: g.day, who, side, qty, symbol, price: priceCents });
  }

  // What an order would be, and why it can't be placed (if it can't). Rules: whole shares of 1 or more,
  // enough cash to buy, one direction per stock, and shorts worth at most the account's value.
  function orderPlan(s, g, side, symbol, amountCents) {
    if (g.status !== "active") return { reason: "This scenario is over." };
    if (side !== "Buy" && side !== "Short") return { reason: "Choose Buy or Short." };
    if (!s.stocks[symbol]) return { reason: "Stock not found." };
    const now = price(s, g, symbol);
    const owned = g.holdings[symbol] || 0;
    const qty = Number.isFinite(amountCents) && amountCents > 0 ? Math.floor(amountCents / now) : 0;
    let reason = "";
    if (side === "Buy" && owned < 0) reason = "You are short " + symbol + ". Close the short in Positions before buying.";
    else if (side === "Short" && owned > 0) reason = "You own " + symbol + ". Close it in Positions before shorting.";
    else if (qty < 1) reason = "Enter at least $" + (now / 100).toFixed(2) + " to get one share.";
    else if (side === "Buy" && qty * now > g.cash) reason = "Not enough cash: at most " + Math.floor(g.cash / now) + " shares.";
    else if (side === "Short" && shortValue(s, g) + qty * now > totalValue(s, g)) reason = "Short limit: your shorts can be worth at most your account value.";
    return { side, symbol, now, owned, qty, reason };
  }

  // The most that can go into an order, in cents
  function maxAmount(s, g, side) {
    return Math.max(0, side === "Buy" ? g.cash : totalValue(s, g) - shortValue(s, g));
  }

  // Opens or adds to a position at the current price. basis is what the open shares cost in total.
  function placeOrder(s, g, side, symbol, amountCents) {
    const plan = orderPlan(s, g, side, symbol, amountCents);
    if (plan.reason) return { error: plan.reason };
    const change = side === "Buy" ? plan.qty : -plan.qty;
    g.cash -= change * plan.now;
    g.holdings[symbol] = plan.owned + change;
    g.basis[symbol] = (g.basis[symbol] || 0) + plan.qty * plan.now;
    record(g, "You", side, plan.qty, symbol, plan.now);
    return { trade: g.log[g.log.length - 1] };
  }

  // Closes all (part = 1) or half (part = 0.5) of a position: selling shares owned, or buying back a short
  function closePosition(s, g, symbol, part) {
    if (g.status !== "active") return { error: "This scenario is over." };
    const shares = g.holdings[symbol];
    if (!shares) return { error: "You have no " + symbol + " position." };
    const size = Math.abs(shares);
    const qty = part === 1 ? size : Math.max(1, Math.floor(size / 2));
    const now = price(s, g, symbol);
    const change = shares > 0 ? -qty : qty;
    g.cash -= change * now;
    g.basis[symbol] -= Math.round((g.basis[symbol] * qty) / size);
    g.holdings[symbol] = shares + change;
    record(g, "You", shares > 0 ? "Sell" : "Cover", qty, symbol, now);
    if (!g.holdings[symbol]) {
      delete g.holdings[symbol];
      delete g.basis[symbol];
    }
    return { trade: g.log[g.log.length - 1] };
  }

  // A stock's close on a day and its average close over the 20 days up to then
  function trend(s, symbol, day) {
    const bars = s.stocks[symbol].bars.slice(Math.max(0, day - 19), day + 1);
    return { close: bars[bars.length - 1][3], average: bars.reduce((sum, bar) => sum + bar[3], 0) / bars.length };
  }

  // The bot follows the trend. At each close it sells any stock that closed below its 20-day average,
  // then buys the stocks above their average that it does not own yet. Each stock gets at most an equal
  // share of the bot's value, so when most stocks are falling the bot keeps most of its money in cash.
  function botTrade(s, g) {
    const bot = g.bot;
    const symbols = Object.keys(s.stocks);
    const above = symbols.filter((symbol) => {
      const t = trend(s, symbol, g.day);
      return t.close > t.average;
    });
    for (const symbol of Object.keys(bot.holdings)) {
      if (above.includes(symbol)) continue;
      bot.cash += bot.holdings[symbol] * price(s, g, symbol);
      record(g, "Bot", "Sell", bot.holdings[symbol], symbol, price(s, g, symbol));
      delete bot.holdings[symbol];
    }
    const buys = above.filter((symbol) => !bot.holdings[symbol]);
    const budget = Math.min(totalValue(s, g, bot) / symbols.length, bot.cash / buys.length);
    for (const symbol of buys) {
      const qty = Math.floor(budget / price(s, g, symbol));
      if (!qty) continue;
      bot.holdings[symbol] = qty;
      bot.cash -= qty * price(s, g, symbol);
      record(g, "Bot", "Buy", qty, symbol, price(s, g, symbol));
    }
  }

  // End of a trading day: record the close, let the bot trade, then move to the next morning.
  // On the last day the game ends instead and its result is worked out.
  function closeDay(s, g) {
    g.progress = 1;
    if (g.day === s.dates.length - 1) {
      g.status = "over";
      g.result = result(s, g);
      return;
    }
    g.closes.push({ date: s.dates[g.day], value: totalValue(s, g), bot: totalValue(s, g, g.bot), bench: price(s, g, s.benchmark) });
    botTrade(s, g);
    g.day++;
    g.progress = 0;
  }

  // Stars build on each other: one for making a profit, two for also beating the bot, three for also
  // beating the market. Also the biggest single move in hindsight (buying or shorting one stock on day 1).
  function result(s, g) {
    const mine = totalValue(s, g) / START_CASH - 1;
    const bot = totalValue(s, g, g.bot) / START_CASH - 1;
    const market = price(s, g, s.benchmark) / benchStart(s) - 1;
    const best = Object.keys(s.stocks).map((symbol) => {
      const bars = s.stocks[symbol].bars;
      return { symbol, r: bars[bars.length - 1][3] / bars[s.start][0] - 1 };
    }).sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
    return {
      stars: mine <= 0 ? 0 : mine <= bot ? 1 : mine <= market ? 2 : 3,
      mine, bot, market, finalValue: totalValue(s, g), best,
      trades: g.log.filter((t) => t.who === "You").length, botTrades: g.log.filter((t) => t.who === "Bot").length
    };
  }

  const GameCore = { START_CASH, pathOf, priceAt, price, totalValue, shortValue, benchStart, newGame, orderPlan, maxAmount, placeOrder, closePosition, trend, botTrade, closeDay, result };
  if (typeof module !== "undefined" && module.exports) module.exports = GameCore;
  else root.GameCore = GameCore;
})(this);
