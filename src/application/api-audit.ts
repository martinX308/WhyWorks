import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getStore } from '../adapters/store';
import type { Snapshot } from '../domain/contracts';
// Only allowlisted metadata. Never persist request bodies, provider tokens,
// error text, quotes, frames, audio, facts or reasoning in general telemetry.
export function audited(handler: (request: NextRequest) => Promise<Response>) {
  return async (req: NextRequest) => {
    const started = performance.now();
    const response = await handler(req);
    const durationMs = performance.now() - started;
    try {
      const owner = req.cookies.get('blueprint_owner')?.value;
      const store = getStore();
      if (!owner || !store.get('owners', owner)) return response;
      const result = await response.clone().json();
      const data = result.data || {};
      const v =
        typeof data.versionId === 'string'
          ? store.get<Snapshot>('versions', data.versionId)
          : undefined;
      const sessionId = v?.sessionId || data.session?.id;
      store.put(
        'metrics',
        {
          id: randomUUID(),
          kind: data.outcome ? 'gate_api' : 'api_request',
          requestId: result.requestId,
          at: Date.now(),
          method: req.method,
          routeGroup: req.nextUrl.pathname.split('/')[2],
          status: response.status,
          durationMs,
          errorCode: result.error?.code,
          outcome: data.outcome,
          versionId: v?.id,
          versionHash: v?.contentHash,
          recordRevision: data.recordRevision,
          factsRevision: data.factsRevision,
          epoch: data.session?.epoch,
          ruleIds: data.ruleIds,
        },
        owner,
        sessionId,
      );
    } catch {
      /* Telemetry must never replace a confirmed commit response. */
    }
    return response;
  };
}
