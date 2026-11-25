(() => {
  "use strict";

  const merchantRules = [
    ["Income", /\b(payroll|salary|paycheck|direct deposit|pay slip|freelance payment|bonus)\b/i],
    ["Utilities", /\b(electricity|electric bill|utility|utilities|internet|broadband|water bill|gas bill|mobile plan|phone bill|wifi|wi-fi)\b/i],
    ["Housing", /\b(rent|mortgage|property tax|home insurance|homeowners association|hoa fee)\b/i],
    ["Food & Dining", /\b(cafe|café|coffee|restaurant|diner|dining|grocer(?:y|ies)|supermarket|whole foods|trader joe|aldi|tesco|kroger|chipotle|mcdonald|starbucks|doordash|deliveroo|uber eats|swiggy|zomato|pizza|bakery|takeout|lunch|dinner)\b/i],
    ["Transport", /\b(uber|lyft|taxi|bus|metro|subway fare|train|transit|parking|fuel|gas station|shell|chevron|toll|oil change|railway)\b/i],
    ["Entertainment", /\b(netflix|spotify|hulu|disney|cinema|movie|theater|theatre|steam|playstation|concert|prime video|amazon prime|youtube premium|game pass)\b/i],
    ["Health", /\b(doctor|pharmacy|hospital|dental|dentist|health|clinic|medical|gym|fitness|medicine|cvs|walgreens)\b/i],
    ["Shopping", /\b(amazon|target|walmart|etsy|ikea|nike|uniqlo|apparel|clothing|shoes|electronics|shopping)\b/i],
  ];

  const categoryAliases = [
    ["Food & Dining", /\b(food|dining|coffee|restaurants?|grocer(?:y|ies)|takeout)\b/i],
    ["Transport", /\b(transport(?:ation)?|fuel|gas station|transit|commuting)\b/i],
    ["Housing", /\b(housing|rent|mortgage)\b/i],
    ["Utilities", /\b(utilit(?:y|ies)|electricity|internet|water bill|phone bill)\b/i],
    ["Entertainment", /\b(entertainment|streaming|movies?|gaming)\b/i],
    ["Shopping", /\b(shopping|clothes|clothing)\b/i],
    ["Health", /\b(health(?:care)?|medical|pharmacy|fitness)\b/i],
  ];

  function categorize(description) {
    return merchantRules.find(([, pattern]) => pattern.test(String(description ?? "")))?.[0] ?? "Other";
  }

  function toAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
  }

  function getMonth(value) {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "")) return value;
    const now = new Date();
    return String(now.getFullYear()) + "-" + String(now.getMonth() + 1).padStart(2, "0");
  }

  function previousMonth(month) {
    const date = new Date(month + "-01T12:00:00Z");
    date.setUTCMonth(date.getUTCMonth() - 1);
    return date.toISOString().slice(0, 7);
  }

  const comparison = /\b(compar(?:e|ed|ing|ison)|trend|versus|vs|change[ds]?)\b/;

  function monthForQuestion(query, month) {
    return /\b(?:last|previous) month\b/.test(query) && !comparison.test(query) ? previousMonth(month) : month;
  }

  function monthLabel(month) {
    return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(month + "-01T12:00:00Z"));
  }

  function localDate(context) {
    const date = String(context.today ?? "");
    if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) &&
        Number(date.slice(8)) <= daysInMonth(date.slice(0, 7))) return date;
    const now = new Date();
    return String(now.getFullYear()) + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" +
      String(now.getDate()).padStart(2, "0");
  }

  function daysInMonth(month) {
    const date = new Date(month + "-01T12:00:00Z");
    date.setUTCMonth(date.getUTCMonth() + 1, 0);
    return date.getUTCDate();
  }

  function moneyFormatter(currency) {
    try {
      return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format;
    } catch {
      return new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format;
    }
  }

  function summarize(transactions, month, through = month + "-31") {
    const expenses = [];
    const categories = new Map();
    let spending = 0;
    let income = 0;
    for (const transaction of transactions) {
      const date = String(transaction?.date ?? "");
      if (date.slice(0, 7) !== month || date > through) continue;
      const amount = toAmount(transaction.amount);
      if (amount > 0) income += amount;
      if (amount >= 0) continue;
      expenses.push(transaction);
      const category = transaction.category || "Other";
      categories.set(category, (categories.get(category) ?? 0) - amount);
      spending -= amount;
    }
    return {
      categories,
      expenses: expenses.sort((a, b) => toAmount(a.amount) - toAmount(b.amount)),
      ranked: [...categories].sort((a, b) => b[1] - a[1]),
      income,
      spending,
    };
  }

  function budgetAnswer(budgets, data, label, currency, category) {
    const limits = budgets
      .filter(budget => budget?.category && toAmount(budget.limit) > 0)
      .filter(budget => !category || budget.category.toLowerCase() === category.toLowerCase())
      .map(budget => ({
        category: budget.category,
        limit: toAmount(budget.limit),
        spent: data.categories.get(budget.category) ?? 0,
      }));

    if (!limits.length) {
      return {
        title: category ? category + " budget" : "Budget check",
        text: category ? "There’s no budget set for " + category + ". You can add one in Budgets."
          : "Add a budget in Budgets to see how your spending compares with your limits.",
      };
    }

    const over = limits.filter(budget => budget.spent - budget.limit >= 0.005).length;
    const bullets = limits.sort((a, b) => b.spent / b.limit - a.spent / a.limit).map(budget => {
      const difference = budget.limit - budget.spent;
      const status = Math.abs(difference) < 0.005 ? "at the limit"
        : difference < 0 ? currency(-difference) + " over" : currency(difference) + " left";
      return budget.category + " · " + currency(budget.spent) + " of " + currency(budget.limit) + " used, " + status;
    });
    return {
      title: category ? category + " budget" : "Budget check",
      text: over ? over + " of " + limits.length + " tracked budgets exceeded their limits in " + label + "."
        : "Your tracked budgets are within their limits for " + label + ".",
      bullets,
    };
  }

  function goalAnswer(goals, currency) {
    const active = goals.filter(goal => goal?.name && toAmount(goal.target) > 0);
    if (!active.length) {
      return { title: "Savings goals", text: "Create a goal to track how close you are to a planned purchase or savings target." };
    }
    const saved = active.reduce((total, goal) => total + toAmount(goal.saved), 0);
    const remaining = active.reduce((total, goal) => total + Math.max(0, toAmount(goal.target) - toAmount(goal.saved)), 0);
    return {
      title: "Savings goals",
      text: remaining > 0 ? "You’ve saved " + currency(saved) + " across your goals and have " + currency(remaining) + " left to reach them."
        : "You’ve reached all your tracked goals, with " + currency(saved) + " set aside.",
      bullets: active.map(goal => {
        const progress = Math.max(0, toAmount(goal.saved) / toAmount(goal.target));
        return goal.name + " · " + currency(toAmount(goal.saved)) + " of " + currency(toAmount(goal.target)) + " saved (" + Math.floor(progress * 100) + "%)";
      }),
    };
  }

  function recurringAnswer(recurring, currency) {
    const items = recurring
      .filter(item => item?.name && toAmount(item.amount) !== 0)
      .sort((a, b) => (a.nextDate || "9999").localeCompare(b.nextDate || "9999"));
    if (!items.length) {
      return { title: "Recurring payments", text: "You have no tracked recurring payments. Add a subscription or bill to see it here." };
    }
    const amount = items.reduce((total, item) => total + Math.abs(toAmount(item.amount)), 0);
    const dateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
    return {
      title: "Recurring payments",
      text: items.length === 1 ? "Your tracked payment costs " + currency(amount) + "."
        : "One payment per tracked item comes to " + currency(amount) + " across " + items.length + " items.",
      bullets: items.slice(0, 6).map(item => {
        const date = new Date(item.nextDate + "T12:00:00Z");
        return item.name + " · " + currency(Math.abs(toAmount(item.amount))) +
          (Number.isFinite(date.getTime()) ? " · listed for " + dateFormatter.format(date) : "");
      }),
    };
  }

  function adviceAnswer(data, label, currency) {
    if (!data.spending) return { title: "Ways to save", text: "Once you log expenses, I can show which categories may offer room to save." };
    const flexibleCategories = new Set(["Food & Dining", "Shopping", "Entertainment"]);
    const opportunities = data.ranked.filter(([category]) => flexibleCategories.has(category)).slice(0, 3);
    if (!opportunities.length) {
      return {
        title: "Ways to save",
        text: "Your biggest recorded category in " + label + " was " + data.ranked[0][0] + " at " + currency(data.ranked[0][1]) + ". Review those transactions to see which costs you can adjust.",
      };
    }
    const [category, spent] = opportunities[0];
    return {
      title: "Ways to save",
      text: "You spent " + currency(spent) + " on " + category + " in " + label + ". A 10% reduction from that amount would free up " + currency(spent / 10) + " for another priority.",
      bullets: opportunities.map(([name, total]) => name + " · " + currency(total) + " spent"),
    };
  }

  function expenseTotal(entries) {
    return entries.reduce((cents, entry) => cents - Math.round(toAmount(entry.amount) * 100), 0) / 100;
  }

  function forecastAnswer(expenses, recurring, month, today, currency, category) {
    const currentMonth = today.slice(0, 7);
    const label = monthLabel(month);
    const title = category ? category + " forecast" : "Month-end spending forecast";
    const selected = expenses.filter(entry => !category || entry.category === category);
    if (month < currentMonth) {
      return { title, text: label + " has ended. Your recorded expenses for that month came to " + currency(expenseTotal(selected)) + "." };
    }
    if (month > currentMonth) {
      return { title, text: "The forecast uses spending recorded during the selected month. It will be available after spending is logged in " + label + "." };
    }

    const day = Number(today.slice(8));
    const daysRemaining = daysInMonth(month) - day;
    const expenseKey = (name, amount, bucket) => JSON.stringify([
      String(name || "").trim().toLowerCase().replace(/\s+/g, " "),
      Math.round(Math.abs(toAmount(amount)) * 100),
      bucket,
    ]);
    const bills = recurring.filter(bill => bill?.name && toAmount(bill.amount) > 0 && (!category || bill.category === category));
    const recordedCounts = new Map();
    for (const entry of selected) {
      const key = expenseKey(entry.description, entry.amount, entry.category);
      recordedCounts.set(key, (recordedCounts.get(key) ?? 0) + 1);
    }
    const billKeys = new Set(bills.map(bill => expenseKey(bill.name, bill.amount, bill.category)));
    const pendingBills = bills.filter(bill => {
      if (String(bill.nextDate ?? "").slice(0, 7) !== month) return false;
      const key = expenseKey(bill.name, bill.amount, bill.category);
      const count = recordedCounts.get(key) ?? 0;
      if (count === 0) return true;
      recordedCounts.set(key, count - 1);
      return false;
    });
    const unpaid = pendingBills.reduce((sum, bill) => sum + Math.round(toAmount(bill.amount) * 100), 0) / 100;

    const recorded = selected.filter(entry => entry.date <= today);
    const future = selected.filter(entry => entry.date > today);
    const variable = entry => !billKeys.has(expenseKey(entry.description, entry.amount, entry.category));
    const actual = expenseTotal(recorded);
    const futureTotal = expenseTotal(future);
    const tracked = unpaid + futureTotal;
    const bullets = ["Recorded so far · " + currency(actual)];
    if (tracked > 0) bullets.push("Future-dated entries and unmatched bills due this month · " + currency(tracked));
    if (day < 7 || recorded.length < 3) {
      return {
        title,
        text: "A pace estimate for " + label + " needs at least seven calendar days and three recorded expenses.",
        bullets,
      };
    }

    const spendingPace = expenseTotal(recorded.filter(variable)) / day;
    const variableForecast = spendingPace * daysRemaining;
    const adjustment = Math.max(0, variableForecast - expenseTotal(future.filter(variable)));
    const projected = actual + tracked + adjustment;
    if (adjustment > 0) bullets.push("Additional spending estimated at the current pace · " + currency(adjustment));
    bullets.push("The pace uses expenses through today and excludes matched recurring bills. Spending can vary.");
    return {
      title,
      text: "At the current pace, recorded and scheduled spending for " + label + " could total about " + currency(projected) + ".",
      bullets,
    };
  }

  function categoryChangeAnswer(query, transactions, month, today, currency, category) {
    const unusual = /\b(unusual|outliers?|anomal(?:y|ies|ous)|spikes?|surpris(?:e|es|ing))\b/.test(query);
    const direction = /\b(decreas(?:e|ed|es)|fell|drop(?:ped|s)?|down|lower)\b/.test(query) ? -1
      : /\b(increas(?:e|ed|es)|rose|ris(?:e|es|ing)|up|higher)\b/.test(query) ? 1 : 0;
    const title = unusual ? "Unusual spending" : "Spending category changes";
    const currentMonth = today.slice(0, 7);
    const priorMonth = previousMonth(month);
    if (month > currentMonth) return { title, text: "Category changes will be available once " + monthLabel(month) + " starts." };

    const monthToDate = month === currentMonth;
    const priorDay = Math.min(Number(today.slice(8)), daysInMonth(priorMonth));
    const priorThrough = priorMonth + "-" + String(priorDay).padStart(2, "0");
    const current = summarize(transactions, month, monthToDate ? today : undefined);
    const prior = summarize(transactions, priorMonth, monthToDate ? priorThrough : undefined);
    if (!current.expenses.length || !prior.expenses.length) {
      return { title, text: "A comparison needs recorded expenses in " + monthLabel(month) + " and the comparable period in " + monthLabel(priorMonth) + "." };
    }

    const categories = new Set([...current.categories.keys(), ...prior.categories.keys()]);
    const changes = [...categories]
      .filter(name => !category || name === category)
      .map(name => {
        const before = prior.categories.get(name) ?? 0;
        const after = current.categories.get(name) ?? 0;
        return { name, before, after, difference: Math.round((after - before) * 100) / 100 };
      })
      .filter(row => row.difference && (!direction || Math.sign(row.difference) === direction))
      .filter(row => !unusual ||
        (Math.abs(row.difference) >= prior.spending * 0.03 && Math.abs(row.difference) >= row.before * 0.25))
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
    const scope = monthToDate ? "Comparable month-to-date periods in " : "Full recorded months in ";
    const periods = scope + monthLabel(month) + " and " + monthLabel(priorMonth) + ".";
    const method = "Flagged changes are at least 25% of the previous category total and 3% of all previous-period spending.";
    if (!changes.length) {
      return {
        title,
        text: unusual ? "No recorded category changes met the unusual-spending threshold." : "No recorded category changes matched your question.",
        bullets: unusual ? [periods, method] : [periods],
      };
    }
    const top = changes[0];
    const bullets = changes.slice(0, 4).map(({ name, before, after, difference }) => {
      const movement = (difference > 0 ? "+" : "−") + currency(Math.abs(difference));
      return name + " · " + movement + " (" + currency(before) + " to " + currency(after) + ")";
    });
    bullets.push(periods);
    if (unusual) bullets.push(method);
    return {
      title,
      text: top.name + " had the largest " + (unusual ? "flagged " : "") + "change. Recorded spending went " +
        (top.difference > 0 ? "up " : "down ") + currency(Math.abs(top.difference)) + ".",
      bullets,
    };
  }

  const monthlyPhrase = /(?:\b(?:per month|each month|every month|a month|monthly)\b|\/\s*month\b)/.source;
  const savingAmount = /(?<![\w.,+\-−$€£₹¥])(?:(usd|inr|eur|gbp|cad|aud|sgd|aed|jpy|(?:us|ca|au|sg|c|a|s)\$|[$€£₹¥])\s*)?([+\-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?:\s*(usd|inr|eur|gbp|cad|aud|sgd|aed|jpy)\b)?(?![\w.,])/.source;
  const monthlyAmount = new RegExp(savingAmount + /\s*/.source + monthlyPhrase);
  const monthlyFirst = new RegExp(monthlyPhrase + /(?:\s+(?:savings|contribution|of|to|is|at|by))*\s*/.source + savingAmount);
  const goalAmount = new RegExp(/\b(?:to reach|target(?: of)?|goal of|save(?: up)?|reach)\s*/.source + savingAmount);
  const currencyCodes = { "us$": "USD", "ca$": "CAD", "c$": "CAD", "au$": "AUD", "a$": "AUD", "sg$": "SGD", "s$": "SGD", "₹": "INR", "€": "EUR", "£": "GBP", "¥": "JPY" };

  function amountValue(match, code) {
    if (!match) return { value: 0 };
    const markers = [match[1], match[3]].filter(Boolean);
    const dollarCode = /^(USD|CAD|AUD|SGD)$/.test(code) ? code : "USD";
    const currencies = markers.map(marker => marker === "$" ? dollarCode : currencyCodes[marker] || marker.toUpperCase());
    const cents = Math.round(Number(match[2].replaceAll(",", "")) * 100);
    return { value: Number.isSafeInteger(cents) ? cents / 100 : 0, mismatch: currencies.some(inputCode => inputCode !== code) };
  }

  function savingsScenario(query, goals, data, label, currency, code, match) {
    const title = "Savings what-if";
    const { value, mismatch } = amountValue(match, code);
    if (mismatch) return { title, text: "Enter a monthly amount in " + code + " to match your ledger currency." };
    if (value <= 0) {
      return { title, text: "Enter a positive monthly contribution. For example, “What if I save " + currency(100) + " each month?”" };
    }

    const duration = query.match(/\b(?:for|over|after|in)\s+(\d+(?:\.\d+)?)\s+(months?|years?)\b/);
    const months = duration ? Number(duration[1]) * (duration[2].startsWith("year") ? 12 : 1) : 12;
    if (!Number.isSafeInteger(months) || months < 1 || months > 1200 || !Number.isSafeInteger(Math.round(value * 100) * months)) {
      return { title, text: "Use a timeframe of 1 to 1,200 months and a contribution you want to model." };
    }
    const net = data.income - data.spending;
    const amount = currency(value);
    const scenarioTotal = currency(Math.round(value * 100) * months / 100);
    const bullets = ["This scenario assumes the same contribution each month and excludes interest and fees."];
    if (data.income) {
      bullets.push(label + " net cash flow from recorded transactions was " + currency(net) + ". Cash flow can vary month to month.");
    }
    const namedGoal = goals.find(goal => goal?.name && toAmount(goal.target) > 0 && query.includes(goal.name.toLowerCase()));
    const withoutContribution = query.slice(0, match.index) + " " + query.slice(match.index + match[0].length);
    const explicitTarget = amountValue(goalAmount.exec(withoutContribution), code);
    if (explicitTarget.mismatch) return { title, text: "Enter both amounts in " + code + " to match your ledger currency." };
    const target = namedGoal ? toAmount(namedGoal.target) : explicitTarget.value;
    if (target > 0) {
      const saved = namedGoal ? toAmount(namedGoal.saved) : 0;
      const remaining = Math.max(0, Math.round((target - saved) * 100));
      const needed = Math.ceil(remaining / Math.round(value * 100));
      const name = namedGoal ? " for " + namedGoal.name : "";
      const text = needed > 0 ? "Saving " + amount + " each month would reach " + currency(target) + name + " in " +
        needed + (needed === 1 ? " month" : " months") + "."
        : "Your recorded savings have reached the " + currency(target) + " goal" + name + ".";
      bullets.unshift(currency(saved) + " saved now · " + currency(remaining / 100) + " left");
      if (duration && needed > 0) bullets.unshift("Added after " + months + (months === 1 ? " month · " : " months · ") + scenarioTotal);
      return { title, text, bullets };
    }

    return {
      title,
      text: "Saving " + amount + " each month would add " + scenarioTotal + " over " + months + (months === 1 ? " month." : " months."),
      bullets,
    };
  }

  function answer(question, context = {}) {
    const query = String(question ?? "").toLowerCase().trim().replace(/([−-])\s+(?=[$€£₹¥]|\d)/g, "$1");
    const month = getMonth(context.month);
    const previous = previousMonth(month);
    const requestedMonth = monthForQuestion(query, month);
    const transactions = Array.isArray(context.transactions) ? context.transactions : [];
    const recurring = Array.isArray(context.recurring) ? context.recurring : [];
    const budgets = Array.isArray(context.budgets) ? context.budgets : [];
    const goals = Array.isArray(context.goals) ? context.goals : [];
    const label = monthLabel(requestedMonth);
    const code = String(context.currency || "USD").toUpperCase();
    const currency = moneyFormatter(code);
    const data = summarize(transactions, requestedMonth);
    const category = categoryAliases.find(([, pattern]) => pattern.test(query))?.[0];
    const today = localDate(context);

    if ((/\bforecast\b/.test(query) && !/\b(income|earnings?|savings)\b/.test(query)) ||
        (/\b(month[- ]end|end of (?:the |this )?month|project(?:ed|ion|ing)?)\b/.test(query) && /\b(spend(?:ing)?|expenses?)\b/.test(query))) {
      return forecastAnswer(data.expenses, recurring, requestedMonth, today, currency, category);
    }
    if (/\b(unusual|outliers?|anomal(?:y|ies|ous)|spikes?|surpris(?:e|es|ing))\b/.test(query) ||
        (/\b(categor(?:y|ies))\b/.test(query) && /\b(chang(?:e|ed|es)|mov(?:e|ed|es)|rose|fell|increas(?:e|ed|es)|decreas(?:e|ed|es)|up|down|higher|lower)\b/.test(query))) {
      return categoryChangeAnswer(query, transactions, requestedMonth, today, currency, category);
    }
    if (/\b(sav(?:e|ed|ing|ings)|contribut(?:e|ed|ion)|target|reach|goals?|put aside|set aside)\b/.test(query)) {
      const contribution = monthlyAmount.exec(query) || monthlyFirst.exec(query);
      if (contribution || /\b(?:savings what[- ]if|what if i sav(?:e|ed))\b/.test(query)) {
        const recorded = summarize(transactions, requestedMonth, today.startsWith(requestedMonth) ? today : undefined);
        return savingsScenario(query, goals, recorded, label, currency, code, contribution);
      }
    }

    const mentionsRecurring = /\b(subscriptions?|recurr(?:ing|ence)|renewals?|upcoming (?:bills|payments)|payments (?:are )?coming up|bills? (?:are )?due)\b/.test(query);
    if ((mentionsRecurring || /\bbills?\b/.test(query)) && !/\b(spend|spent|budget)\b/.test(query)) {
      return recurringAnswer(recurring, currency);
    }
    if (/\b(budgets?|overspend(?:ing)?|over budget|under budget|left to spend)\b/.test(query)) {
      return budgetAnswer(budgets, data, label, currency, category);
    }
    if (mentionsRecurring) {
      const recurringNames = recurring.map(item => String(item?.name ?? "").toLowerCase().trim()).filter(Boolean);
      const matchingExpenses = data.expenses.filter(transaction => {
        const description = String(transaction.description ?? "").toLowerCase();
        return recurringNames.some(name => description.includes(name));
      });
      const total = matchingExpenses.reduce((sum, expense) => sum - toAmount(expense.amount), 0);
      return {
        title: "Recorded recurring expenses",
        text: matchingExpenses.length
          ? "Expenses matching your tracked recurring payments totaled " + currency(total) + " in " + label + "."
          : "No expenses in " + label + " matched the names of your tracked recurring payments.",
        bullets: matchingExpenses.slice(0, 5).map(expense =>
          expense.description + " · " + currency(-toAmount(expense.amount))),
      };
    }
    if (/\b(goal|goals|emergency fund|saved so far|saving for)\b/.test(query)) return goalAnswer(goals, currency);
    if (/\b(save money|save more|save on|can i save|could i save|ways to save|cut back|cut costs|afford|reduce|tips|advice)\b/.test(query)) {
      return adviceAnswer(data, label, currency);
    }
    if (/\b(savings|saved)\b/.test(query) && !/\b(rate|income|cash flow)\b/.test(query)) return goalAnswer(goals, currency);
    if (comparison.test(query)) {
      const priorData = summarize(transactions, previous);
      let label = "spending";
      let current = category ? data.categories.get(category) ?? 0 : data.spending;
      let prior = category ? priorData.categories.get(category) ?? 0 : priorData.spending;
      if (/\b(cash flow|net)\b/.test(query)) {
        label = "cash flow";
        current = data.income - data.spending;
        prior = priorData.income - priorData.spending;
      } else if (/\b(income|earnings?)\b/.test(query)) {
        label = "income";
        current = data.income;
        prior = priorData.income;
      }
      const change = current - prior;
      const result = Math.abs(change) < 0.005 ? " stayed the same" : change > 0 ? " rose by " + currency(change) : " fell by " + currency(-change);
      return {
        title: category && label === "spending" ? category + " spending trend" : "Monthly " + label + " trend",
        text: "Recorded " + label + result + " from " + monthLabel(previous) + " to " + monthLabel(month) + ".",
        bullets: [monthLabel(month) + " · " + currency(current), monthLabel(previous) + " · " + currency(prior)],
      };
    }
    if (/\b(cash flow|net|income|earnings?|earned|balance|left over|savings rate|financial health|monthly summary|month in review|how did i do)\b/.test(query)) {
      const net = data.income - data.spending;
      const rate = data.income > 0 ? Math.round(net / data.income * 100) : null;
      const savingsRate = rate === null ? "Savings rate needs recorded income." : "Savings rate · " + rate + "% of recorded income";
      const bullets = ["Income · " + currency(data.income), "Expenses · " + currency(data.spending), savingsRate];
      if (/\bbalance\b/.test(query) && context.balance != null && Number.isFinite(Number(context.balance))) {
        return { title: "Account balance", text: "Your tracked balance is " + currency(toAmount(context.balance)) + ".", bullets };
      }
      if (/\b(income|earnings?|earned)\b/.test(query) && !/\b(cash flow|net|spending|expenses?|savings rate)\b/.test(query)) {
        return { title: "Income", text: "You recorded " + currency(data.income) + " in income in " + label + "." };
      }
      if (/\bsavings rate\b/.test(query)) {
        const text = rate === null ? "A savings rate requires recorded income."
          : "Your recorded savings rate was " + rate + "% in " + label + ".";
        return { title: "Savings rate", text, bullets: bullets.slice(0, 2) };
      }
      return { title: "Cash flow", text: label + " net cash flow was " + currency(net) + ".", bullets };
    }
    if (category) {
      const expenses = data.expenses.filter(transaction => transaction.category === category);
      return {
        title: category + " spending",
        text: "You recorded " + currency(data.categories.get(category) ?? 0) + " across " + expenses.length + " " +
          (expenses.length === 1 ? "expense" : "expenses") + " in " + label + ".",
        bullets: expenses.slice(0, 4).map(transaction => (transaction.description || category) + " · " + currency(-toAmount(transaction.amount))),
      };
    }
    if (/\b(spend(?:ing)?|spent|expenses?|transactions?|money go|costs?|breakdown|categor(?:y|ies))\b/.test(query)) {
      if (!data.expenses.length) return { title: "Spending breakdown", text: "There are no recorded expenses for " + label + "." };
      const [topCategory, topAmount] = data.ranked[0];
      const largest = data.expenses[0];
      if (/\b(biggest|highest|largest)\b/.test(query) && /\b(transactions?|single|purchase)\b/.test(query)) {
        return {
          title: "Largest expense",
          text: (largest.description || largest.category || "Your largest expense") + " was the largest recorded expense in " + label +
            " at " + currency(-toAmount(largest.amount)) + ".",
        };
      }
      return {
        title: "Spending breakdown",
        text: "You recorded " + currency(data.spending) + " in expenses in " + label + ". " + topCategory + " was the largest category at " +
          currency(topAmount) + ".",
        bullets: data.ranked.slice(0, 5).map(([name, amount]) => name + " · " + currency(amount)),
      };
    }
    if (/\b(subscription|subscriptions|bill|bills)\b/.test(query)) return recurringAnswer(recurring, currency);

    return {
      title: "How can I help?",
      text: "Ask about spending forecasts, unusual changes, savings scenarios, budgets, or bills.",
      bullets: ["What’s my month-end spending forecast?", "Any unusual spending this month?", "What if I save " + currency(100) + " each month?"],
    };
  }

  async function canExplain() {
    try {
      return await window.LanguageModel?.availability?.() === "available";
    } catch {
      return false;
    }
  }

  async function explain(question, context = {}) {
    if (!await canExplain()) return null;

    const result = answer(question, context);
    const month = monthForQuestion(String(question ?? "").toLowerCase(), getMonth(context.month));
    const transactions = Array.isArray(context.transactions) ? context.transactions : [];
    const { income, spending, ranked } = summarize(transactions, month);
    const knownCategories = new Set(["Income", "Other", ...categoryAliases.map(([category]) => category)]);
    const topCategory = knownCategories.has(ranked[0]?.[0]) ? ranked[0][0] : "";
    const facts = [
      "Topic: " + result.title,
      "The month discussed has " + (income ? "recorded income" : "no recorded income") + ".",
      "The month discussed has " + (spending ? "recorded expenses" : "no recorded expenses") + ".",
      income ? "Recorded spending is " + (spending > income ? "higher than" : "at or below") + " recorded income." : "",
      topCategory ? "The biggest expense category is " + topCategory + "." : "",
    ].filter(Boolean).join("\n");
    if (result.title === "How can I help?") return null;

    let session;
    try {
      session = await window.LanguageModel.create({
        initialPrompts: [{
          role: "system",
          content: "Suggest one optional, practical next step based only on the finance topic and observations provided. " +
            "Use one short sentence in plain English. State no new facts. Use no amounts, numbers, formatting, or investment recommendations.",
        }],
      });
      const response = (await session.prompt(facts)).trim();
      return response && response.length <= 320 && !/[\p{N}\p{Sc}]/u.test(response) ? response : null;
    } catch {
      return null;
    } finally {
      session?.destroy?.();
    }
  }

  window.LedgerAssistant = Object.freeze({ answer, categorize, canExplain, explain });
})();
