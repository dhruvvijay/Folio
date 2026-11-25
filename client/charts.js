(() => {
  const plotWidth = 600;
  const plotHeight = 170;
  const plotInset = 14;
  const colors = ['#637739', '#a9be56', '#d6dcae', '#c8ad78', '#8a8d72', '#dfe4ce'];
  let chartId = 0;

  function escape(text) {
    return String(text ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
  }

  function positive(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function money(amount, currency, options = {}) {
    const code = typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, ...options }).format(amount);
  }

  function tickStep(max) {
    if (!max) return 250;
    const rough = max / 4;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const normalized = rough / magnitude;
    return ([1, 2, 2.5, 5, 10].find((step) => step >= normalized) ?? 10) * magnitude;
  }

  function path(points) {
    if (points.length === 0) return '';
    return points.reduce((d, point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;
      const previous = points[index - 1];
      const center = (previous.x + point.x) / 2;
      return `${d} C ${center} ${previous.y}, ${center} ${point.y}, ${point.x} ${point.y}`;
    }, '');
  }

  function cashflow(data = [], { currency = 'USD', range } = {}) {
    const records = data.map(({ label, income, expenses }) => ({
      label: String(label ?? ''), income: positive(income), expenses: positive(expenses),
    }));
    const max = Math.max(0, ...records.flatMap(({ income, expenses }) => [income, expenses]));
    const step = tickStep(max);
    const top = step * 4;
    const chartLabel = range ? `Cash flow, ${range}` : 'Cash flow';
    const gradient = `folio-flow-fill-${++chartId}`;
    const xAt = (index) => records.length === 1
      ? plotWidth / 2
      : plotInset + index * (plotWidth - 2 * plotInset) / Math.max(records.length - 1, 1);
    const yAt = (value) => plotHeight - (value / top) * plotHeight;
    const income = records.map((record, index) => ({ x: xAt(index), y: yAt(record.income) }));
    const expenses = records.map((record, index) => ({ x: xAt(index), y: yAt(record.expenses) }));
    const ticks = Array.from({ length: 5 }, (_, index) => ({
      value: (4 - index) * step, percent: index * 25, y: index * plotHeight / 4,
    }));
    const labels = records.map(({ label }, index) => `
      <span style="--folio-x:${xAt(index) / plotWidth * 100}%">${escape(label)}</span>`).join('');
    const tickLabels = ticks.map(({ value, percent }) => {
      const notation = value >= 1_000 ? 'compact' : 'standard';
      const digits = value < 1 && value > 0 ? 2 : notation === 'compact' ? 1 : 0;
      const label = money(value, currency, { notation, maximumFractionDigits: digits, minimumFractionDigits: 0 });
      return `<span style="--folio-y:${percent}%">${escape(label.replace(/([0-9])K$/, '$1k'))}</span>`;
    }).join('');
    const grid = ticks.map(({ y }) => `<line x1="0" y1="${y}" x2="${plotWidth}" y2="${y}"/>`).join('');
    const incomeLine = path(income);
    const first = income[0];
    const last = income.at(-1);
    const area = records.length > 1
      ? `${incomeLine} L ${last.x} ${plotHeight} L ${first.x} ${plotHeight} Z`
      : '';
    const dots = max ? [income, expenses].map((series, index) => {
      const point = series.at(-1);
      const className = index === 0 ? 'folio-flow-dot-income' : 'folio-flow-dot-expenses';
      return `<span class="folio-flow-dot ${className}" style="--folio-x:${point.x / plotWidth * 100}%;--folio-y:${point.y / plotHeight * 100}%"></span>`;
    }).join('') : '';
    const hitTargets = max ? records.map((record, index) => {
      const point = xAt(index);
      const start = index === 0 ? 0 : (xAt(index - 1) + point) / 2;
      const end = index === records.length - 1 ? plotWidth : (point + xAt(index + 1)) / 2;
      const align = point < plotWidth / 4 ? ' start' : point > plotWidth * 3 / 4 ? ' end' : '';
      const incomeText = escape(money(record.income, currency));
      const expenseText = escape(money(record.expenses, currency));
      const label = escape(record.label);
      return `<div class="folio-flow-hit${align}" style="--folio-start:${start / plotWidth * 100}%;--folio-width:${(end - start) / plotWidth * 100}%;--folio-anchor:${(point - start) / (end - start) * 100}%">
        <button type="button" aria-label="${label}. Income ${incomeText}. Expenses ${expenseText}."></button>
        <span class="folio-flow-crosshair" aria-hidden="true"></span>
        <div class="folio-flow-tooltip" aria-hidden="true">
          <strong>${label}</strong>
          <span>Income <b>${incomeText}</b></span>
          <span>Expenses <b>${expenseText}</b></span>
        </div>
      </div>`;
    }).join('') : '';

    return `<div class="folio-flow" role="group" aria-label="${escape(chartLabel)}">
      <div class="folio-flow-axis-y" aria-hidden="true">${tickLabels}</div>
      <div class="folio-flow-plot">
        <svg class="folio-flow-svg" viewBox="0 0 ${plotWidth} ${plotHeight}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <defs><linearGradient id="${gradient}" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stop-color="#cde480" stop-opacity=".57"/>
            <stop offset="100%" stop-color="#eef4d8" stop-opacity=".25"/>
          </linearGradient></defs>
          <g class="folio-flow-grid">${grid}</g>
          ${max ? `<path d="${area}" fill="url(#${gradient})"/>
            <path d="${incomeLine}" class="folio-flow-income" vector-effect="non-scaling-stroke"/>
            <path d="${path(expenses)}" class="folio-flow-expenses" vector-effect="non-scaling-stroke"/>` : ''}
        </svg>
        ${max ? `${dots}${hitTargets}` : '<p class="folio-flow-empty">No cash flow for this period.</p>'}
      </div>
      <div class="folio-flow-axis-x${records.length > 8 ? ' dense' : ''}" aria-hidden="true">${labels}</div>
    </div>`;
  }

  function spending(data = [], { currency = 'USD' } = {}) {
    const records = data.map(({ label, amount, color }, index) => ({
      label: String(label ?? ''),
      amount: positive(amount),
      color: typeof color === 'string' && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(color)
        ? color
        : colors[index % colors.length],
    })).filter(({ amount }) => amount > 0);
    const total = records.reduce((sum, { amount }) => sum + amount, 0);
    const circumference = 2 * Math.PI * 51;
    let offset = 0;
    const segments = records.map(({ amount, color }) => {
      const length = amount / total * circumference;
      const gap = records.length > 1 ? Math.min(3.1, length / 2) : 0;
      const segment = `<circle cx="64" cy="64" r="51" fill="none" stroke="${color}" stroke-width="15" stroke-dasharray="${length - gap} ${circumference}" stroke-dashoffset="${-offset}"/>`;
      offset += length;
      return segment;
    }).join('');
    const rows = records.map(({ label, amount, color }) => {
      const share = amount / total * 100;
      const percent = share < 0.5 ? '&lt;1%' : `${Math.round(share)}%`;
      return `<li title="${escape(money(amount, currency))}"><i style="--folio-segment:${color}" aria-hidden="true"></i><span>${escape(label)}</span><strong>${percent}</strong></li>`;
    }).join('');
    const center = total >= 10_000
      ? money(total, currency, { notation: 'compact', maximumFractionDigits: 1 })
      : money(total, currency);

    return `<div class="folio-spending" role="group" aria-label="Spending by category">
      <div class="folio-spending-inner">
        <div class="folio-spending-ring">
          <svg viewBox="0 0 128 128" aria-hidden="true" focusable="false">
            <circle class="folio-spending-track" cx="64" cy="64" r="51" fill="none" stroke-width="15"/>
            <g transform="rotate(-90 64 64)">${segments}</g>
          </svg>
          <div class="folio-spending-center" aria-label="Total spent ${escape(money(total, currency))}"><span>Total spent</span><strong>${escape(center)}</strong></div>
        </div>
        ${records.length > 0 ? `<ul class="folio-spending-legend">${rows}</ul>` : '<p class="folio-spending-empty">No spending for this period.</p>'}
      </div>
    </div>`;
  }

  window.FolioCharts = { cashflow, spending };
})();
