(() => {
  'use strict';

  const FORMAT = 'folio-ledger';
  const VERSION = 1;
  const MAX_BYTES = 1024 * 1024;
  const MAX_TRANSACTIONS = 5000;
  const MAX_GOALS = 500;
  const MAX_RECURRING = 500;
  const EXPENSE_CATEGORIES = new Set([
    'Food & Dining', 'Shopping', 'Transport', 'Housing',
    'Utilities', 'Entertainment', 'Health', 'Other',
  ]);
  const CURRENCIES = new Set(['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'AED', 'JPY']);
  const encoder = new TextEncoder();

  function record(value, label, fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${label} must be an object.`);
    }
    if (Object.keys(value).some(key => !fields.includes(key))) {
      throw new Error(`${label} contains an unsupported field.`);
    }
    return value;
  }

  function string(value, label, maximum) {
    if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
      throw new Error(`${label} must contain 1 to ${maximum} characters.`);
    }
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
      throw new Error(`${label} contains an unsupported control character.`);
    }
    return value;
  }

  function identifier(value, label) {
    if (typeof value !== 'string' || !/^[a-z0-9_-]{1,128}$/iu.test(value)) {
      throw new Error(`${label} must be a valid record ID.`);
    }
    return value;
  }

  function amount(value, label, constraint) {
    const cents = typeof value === 'number' ? Math.round(value * 100) : NaN;
    if (!Number.isSafeInteger(cents) || cents / 100 !== value) {
      throw new Error(`${label} must be a number with up to two decimal places.`);
    }
    if (constraint === 'nonzero' && cents === 0) throw new Error(`${label} must be nonzero.`);
    if (constraint === 'positive' && cents <= 0) throw new Error(`${label} must be greater than zero.`);
    if (constraint === 'nonnegative' && cents < 0) throw new Error(`${label} must be zero or greater.`);
    return cents === 0 ? 0 : cents / 100;
  }

  function isoDate(value, label) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
      const date = new Date(`${value}T00:00:00Z`);
      if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value) return value;
    }
    throw new Error(`${label} must be a valid date in YYYY-MM-DD format.`);
  }

  function expenseCategory(value, label) {
    if (!EXPENSE_CATEGORIES.has(value)) throw new Error(`${label} must be a Folio expense category.`);
    return value;
  }

  function list(value, label, maximum, normalize, identity) {
    if (!Array.isArray(value)) throw new Error(`${label} must be a list.`);
    if (value.length > maximum) throw new Error(`${label} can contain up to ${maximum.toLocaleString('en-US')} records.`);
    const seen = new Set();
    return Array.from(value, (entry, index) => {
      const item = normalize(entry, index + 1);
      const key = item[identity];
      if (seen.has(key)) throw new Error(`${label} has a duplicate ${identity === 'id' ? 'record ID' : identity}.`);
      seen.add(key);
      return item;
    });
  }

  function transaction(value, index) {
    const label = `Transaction ${index}`;
    const row = record(value, label, ['id', 'date', 'description', 'category', 'amount']);
    const money = amount(row.amount, `${label} amount`, 'nonzero');
    let category = row.category;
    if (money < 0) category = expenseCategory(category, `${label} category`);
    else if (category !== 'Income') throw new Error(`${label} needs the Income category for a positive amount.`);
    return {
      id: identifier(row.id, `${label} ID`),
      date: isoDate(row.date, `${label} date`),
      description: string(row.description, `${label} description`, 4096),
      category,
      amount: money,
    };
  }

  function budget(value, index) {
    const label = `Budget ${index}`;
    const row = record(value, label, ['category', 'limit']);
    return {
      category: expenseCategory(row.category, `${label} category`),
      limit: amount(row.limit, `${label} limit`, 'positive'),
    };
  }

  function goal(value, index) {
    const label = `Savings goal ${index}`;
    const row = record(value, label, ['id', 'name', 'saved', 'target', 'icon']);
    const result = {
      id: identifier(row.id, `${label} ID`),
      name: string(row.name, `${label} name`, 100),
      saved: amount(row.saved, `${label} saved amount`, 'nonnegative'),
      target: amount(row.target, `${label} target`, 'positive'),
    };
    if (Object.hasOwn(row, 'icon')) {
      if (typeof row.icon !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/iu.test(row.icon)) {
        throw new Error(`${label} icon is invalid.`);
      }
      result.icon = row.icon;
    }
    return result;
  }

  function recurringBill(value, index) {
    const label = `Recurring bill ${index}`;
    const row = record(value, label, ['id', 'name', 'amount', 'nextDate', 'category', 'dueDay']);
    const result = {
      id: identifier(row.id, `${label} ID`),
      name: string(row.name, `${label} name`, 100),
      amount: amount(row.amount, `${label} amount`, 'positive'),
      nextDate: isoDate(row.nextDate, `${label} date`),
      category: expenseCategory(row.category, `${label} category`),
    };
    if (Object.hasOwn(row, 'dueDay')) {
      if (!Number.isInteger(row.dueDay) || row.dueDay < 1 || row.dueDay > 31) {
        throw new Error(`${label} scheduled day must be between 1 and 31.`);
      }
      result.dueDay = row.dueDay;
    }
    return result;
  }

  function checkSize(text) {
    if (text.length > MAX_BYTES || encoder.encode(text).length > MAX_BYTES) {
      throw new Error('The ledger backup must be 1 MB or smaller.');
    }
  }

  function prepareBackup(input) {
    const ledger = record(input, 'Ledger', ['transactions', 'budgets', 'goals', 'recurring', 'currency', 'openingBalance', 'demo']);
    if (!CURRENCIES.has(ledger.currency)) throw new Error('Choose a currency supported by Folio.');
    const state = {
      transactions: list(ledger.transactions, 'Transactions', MAX_TRANSACTIONS, transaction, 'id'),
      budgets: list(ledger.budgets, 'Budgets', EXPENSE_CATEGORIES.size, budget, 'category'),
      goals: list(ledger.goals, 'Savings goals', MAX_GOALS, goal, 'id'),
      recurring: list(ledger.recurring, 'Recurring bills', MAX_RECURRING, recurringBill, 'id'),
      currency: ledger.currency,
      openingBalance: amount(ledger.openingBalance, 'Opening balance'),
    };
    if (Object.hasOwn(ledger, 'demo')) {
      if (typeof ledger.demo !== 'boolean') throw new Error('The sample data setting must be true or false.');
      state.demo = ledger.demo;
    }
    const text = JSON.stringify({ format: FORMAT, version: VERSION, state });
    checkSize(text);
    return { state, text };
  }

  function validate(input) {
    return prepareBackup(input).state;
  }

  function encodeBackup(state) {
    return prepareBackup(state).text;
  }

  function decodeBackup(text) {
    if (typeof text !== 'string') throw new Error('Choose a Folio JSON backup.');
    checkSize(text);
    let backup;
    try {
      backup = JSON.parse(text.replace(/^\uFEFF/u, ''));
    } catch {
      throw new Error('This file does not contain valid JSON.');
    }
    record(backup, 'Backup', ['format', 'version', 'state']);
    if (backup.format !== FORMAT || backup.version !== VERSION) {
      throw new Error('This backup format or version is unsupported.');
    }
    return validate(backup.state);
  }

  globalThis.LedgerSchema = Object.freeze({ validate, encodeBackup, decodeBackup, MAX_BYTES, MAX_TRANSACTIONS });
})();
