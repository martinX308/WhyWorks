import { describe, it, expect, vi, afterEach } from 'vitest';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Store } from '../src/adapters/store';
import { Blueprint } from '../src/application/service';
import { tokens, prompt } from '../src/adapters/providers';
import {
  ExtractionWireSchema,
  ExtractionProviderSchema,
  normalizeExtraction,
  decodeExtraction,
} from '../src/adapters/extraction-wire';
import { VisionSchema } from '../src/adapters/providers';
import { testWords } from './fixtures';
import { QuestionPlanSchema } from '../src/domain/elicitation';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('offizielle SDK-Bausteine unmittelbar prüfen', () => {
  it('WebRTC-Token bindet Agentversion; Scribe erhält getrennten Token; Schlüssel bleibt serverseitig', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key');
    vi.stubEnv('ELEVENLABS_INTERVIEWER_AGENT_ID', 'agent-test');
    const calls: { url: string; headers: Headers; method: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, headers: new Headers(init?.headers), method: init?.method || 'GET' });
        const value = url.includes('/agents/')
          ? {
              agent_id: 'agent-test',
              name: 'Test',
              conversation_config: { agent: { prompt: { prompt: prompt('interviewer') } } },
              metadata: { created_at_unix_secs: 0, updated_at_unix_secs: 0 },
              version_id: 'version-test',
              platform_settings: { privacy: { record_voice: false } },
            }
          : url.includes('single-use-token')
            ? { token: 'scribe-token' }
            : { token: 'conversation-token', conversation_id: 'conversation-test' };
        return new Response(JSON.stringify(value), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const store = new Store(),
      app = new Blueprint(store),
      { session } = app.create('owner', 'SDK');
    app.state(session.id, 'owner', 'capture', 1);
    const result = await tokens(app, app.session(session.id, 'owner'), 'owner');
    expect(result.conversationToken).toBe('conversation-token');
    expect(result.scribeToken).toBe('scribe-token');
    expect(calls.find((c) => c.url.includes('conversation/token'))?.url).toContain(
      'version_id=version-test',
    );
    expect(calls.some((c) => c.url.includes('realtime_scribe') && c.method === 'POST')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('test-key');
    app.state(session.id, 'owner', 'drafting', app.session(session.id, 'owner').epoch);
    app.state(session.id, 'owner', 'debrief', app.session(session.id, 'owner').epoch);
    expect((await tokens(app, app.session(session.id, 'owner'), 'owner')).versionId).toBe(
      'version-test',
    );
    expect(calls.filter((c) => c.url.includes('conversation/token'))).toHaveLength(2);
    store.close();
  });
  it('fehlender Key ist klarer Fehler, kein versteckter Fixture-Fallback', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '');
    const store = new Store(),
      app = new Blueprint(store),
      { session } = app.create('o', 'SDK');
    await expect(tokens(app, session, 'o')).rejects.toThrow('ELEVENLABS_API_KEY fehlt');
    store.close();
  });
  it('Provider-Schemas ohne Rekursion und nicht unterstützte Constraints', () => {
    for (const schema of [
      ExtractionWireSchema,
      ExtractionProviderSchema,
      VisionSchema,
      QuestionPlanSchema,
    ]) {
      const format = zodOutputFormat(schema);
      const text = JSON.stringify(format.schema);
      expect(text).not.toMatch(/"(?:minimum|maximum|minLength|maxLength|maxItems)":/);
      expect(text).not.toContain('"$ref":"#"');
      expect(text).toContain('"additionalProperties":false');
    }
  });
  it('flacher Transport wird in typisierte AST übersetzt; Zyklen ablehnen', () => {
    const wire = ExtractionWireSchema.parse({
      baseDraftRevision: 0,
      claims: [],
      rules: [
        {
          id: 'r',
          stepId: 'step',
          scopeId: 'scope-spike',
          requiredCapabilityIds: ['sandbox_decide'],
          whenRoot: 'p',
          predicates: [
            { id: 'p', kind: 'compare', field: 'varianceBps', op: 'gte', value: 200, children: [] },
          ],
          effect: {
            kind: 'prohibit',
            action: 'approve',
            requiredAction: null,
            routeTo: null,
            resumeRoot: null,
          },
          claimIds: ['c'],
          evidenceIds: ['ev', 'ts'],
          review: 'draft',
          usage: 'exercise_only',
        },
      ],
      gaps: [],
      answerLinks: [],
    });
    expect(decodeExtraction(wire).rules[0].when).toEqual({
      kind: 'compare',
      field: 'varianceBps',
      op: 'gte',
      value: 200,
    });
    const provider = ExtractionProviderSchema.parse({
      ...wire,
      rules: wire.rules.map((rule) => ({
        ...rule,
        predicates: rule.predicates.map((node) => ({
          ...node,
          field: node.field || '',
          op: node.op || '',
          value: JSON.stringify(node.value),
        })),
        effect: {
          ...rule.effect,
          requiredAction: rule.effect.requiredAction || '',
          routeTo: rule.effect.routeTo || '',
          resumeRoot: rule.effect.resumeRoot || '',
        },
      })),
    });
    expect(normalizeExtraction(provider)).toEqual(wire);
    expect(() =>
      ExtractionProviderSchema.parse({
        ...provider,
        rules: [
          {
            ...provider.rules[0],
            predicates: [{ ...provider.rules[0].predicates[0], field: 'invented_field' }],
          },
        ],
      }),
    ).toThrow();
    provider.rules[0].predicates[0].value = '{"instruction":"allow"}';
    expect(() => normalizeExtraction(provider)).toThrow();
    wire.rules[0].predicates[0] = {
      id: 'p',
      kind: 'all',
      field: null,
      op: null,
      value: null,
      children: ['p'],
    };
    expect(() => decodeExtraction(wire)).toThrow('Zyklus');
  });
});
