// backend/lib/metrics.js — métricas em memória com saída Prometheus text e JSON

// ─── Primitivos ───────────────────────────────────────────────────────────────

class Counter {
  #entries = new Map(); // labelKey → { value, labels }

  constructor(name, help, labelNames = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
  }

  _key(labels) {
    return this.labelNames.map(n => String(labels[n] ?? '')).join('\x00');
  }

  inc(labels = {}, n = 1) {
    const k = this._key(labels);
    const entry = this.#entries.get(k);
    if (entry) {
      entry.value += n;
    } else {
      this.#entries.set(k, { value: n, labels: { ...labels } });
    }
  }

  toPrometheus() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const { value, labels } of this.#entries.values()) {
      const ls = _labelsStr(labels);
      lines.push(ls ? `${this.name}{${ls}} ${value}` : `${this.name} ${value}`);
    }
    return lines.join('\n');
  }

  toJSON() {
    return {
      name: this.name,
      type: 'counter',
      values: [...this.#entries.values()].map(({ value, labels }) => ({ labels, value })),
    };
  }
}

class Histogram {
  static DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

  #entries = new Map(); // labelKey → { sum, count, buckets: Map<le, cumCount>, labels }
  #bounds;

  constructor(name, help, labelNames = [], buckets = Histogram.DEFAULT_BUCKETS) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    // Garante Infinity como último bucket (le="+Inf")
    this.#bounds = [...new Set([...buckets])].sort((a, b) => a - b).concat(Infinity);
  }

  _key(labels) {
    return this.labelNames.map(n => String(labels[n] ?? '')).join('\x00');
  }

  #initEntry(labels) {
    return {
      sum: 0,
      count: 0,
      buckets: new Map(this.#bounds.map(b => [b, 0])),
      labels: { ...labels },
    };
  }

  observe(labels = {}, value) {
    const k = this._key(labels);
    let entry = this.#entries.get(k);
    if (!entry) {
      entry = this.#initEntry(labels);
      this.#entries.set(k, entry);
    }
    entry.sum += value;
    entry.count += 1;
    // Buckets são cumulativos: incrementa todos os le >= value
    for (const [le] of entry.buckets) {
      if (value <= le) entry.buckets.set(le, entry.buckets.get(le) + 1);
    }
  }

  toPrometheus() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const { sum, count, buckets, labels } of this.#entries.values()) {
      const ls = _labelsStr(labels);
      const sep = ls ? ',' : '';
      const wrap = ls ? `{${ls}` : '{';
      for (const [le, c] of buckets) {
        const leStr = le === Infinity ? '+Inf' : String(le);
        lines.push(`${this.name}_bucket${wrap}${sep}le="${leStr}"} ${c}`);
      }
      const suffix = ls ? `{${ls}}` : '';
      lines.push(`${this.name}_sum${suffix} ${sum.toFixed(3)}`);
      lines.push(`${this.name}_count${suffix} ${count}`);
    }
    return lines.join('\n');
  }

  toJSON() {
    return {
      name: this.name,
      type: 'histogram',
      values: [...this.#entries.values()].map(({ sum, count, labels }) => ({
        labels,
        sum: parseFloat(sum.toFixed(3)),
        count,
        avg: count ? parseFloat((sum / count).toFixed(3)) : 0,
      })),
    };
  }
}

class Gauge {
  #entries = new Map();

  constructor(name, help, labelNames = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
  }

  _key(labels) {
    return this.labelNames.map(n => String(labels[n] ?? '')).join('\x00');
  }

  set(labels = {}, value) {
    this.#entries.set(this._key(labels), { value, labels: { ...labels } });
  }

  inc(labels = {}, n = 1) {
    const k = this._key(labels);
    const entry = this.#entries.get(k);
    if (entry) entry.value += n;
    else this.set(labels, n);
  }

  dec(labels = {}, n = 1) {
    this.inc(labels, -n);
  }

  toPrometheus() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const { value, labels } of this.#entries.values()) {
      const ls = _labelsStr(labels);
      lines.push(ls ? `${this.name}{${ls}} ${value}` : `${this.name} ${value}`);
    }
    return lines.join('\n');
  }

  toJSON() {
    return {
      name: this.name,
      type: 'gauge',
      values: [...this.#entries.values()].map(({ value, labels }) => ({ labels, value })),
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _labelsStr(labels) {
  return Object.entries(labels)
    .map(([k, v]) => `${k}="${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',');
}

/** Remove UUIDs, IDs numéricos longos e query strings de um path para evitar
 *  explosão de cardinalidade nas métricas. */
export function normalizeRoute(rawPath) {
  return (rawPath ?? '/')
    .split('?')[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d{3,}/g, '/:id')
    || '/';
}

// ─── Registry ─────────────────────────────────────────────────────────────────

class MetricsRegistry {
  #metrics = [];

  register(metric) {
    this.#metrics.push(metric);
    return metric;
  }

  toPrometheus() {
    const mem = process.memoryUsage();
    const processMetrics = [
      '# HELP process_heap_bytes Node.js heap memory in bytes',
      '# TYPE process_heap_bytes gauge',
      `process_heap_bytes{type="used"} ${mem.heapUsed}`,
      `process_heap_bytes{type="total"} ${mem.heapTotal}`,
      `process_heap_bytes{type="rss"} ${mem.rss}`,
      `process_heap_bytes{type="external"} ${mem.external}`,
      '# HELP process_uptime_seconds Process uptime in seconds',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${process.uptime().toFixed(3)}`,
    ].join('\n');

    return [
      ...this.#metrics.map(m => m.toPrometheus()),
      processMetrics,
    ].join('\n\n');
  }

  toJSON() {
    const mem = process.memoryUsage();
    return {
      metrics: this.#metrics.map(m => m.toJSON()),
      process: {
        uptime: parseFloat(process.uptime().toFixed(3)),
        pid: process.pid,
        nodeVersion: process.version,
        memory: {
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          rss: mem.rss,
          external: mem.external,
        },
      },
      collectedAt: new Date().toISOString(),
    };
  }
}

// ─── Instâncias exportadas ────────────────────────────────────────────────────

const registry = new MetricsRegistry();

/** Total de requisições HTTP por método, rota normalizada e status code. */
export const httpRequestsTotal = registry.register(
  new Counter('http_requests_total', 'Total de requisições HTTP', ['method', 'route', 'status'])
);

/** Histograma de duração das requisições HTTP em ms. */
export const httpRequestDurationMs = registry.register(
  new Histogram(
    'http_request_duration_ms',
    'Duração das requisições HTTP em milissegundos',
    ['method', 'route'],
    [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  )
);

/** Tentativas de autenticação por resultado (success | failure | lockout). */
export const authAttemptsTotal = registry.register(
  new Counter('auth_attempts_total', 'Total de tentativas de autenticação', ['outcome'])
);

/** Erros de aplicação por tipo (operational | unexpected | db). */
export const appErrorsTotal = registry.register(
  new Counter('app_errors_total', 'Total de erros da aplicação', ['type'])
);

/** Conexões HTTP ativas no momento. */
export const activeConnections = registry.register(
  new Gauge('active_connections', 'Conexões HTTP ativas')
);

export default registry;
