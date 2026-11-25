(() => {
  'use strict';

  const STORAGE_KEY = 'ledger-finance-manager-v1';
  const DEFAULT_MONTH = '2026-11';
  const CATEGORIES = Object.freeze([
    'Income', 'Food & Dining', 'Shopping', 'Transport', 'Housing',
    'Utilities', 'Entertainment', 'Health', 'Other',
  ]);

  const november = [
    [22, 'Whole Foods Market', 'Food & Dining', -86.42],
    [21, 'Freelance Payment', 'Income', 1850],
    [20, 'Spotify Premium', 'Entertainment', -12.99],
    [19, 'Blue Bottle Coffee', 'Food & Dining', -6.50],
    [18, 'Uber', 'Transport', -24.80],
    [17, 'Uniqlo', 'Shopping', -140],
    [17, 'Neighborhood Pharmacy', 'Health', -56.45],
    [16, 'Eastside Kitchen', 'Food & Dining', -64.18],
    [15, 'Netflix', 'Entertainment', -15.49],
    [15, 'Internet Plan', 'Utilities', -83.49],
    [14, 'Trader Joe’s', 'Food & Dining', -134.27],
    [14, 'Museum Tickets', 'Entertainment', -19],
    [13, 'Pet Supplies', 'Other', -50],
    [12, 'Electricity Bill', 'Utilities', -95.60],
    [12, 'Farmers Market', 'Food & Dining', -43.65],
    [11, 'MUJI', 'Shopping', -72],
    [10, 'Neighborhood Bakery', 'Food & Dining', -22.48],
    [9, 'Physical Therapy', 'Health', -125],
    [9, 'Gas Station', 'Transport', -57.40],
    [8, 'Sushi House', 'Food & Dining', -85.20],
    [8, 'Home Repair', 'Other', -214.26],
    [7, 'Cinema Tickets', 'Entertainment', -32],
    [7, 'Mobile Plan', 'Utilities', -67.23],
    [6, 'Target', 'Shopping', -106.40],
    [5, 'Salary Deposit', 'Income', 4570],
    [5, 'Corner Deli', 'Food & Dining', -39.65],
    [4, 'Transit Pass', 'Transport', -74],
    [3, 'MUBI', 'Entertainment', -14.99],
    [3, 'Community Donation', 'Other', -40],
    [2, 'Post Office', 'Other', -26.30],
    [1, 'Apartment Rent', 'Housing', -1475],
  ];

  const previousMonths = [
    {
      month: '2026-10', salary: 4570, freelance: 1350,
      expenses: [1475, 545.80, 608.30, 189.65, 267.50, 138.50, 60, 350],
    },
    {
      month: '2026-09', salary: 4570, freelance: 590,
      expenses: [1475, 504.40, 371.99, 161.20, 224.30, 133.40, 245.30, 164.41],
    },
    {
      month: '2026-08', salary: 4570, freelance: 930,
      expenses: [1475, 489.12, 445.32, 140.25, 210.20, 90.18, 104.50, 260.43],
    },
    {
      month: '2026-07', salary: 4570, freelance: 300,
      expenses: [1475, 430.78, 328.48, 175.22, 255.06, 75.36, 92.35, 210.75],
    },
    {
      month: '2026-06', salary: 4570, freelance: 0,
      expenses: [1475, 451.59, 312.11, 149.28, 228.35, 115.45, 125, 333.22],
    },
  ];

  const monthlyExpenses = [
    [1, 'Apartment Rent', 'Housing'],
    [8, 'Groceries & Dining', 'Food & Dining'],
    [16, 'Clothing & Home Goods', 'Shopping'],
    [6, 'Transit & Rides', 'Transport'],
    [12, 'Internet & Utilities', 'Utilities'],
    [18, 'Media & Events', 'Entertainment'],
    [20, 'Healthcare & Pharmacy', 'Health'],
    [25, 'Household Services', 'Other'],
  ];

  const toCents = amount => Math.round(Number(amount) * 100);
  const fromCents = cents => cents / 100;
  const padded = value => String(value).padStart(2, '0');
  const compareDates = (a, b) => b.date.localeCompare(a.date);

  function id() {
    return globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function today() {
    const date = new Date();
    return `${date.getFullYear()}-${padded(date.getMonth() + 1)}-${padded(date.getDate())}`;
  }

  function seed() {
    const transaction = (month, [day, description, category, amount], index) => ({
      id: `sample-${month}-${index + 1}`,
      date: `${month}-${padded(day)}`,
      description,
      category,
      amount,
    });

    const transactions = november.map((row, index) => transaction(DEFAULT_MONTH, row, index));
    for (const { month, salary, freelance, expenses } of previousMonths) {
      const entries = [[5, 'Salary Deposit', 'Income', salary]];
      if (freelance) entries.push([21, 'Freelance Payment', 'Income', freelance]);
      monthlyExpenses.forEach((details, index) => entries.push([...details, -expenses[index]]));
      transactions.push(...entries.map((row, index) => transaction(month, row, index)));
    }
    const transactionCents = transactions.reduce((total, entry) => total + toCents(entry.amount), 0);

    return {
      transactions: transactions.sort(compareDates),
      budgets: [
        { category: 'Food & Dining', limit: 650 },
        { category: 'Shopping', limit: 500 },
        { category: 'Transport', limit: 300 },
      ],
      goals: [
        { id: 'sample-goal-1', name: 'Emergency Fund', saved: 7500, target: 10000, icon: 'shield' },
        { id: 'sample-goal-2', name: 'Japan Trip', saved: 1820, target: 3000, icon: 'plane' },
        { id: 'sample-goal-3', name: 'New Laptop', saved: 640, target: 1600, icon: 'laptop' },
      ],
      recurring: [
        { id: 'sample-recurring-1', name: 'Apartment Rent', amount: 1475, nextDate: '2026-12-01', category: 'Housing' },
        { id: 'sample-recurring-2', name: 'MUBI', amount: 14.99, nextDate: '2026-12-03', category: 'Entertainment' },
        { id: 'sample-recurring-3', name: 'Mobile Plan', amount: 67.23, nextDate: '2026-12-07', category: 'Utilities' },
        { id: 'sample-recurring-4', name: 'Netflix', amount: 15.49, nextDate: '2026-12-15', category: 'Entertainment' },
        { id: 'sample-recurring-5', name: 'Spotify Premium', amount: 12.99, nextDate: '2026-12-20', category: 'Entertainment' },
      ],
      currency: 'USD',
      openingBalance: fromCents(1248050 - transactionCents),
    };
  }

  function read() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.transactions)) {
        return {
          ...saved,
          budgets: Array.isArray(saved.budgets) ? saved.budgets : [],
          goals: Array.isArray(saved.goals) ? saved.goals : [],
          recurring: Array.isArray(saved.recurring) ? saved.recurring : [],
          currency: saved.currency || 'USD',
          openingBalance: Number.isFinite(saved.openingBalance) ? saved.openingBalance : 0,
        };
      }
    } catch {
      // Start with the sample dashboard if local storage is unavailable or unreadable.
    }
    return seed();
  }

  function save(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  function hasSavedState() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      return Boolean(saved && Array.isArray(saved.transactions));
    } catch {
      return false;
    }
  }

  function monthDate(month) {
    const [year, monthNumber] = String(month).split('-').map(Number);
    if (!year || monthNumber < 1 || monthNumber > 12) return new Date(NaN);
    const date = new Date(0);
    date.setUTCFullYear(year, monthNumber - 1, 1);
    return date;
  }

  function shiftMonth(month, offset) {
    const date = monthDate(month);
    if (!Number.isFinite(date.getTime())) return DEFAULT_MONTH;
    date.setUTCMonth(date.getUTCMonth() + offset);
    return `${String(date.getUTCFullYear()).padStart(4, '0')}-${padded(date.getUTCMonth() + 1)}`;
  }

  function monthLabel(month, style = 'long') {
    const date = monthDate(month);
    if (!Number.isFinite(date.getTime())) return String(month || '');
    const options = style === 'short' || style === true ? { month: 'short' } : { month: 'long', year: 'numeric' };
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(date);
  }

  function dateLabel(date) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime())) return String(date || '');
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(parsed);
  }

  function money(amount, currency = 'USD') {
    const number = Number(amount);
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(Number.isFinite(number) ? number : 0);
    } catch {
      return money(amount);
    }
  }

  function monthTotals(transactions, month) {
    const categoryCents = Object.fromEntries(CATEGORIES.filter(category => category !== 'Income').map(category => [category, 0]));
    const entries = transactions.filter(entry => entry.date.slice(0, 7) === month).sort(compareDates);
    let income = 0;
    let expenses = 0;
    for (const entry of entries) {
      const cents = toCents(entry.amount);
      if (cents >= 0) {
        income += cents;
      } else {
        expenses -= cents;
        const category = Object.hasOwn(categoryCents, entry.category) ? entry.category : 'Other';
        categoryCents[category] -= cents;
      }
    }
    return {
      income: fromCents(income),
      expenses: fromCents(expenses),
      net: fromCents(income - expenses),
      categoryTotals: Object.fromEntries(Object.entries(categoryCents).map(([name, cents]) => [name, fromCents(cents)])),
      transactions: entries,
    };
  }

  function summary(state, month = DEFAULT_MONTH) {
    const current = monthTotals(state.transactions, month);
    const previous = monthTotals(state.transactions, shiftMonth(month, -1));
    const balance = state.transactions.reduce((total, entry) => (
      entry.date.slice(0, 7) <= month ? total + toCents(entry.amount) : total
    ), toCents(state.openingBalance || 0));
    return {
      ...current,
      balance: fromCents(balance),
      previousIncome: previous.income,
      previousExpenses: previous.expenses,
      previousNet: previous.net,
      previousBalance: fromCents(balance - toCents(current.net)),
    };
  }

  function series(state, endMonth = DEFAULT_MONTH, count = 6) {
    return Array.from({ length: count }, (_, index) => {
      const month = shiftMonth(endMonth, index - count + 1);
      const { income, expenses, net } = monthTotals(state.transactions, month);
      return { month, label: monthLabel(month, 'short'), income, expenses, net };
    });
  }

  function csvRows(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let closedQuotes = false;

    function endField() {
      row.push(field);
      field = '';
      closedQuotes = false;
    }

    function endRow() {
      endField();
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    }

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (inQuotes) {
        if (character === '"' && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          inQuotes = false;
          closedQuotes = true;
        } else {
          field += character;
        }
      } else if (character === ',') {
        endField();
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && text[index + 1] === '\n') index += 1;
        endRow();
      } else if (character === '"' && !field && !closedQuotes) {
        inQuotes = true;
      } else if (closedQuotes && (character === ' ' || character === '\t')) {
        continue;
      } else if (closedQuotes || character === '"') {
        throw new Error(`Check the quotes in CSV row ${rows.length + 1}.`);
      } else {
        field += character;
      }
    }
    if (inQuotes) throw new Error(`Close the quoted value in CSV row ${rows.length + 1}.`);
    endRow();
    return rows;
  }

  function isDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const value = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === date;
  }

  function csvAmount(value) {
    const cleaned = value.trim().replace(/^[\p{Sc}]|(?<=[+-])[\p{Sc}]/gu, '');
    const normalized = /^\(.*\)$/.test(cleaned) ? `-${cleaned.slice(1, -1).replace(/^\p{Sc}/u, '')}` : cleaned;
    if (!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+|(?=\.\d))(?:\.\d{1,2})?$/.test(normalized)) return NaN;
    const amount = Number(normalized.replaceAll(',', ''));
    return Number.isSafeInteger(toCents(amount)) && amount !== 0 ? fromCents(toCents(amount)) : NaN;
  }

  const formulaPrefix = /^[\s]*[=+\-@]|^[\t\r\n]/;

  function importDescription(value) {
    if (value.startsWith("''") || (value.startsWith("'") && formulaPrefix.test(value.slice(1)))) {
      return value.slice(1).trim();
    }
    return value.trim();
  }

  function parseCSV(text) {
    const [header, ...rows] = csvRows(String(text || '').replace(/^\uFEFF/, ''));
    if (!header || rows.length === 0) throw new Error('The CSV has no transactions.');
    const headings = header.map(value => value.trim().toLowerCase().replaceAll('_', ' '));
    const column = (...names) => headings.findIndex(heading => names.includes(heading));
    const dateColumn = column('date', 'transaction date');
    const descriptionColumn = column('description', 'name', 'merchant', 'transaction');
    const amountColumn = column('amount', 'value');
    const categoryColumn = column('category');
    const typeColumn = column('type', 'transaction type');

    if ([dateColumn, descriptionColumn, amountColumn].includes(-1)) {
      throw new Error('Include Date, Description, and Amount columns in the CSV.');
    }

    return rows.map((row, index) => {
      const rowNumber = index + 2;
      const date = row[dateColumn]?.trim() || '';
      const description = importDescription(row[descriptionColumn] || '');
      let amount = csvAmount(row[amountColumn] || '');
      const categoryValue = row[categoryColumn]?.trim() || '';
      const type = row[typeColumn]?.trim().toLowerCase() || '';
      const knownCategory = CATEGORIES.find(category => category.toLowerCase() === categoryValue.toLowerCase());

      if (row.length !== header.length) throw new Error(`CSV row ${rowNumber} has a different number of columns than the header.`);
      if (!isDate(date)) throw new Error(`Use YYYY-MM-DD for the date in CSV row ${rowNumber}.`);
      if (!description) throw new Error(`Add a description to CSV row ${rowNumber}.`);
      if (!Number.isFinite(amount)) throw new Error(`Enter a nonzero amount with up to two decimal places in CSV row ${rowNumber}.`);
      if (['expense', 'debit', 'outflow'].includes(type)) amount = -Math.abs(amount);
      if (['income', 'credit', 'inflow'].includes(type)) amount = Math.abs(amount);

      const category = amount > 0 ? 'Income' : (knownCategory && knownCategory !== 'Income' ? knownCategory : 'Other');
      return { id: id(), date, description, category, amount };
    });
  }

  function csvCell(value) {
    const field = String(value);
    return /[",\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
  }

  function exportCSV(transactions) {
    const rows = transactions.map(({ date, description, category, amount }) => {
      const text = String(description);
      const safeDescription = text.startsWith("'") || formulaPrefix.test(text) ? `'${text}` : text;
      return [date, safeDescription, category, Number(amount).toFixed(2)].map(csvCell).join(',');
    });
    return [['Date', 'Description', 'Category', 'Amount'].join(','), ...rows].join('\r\n');
  }

  window.LedgerData = Object.freeze({
    DEFAULT_MONTH, CATEGORIES, seed, read, save, hasSavedState, id, today, monthLabel, dateLabel,
    shiftMonth, money, summary, series, parseCSV, exportCSV,
  });
})();
