(() => {
  'use strict';

  function escape(value) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
  }

  function percent(value) {
    return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
  }

  function difference(value, previous) {
    return Math.round((value - previous) * 100) / 100;
  }

  function signed(value, format, plus = false) {
    const sign = value < 0 ? '−' : value > 0 && plus ? '+' : '';
    return `${sign}${format(Math.abs(value))}`;
  }

  function cardHead(title, description) {
    return `<div class="card-head"><div><h2>${escape(title)}</h2><p>${escape(description)}</p></div></div>`;
  }

  function summaryCard(current, previous, yearly, labels, format) {
    const rate = current.income > 0 ? percent((current.net / current.income) * 100) : 'No income';
    const previousNet = difference(current.net, previous.net);
    const yearChange = difference(current.expenses, yearly.expenses);
    const canCompareYear = current.transactions.length > 0 && yearly.transactions.length > 0;
    return `<section class="card card-body folio-report-summary">
      <h2 class="folio-report-net-label">Net cash flow</h2>
      <p class="folio-report-net${current.net < 0 ? ' folio-report-adverse' : ''}">${escape(signed(current.net, format))}</p>
      <dl class="folio-report-summary-lines">
        <div><dt>Income</dt><dd>${escape(format(current.income))}</dd></div>
        <div><dt>Expenses</dt><dd>${escape(format(current.expenses))}</dd></div>
        <div><dt>Savings rate</dt><dd>${escape(rate)}</dd></div>
        ${previous.transactions.length > 0 ? `<div><dt>Net change vs ${escape(labels.previous)}</dt><dd${previousNet < 0 ? ' class="folio-report-adverse"' : ''}>${escape(signed(previousNet, format, true))}</dd></div>` : ''}
        ${canCompareYear ? `<div><dt>Expense change vs ${escape(labels.yearly)}</dt><dd${yearChange > 0 ? ' class="folio-report-adverse"' : ''}>${escape(signed(yearChange, format, true))}</dd></div>` : ''}
      </dl>
    </section>`;
  }

  function categoryCard(current, previous, previousLabel, format) {
    const categoryNames = new Set([...Object.keys(current.categoryTotals), ...Object.keys(previous.categoryTotals)]);
    const categories = Array.from(categoryNames, name => ({
      name,
      current: current.categoryTotals[name] || 0,
      previous: previous.categoryTotals[name] || 0,
    })).filter(row => row.current > 0 || row.previous > 0)
      .sort((a, b) => b.current - a.current || b.previous - a.previous || a.name.localeCompare(b.name));
    const hasPrevious = previous.transactions.length > 0;
    const description = hasPrevious ? `Spending share and change vs ${previousLabel}` : 'Share of total spending';
    const rows = categories.map(row => {
      const share = current.expenses > 0 ? row.current / current.expenses * 100 : 0;
      const shareText = share > 0 && share < .1 ? '<0.1%' : percent(share);
      const change = difference(row.current, row.previous);
      const changeStyle = change > 0 ? ' folio-report-adverse' : change < 0 ? ' folio-report-favorable' : '';
      return `<tr>
        <th scope="row"><span>${escape(row.name)}</span><span class="folio-report-share-bar" aria-hidden="true"><i style="--folio-report-share:${Math.min(share, 100).toFixed(4)}%"></i></span></th>
        <td>${escape(format(row.current))}</td>
        <td>${escape(shareText)}</td>
        ${hasPrevious ? `<td class="${changeStyle.trim()}" title="${escape(`${previousLabel}: ${format(row.previous)}`)}">${escape(signed(change, format, true))}</td>` : ''}
      </tr>`;
    }).join('');

    return `<section class="card card-body folio-report-categories">
      ${cardHead('Spending by category', description)}
      ${categories.length ? `<table class="folio-report-category-table" aria-label="Spending by category">
        <thead><tr><th scope="col">Category</th><th scope="col">Spent</th><th scope="col">Share</th>${hasPrevious ? '<th scope="col">Change</th>' : ''}</tr></thead>
        <tbody>${rows}</tbody>
      </table>` : '<p class="empty">No categorized expenses for this period.</p>'}
    </section>`;
  }

  function expenseCard(transactions, format, dateLabel) {
    const expenses = transactions.filter(row => row.amount < 0)
      .sort((a, b) => a.amount - b.amount || b.date.localeCompare(a.date)).slice(0, 5);
    const items = expenses.map(row => `<li>
      <div class="folio-report-expense-detail">
        <strong>${escape(row.description)}</strong>
        <span>${escape(row.category)} · <time datetime="${escape(row.date)}">${escape(dateLabel(row.date).split(',')[0])}</time></span>
      </div>
      <strong class="folio-report-expense-amount">${escape(format(-row.amount))}</strong>
    </li>`).join('');

    return `<section class="card card-body folio-report-expenses">
      ${cardHead('Top expenses', 'Largest expense transactions this month')}
      ${items ? `<ol class="folio-report-expense-list" role="list">${items}</ol>` : '<p class="empty">No expense transactions for this month.</p>'}
    </section>`;
  }

  function render(state, month) {
    const data = window.LedgerData;
    const charts = window.FolioCharts;
    const previousMonth = data.shiftMonth(month, -1);
    const yearEarlier = data.shiftMonth(month, -12);
    const current = data.summary(state, month);
    const previous = data.summary(state, previousMonth);
    const yearly = data.summary(state, yearEarlier);
    const series = data.series(state, month, 6);
    const format = value => data.money(value, state.currency);
    const labels = { previous: data.monthLabel(previousMonth), yearly: data.monthLabel(yearEarlier) };
    const timeline = `${data.monthLabel(series[0].month)} to ${data.monthLabel(month)}`;

    return `<div class="folio-reports">
      <div class="folio-report-main">
        ${summaryCard(current, previous, yearly, labels, format)}
        <section class="card card-body folio-report-trend">
          ${cardHead('Six-month cash flow', timeline)}
          <div class="chart-key"><span><i aria-hidden="true"></i>Income</span><span><i aria-hidden="true"></i>Expenses</span></div>
          ${charts.cashflow(series, { currency: state.currency, range: timeline })}
        </section>
      </div>
      <div class="folio-report-details">
        ${categoryCard(current, previous, labels.previous, format)}
        ${expenseCard(current.transactions, format, data.dateLabel)}
      </div>
    </div>`;
  }

  window.LedgerReports = { render };
})();
