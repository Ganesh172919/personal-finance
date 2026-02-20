type CounterKey =
  | "http_requests_total"
  | "tool_simulate_total"
  | "tool_execute_total"
  | "connector_sync_total"
  | "errors_total";

const counters: Record<CounterKey, number> = {
  http_requests_total: 0,
  tool_simulate_total: 0,
  tool_execute_total: 0,
  connector_sync_total: 0,
  errors_total: 0,
};

export const inc = (key: CounterKey, by = 1) => {
  counters[key] = (counters[key] ?? 0) + Math.max(0, Math.floor(by));
};

export const renderPrometheus = () => {
  const lines: string[] = [];
  lines.push("# HELP finwise_plugin_runtime_http_requests_total Total HTTP requests.");
  lines.push("# TYPE finwise_plugin_runtime_http_requests_total counter");
  lines.push(`finwise_plugin_runtime_http_requests_total ${counters.http_requests_total}`);

  lines.push("# HELP finwise_plugin_runtime_tool_simulate_total Total plugin tool simulations.");
  lines.push("# TYPE finwise_plugin_runtime_tool_simulate_total counter");
  lines.push(`finwise_plugin_runtime_tool_simulate_total ${counters.tool_simulate_total}`);

  lines.push("# HELP finwise_plugin_runtime_tool_execute_total Total plugin tool executions.");
  lines.push("# TYPE finwise_plugin_runtime_tool_execute_total counter");
  lines.push(`finwise_plugin_runtime_tool_execute_total ${counters.tool_execute_total}`);

  lines.push("# HELP finwise_plugin_runtime_connector_sync_total Total connector sync calls.");
  lines.push("# TYPE finwise_plugin_runtime_connector_sync_total counter");
  lines.push(`finwise_plugin_runtime_connector_sync_total ${counters.connector_sync_total}`);

  lines.push("# HELP finwise_plugin_runtime_errors_total Total errors.");
  lines.push("# TYPE finwise_plugin_runtime_errors_total counter");
  lines.push(`finwise_plugin_runtime_errors_total ${counters.errors_total}`);

  return lines.join("\n") + "\n";
};

