/**
 * Render a candlestick chart with Fibonacci overlays and swing markers
 * on a <canvas> element. No external dependencies.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ candles: Array, fibLevels?: Array, swingPoints?: Object }} data
 */
function renderChart(canvas, data) {
  const { candles, fibLevels, swingPoints } = data;
  if (!candles || candles.length === 0) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;
  canvas.width = displayWidth * dpr;
  canvas.height = displayHeight * dpr;
  ctx.scale(dpr, dpr);

  const pad = { top: 12, right: 65, bottom: 28, left: 10 };
  const W = displayWidth - pad.left - pad.right;
  const H = displayHeight - pad.top - pad.bottom;

  // ---- Price range ----
  let minP = Infinity;
  let maxP = -Infinity;
  for (const c of candles) {
    if (c.low < minP) minP = c.low;
    if (c.high > maxP) maxP = c.high;
  }
  const range = maxP - minP;
  minP -= range * 0.05;
  maxP += range * 0.05;

  const yOf = (price) => pad.top + H - ((price - minP) / (maxP - minP)) * H;
  const xOf = (i) => pad.left + (i + 0.5) * (W / candles.length);

  // ---- Background ----
  ctx.fillStyle = '#0f1923';
  ctx.fillRect(0, 0, displayWidth, displayHeight);

  // ---- Grid ----
  ctx.strokeStyle = '#1e2d3d';
  ctx.lineWidth = 0.5;
  const gridN = 6;
  for (let i = 0; i <= gridN; i++) {
    const y = pad.top + (H / gridN) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + W, y);
    ctx.stroke();

    const price = maxP - ((maxP - minP) / gridN) * i;
    ctx.fillStyle = '#6b7b8d';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(price.toFixed(2), pad.left + W + 4, y + 3);
  }

  // ---- Fibonacci levels ----
  if (fibLevels && fibLevels.length > 0) {
    const colors = [
      '#ef5350', '#ffa726', '#ffee58', '#66bb6a',
      '#42a5f5', '#ab47bc', '#ef5350',
    ];
    for (let i = 0; i < fibLevels.length; i++) {
      const lvl = fibLevels[i];
      const y = yOf(lvl.price);
      if (y < pad.top - 5 || y > pad.top + H + 5) continue;

      ctx.strokeStyle = colors[i % colors.length];
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + W, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = colors[i % colors.length];
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${lvl.label} ${lvl.price}`, pad.left + W + 2, y - 3);
    }
  }

  // ---- Candlesticks ----
  const cw = Math.max(1, (W / candles.length) * 0.6);

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const x = xOf(i);
    const bull = c.close >= c.open;
    const color = bull ? '#26a69a' : '#ef5350';

    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yOf(c.high));
    ctx.lineTo(x, yOf(c.low));
    ctx.stroke();

    // Body
    const bTop = yOf(Math.max(c.open, c.close));
    const bBot = yOf(Math.min(c.open, c.close));
    ctx.fillStyle = color;
    ctx.fillRect(x - cw / 2, bTop, cw, Math.max(1, bBot - bTop));
  }

  // ---- Swing markers ----
  if (swingPoints) {
    drawSwingMarker(ctx, candles, swingPoints.high, 'high', xOf, yOf);
    drawSwingMarker(ctx, candles, swingPoints.low, 'low', xOf, yOf);
  }

  // ---- Time labels ----
  ctx.fillStyle = '#6b7b8d';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  const labelCount = Math.min(6, candles.length);
  const step = Math.max(1, Math.floor(candles.length / labelCount));
  for (let i = 0; i < candles.length; i += step) {
    const d = new Date(candles[i].timestamp);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    ctx.fillText(`${hh}:${mm}`, xOf(i), displayHeight - 6);
  }
}

/**
 * Draw a small triangle + label above a swing high or below a swing low.
 */
function drawSwingMarker(ctx, candles, point, type, xOf, yOf) {
  if (!point) return;
  const idx = candles.findIndex(c => c.timestamp === point.timestamp);
  if (idx < 0) return;

  const x = xOf(idx);
  const y = yOf(point.price);
  const sz = 5;

  if (type === 'high') {
    ctx.fillStyle = '#ff5252';
    ctx.beginPath();
    ctx.moveTo(x, y - sz - 2);
    ctx.lineTo(x - sz, y - sz * 2 - 2);
    ctx.lineTo(x + sz, y - sz * 2 - 2);
    ctx.closePath();
    ctx.fill();
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SH', x, y - sz * 2 - 5);
  } else {
    ctx.fillStyle = '#69f0ae';
    ctx.beginPath();
    ctx.moveTo(x, y + sz + 2);
    ctx.lineTo(x - sz, y + sz * 2 + 2);
    ctx.lineTo(x + sz, y + sz * 2 + 2);
    ctx.closePath();
    ctx.fill();
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SL', x, y + sz * 2 + 13);
  }
}
