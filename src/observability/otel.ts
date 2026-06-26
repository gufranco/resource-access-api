// Side-effect module: starts OpenTelemetry before any instrumented library is
// imported. It must be the first import in main.ts. This is the one sanctioned
// module-level side effect, required by OpenTelemetry's instrumentation model.
import { startTracing } from './tracing';

startTracing();
