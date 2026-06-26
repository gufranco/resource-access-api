import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | undefined;

function tracingEnabled(): boolean {
  const value = process.env.OTEL_ENABLED;
  return value === 'true' || value === '1';
}

/**
 * Starts OpenTelemetry tracing when OTEL_ENABLED is set. Must run before the
 * application imports instrumented libraries (HTTP, pg, ioredis), so main.ts
 * imports and calls this first. The exporter reads OTEL_EXPORTER_OTLP_ENDPOINT
 * and appends the standard /v1/traces path, sending spans to an OTLP collector,
 * Grafana Tempo, or any OTLP-compatible backend.
 */
export function startTracing(): void {
  if (!tracingEnabled()) {
    return;
  }
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'resource-access-api',
    }),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
}

export async function stopTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = undefined;
  }
}
