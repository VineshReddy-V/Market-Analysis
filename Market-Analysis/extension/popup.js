const API_URL = 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', () => {
  const queryInput = document.getElementById('query-input');
  const analyzeBtn = document.getElementById('analyze-btn');
  const traceSection = document.getElementById('trace-section');
  const traceContainer = document.getElementById('trace-container');
  const chartSection = document.getElementById('chart-section');
  const chartCanvas = document.getElementById('chart-canvas');
  const summarySection = document.getElementById('summary-section');
  const summaryContainer = document.getElementById('summary-container');
  const errorContainer = document.getElementById('error-container');
  const loading = document.getElementById('loading');

  // Example prompt chips
  document.querySelectorAll('.example').forEach(el => {
    el.addEventListener('click', () => {
      queryInput.value = el.dataset.query;
    });
  });

  analyzeBtn.addEventListener('click', () => runAnalysis());
  queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runAnalysis();
    }
  });

  async function runAnalysis() {
    const query = queryInput.value.trim();
    if (!query) return;

    resetUI();
    loading.classList.remove('hidden');
    analyzeBtn.disabled = true;

    try {
      const response = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Server error: ${response.status}`);
      }

      const result = await response.json();

      // Render trace progressively
      if (result.trace && result.trace.length > 0) {
        await renderTrace(result.trace);
      }

      // Render chart
      if (result.chartData) {
        chartSection.classList.remove('hidden');
        renderChart(chartCanvas, result.chartData);
      }

      // Render summary
      if (result.summary) {
        summarySection.classList.remove('hidden');
        summaryContainer.textContent = result.summary;
      }
    } catch (err) {
      errorContainer.classList.remove('hidden');
      errorContainer.textContent = `Error: ${err.message}`;
    } finally {
      loading.classList.add('hidden');
      analyzeBtn.disabled = false;
    }
  }

  function resetUI() {
    traceContainer.innerHTML = '';
    summaryContainer.textContent = '';
    traceSection.classList.add('hidden');
    chartSection.classList.add('hidden');
    summarySection.classList.add('hidden');
    errorContainer.classList.add('hidden');
    errorContainer.textContent = '';
  }

  async function renderTrace(trace) {
    traceSection.classList.remove('hidden');
    for (const item of trace) {
      const card = createTraceCard(item);
      traceContainer.appendChild(card);
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      await delay(150);
    }
  }

  function createTraceCard(item) {
    const card = document.createElement('div');
    card.className = `trace-card trace-${item.type}`;

    // Header row: step number + type badge
    const header = document.createElement('div');
    header.className = 'trace-header';

    const stepLabel = document.createElement('span');
    stepLabel.className = 'trace-step';
    stepLabel.textContent = `Step ${item.step}`;

    const typeLabel = document.createElement('span');
    typeLabel.className = `trace-type type-${item.type}`;
    typeLabel.textContent = formatType(item.type);

    header.appendChild(stepLabel);
    header.appendChild(typeLabel);
    card.appendChild(header);

    // Body: summary text
    const body = document.createElement('div');
    body.className = 'trace-body';
    body.textContent = item.summary;
    card.appendChild(body);

    // Tool name tag
    if (item.toolName) {
      const toolTag = document.createElement('div');
      toolTag.className = 'trace-tool';
      toolTag.textContent = `Tool: ${item.toolName}`;
      card.appendChild(toolTag);
    }

    // Collapsible input details
    if (item.toolInput) {
      const details = document.createElement('details');
      details.className = 'trace-details';
      const summary = document.createElement('summary');
      summary.textContent = 'Input';
      details.appendChild(summary);
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(item.toolInput, null, 2);
      details.appendChild(pre);
      card.appendChild(details);
    }

    return card;
  }

  function formatType(type) {
    const map = {
      user_query: 'Query',
      llm_decision: 'Decision',
      tool_result: 'Result',
      final_answer: 'Answer',
      error: 'Error',
    };
    return map[type] || type;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});
