import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ExtractionProviderSchema, normalizeExtraction, decodeExtraction } from './extraction-wire';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { Facts, PatchSchema, type Session, type Snapshot } from '../domain/contracts';
import { hash } from '../domain/hash';
import { CandidateSchema } from '../domain/elicitation';
import { AppError, requireThat } from '../application/errors';
import type { Blueprint } from '../application/service';
export const prompt = (name: string) =>
  readFileSync(join(process.cwd(), 'prompts', name + '.v1.txt'), 'utf8');
export const model = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
export function eleven() {
  requireThat(process.env.ELEVENLABS_API_KEY, 503, 'credentials', 'ELEVENLABS_API_KEY fehlt.');
  return new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY, maxRetries: 0 });
}
export async function structured<T>(
  name: string,
  schema: z.ZodType<T>,
  input: unknown,
  images?: string[],
): Promise<{ data: T; usage: unknown }> {
  requireThat(process.env.ANTHROPIC_API_KEY, 503, 'credentials', 'ANTHROPIC_API_KEY fehlt.');
  const client = new Anthropic({ maxRetries: 1, timeout: 30000 });
  const format = zodOutputFormat(schema);
  // Strict output schemas forbid extras; constraints are also enforced locally.
  const content: Anthropic.MessageParam['content'] = [
    { type: 'text', text: JSON.stringify(input) },
    ...(images || []).map((data) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/png' as const, data },
    })),
  ];
  const result = await client.messages.create({
    model: model(),
    max_tokens: 6000,
    system: prompt(name),
    messages: [{ role: 'user', content }],
    output_config: { format },
  });
  requireThat(
    result.stop_reason === 'end_turn',
    503,
    'incomplete',
    'Provider-Ausgabe unvollständig oder verweigert.',
  );
  const text = result.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  try {
    return { data: schema.parse(JSON.parse(text)), usage: result.usage };
  } catch {
    throw new AppError(422, 'provider_schema', 'Provider-Ausgabe oder Referenzen ungültig.');
  }
}
export const VisionSchema = z.object({ facts: Facts, description: z.string() }).strict();
export const QuestionSchema = CandidateSchema;
export async function extraction(app: Blueprint, s: Session) {
  const segments = app.store.list('segments', s.id),
    events = app.store.list('events', s.id);
  const result = await structured('extraction', ExtractionProviderSchema, {
    baseDraftRevision: s.draft.revision,
    draft: s.draft,
    segments,
    events,
    questions: s.questions,
  });
  return { data: decodeExtraction(normalizeExtraction(result.data)), usage: result.usage };
}
export type Binding = {
  id: string;
  ownerId: string;
  sessionId: string;
  status: 'creating' | 'ready' | 'failed';
  agentId: string | null;
  versionId: string | null;
  kbId: string | null;
  procedureId: string | null;
  contentHash: string;
  promptHash: string;
  mode: 'kb_procedure' | 'runtime_lookup';
  toolIds?: string[];
  deviations: string[];
};
export async function tutorBinding(app: Blueprint, v: Snapshot, ownerId: string): Promise<Binding> {
  const b = app.store.get<Binding>('bindings', v.id);
  if (b?.status === 'ready') {
    requireThat(b.contentHash === v.contentHash, 409, 'binding', 'Falsche Wissenbindung.');
    return b;
  }
  requireThat(
    !b || b.agentId,
    503,
    'provisioning',
    'Unvollständige Provider-Erstellung; Ressourcen vor erneutem Versuch manuell abgleichen.',
  );
  const client = eleven();
  const text =
    prompt('tutor') +
    '\nGEPINNTE_VERSION ' +
    JSON.stringify({
      versionId: v.id,
      contentHash: v.contentHash,
      scopeId: v.scopeId,
      claims: v.claims,
      rules: v.rules,
    });
  const binding: Binding = b || {
    id: v.id,
    ownerId,
    sessionId: v.sessionId,
    status: 'creating',
    agentId: null,
    versionId: null,
    kbId: null,
    procedureId: null,
    contentHash: v.contentHash,
    promptHash: hash(text),
    mode: 'runtime_lookup',
    deviations: [],
  };
  const save = () => app.store.put('bindings', binding, ownerId, v.sessionId);
  save();
  try {
    if (!binding.kbId) {
      try {
        const kb = await client.conversationalAi.knowledgeBase.documents.createFromText({
          name: 'Blueprint ' + v.contentHash.slice(0, 12),
          text: JSON.stringify({ claims: v.claims, rules: v.rules }),
        });
        binding.kbId = kb.id;
        save();
      } catch {
        binding.deviations.push('KB-Erstellung fehlgeschlagen; kompakter fester Prompt verwendet.');
        save();
      }
    }
    if (!binding.agentId) {
      binding.toolIds ||= [];
      const names = ['get_current_facts', 'get_confirmed_rule', 'show_evidence', 'highlight_field'];
      for (let i = binding.toolIds.length; i < names.length; i++) {
        const name = names[i];
        const tool = await client.conversationalAi.tools.create({
          toolConfig: {
            type: 'client',
            name,
            description: 'Read-only, server-validated exercise lookup: ' + name,
            expectsResponse: true,
            parameters: {
              type: 'object',
              required: name === 'show_evidence' || name === 'highlight_field' ? ['id'] : [],
              properties:
                name === 'get_current_facts'
                  ? {}
                  : {
                      id: {
                        type: 'string',
                        description: 'Allowed field, rule or evidence ID from this pinned exercise',
                      },
                    },
            },
          },
        });
        binding.toolIds.push(tool.id);
        save();
      }
    }
    if (!binding.agentId) {
      requireThat(
        process.env.ELEVENLABS_VOICE_ID,
        503,
        'voice',
        'ELEVENLABS_VOICE_ID für dedizierten Tutor fehlt.',
      );
      const agent = await client.conversationalAi.agents.create({
        name: 'Blueprint Tutor ' + v.contentHash.slice(0, 12),
        conversationConfig: {
          agent: {
            language: 'en',
            firstMessage: 'What decision would you make, and why?',
            prompt: {
              prompt: text,
              toolIds: binding.toolIds,
              ...(binding.kbId
                ? {
                    knowledgeBase: [
                      {
                        type: 'text',
                        name: 'Bestätigter Blueprint',
                        id: binding.kbId,
                        usageMode: 'prompt',
                      },
                    ],
                  }
                : {}),
            },
          },
          tts: { voiceId: process.env.ELEVENLABS_VOICE_ID },
        },
        platformSettings: {
          privacy: {
            recordVoice: false,
            retentionDays: 0,
            deleteAudio: true,
            deleteTranscriptAndPii: true,
          },
          auth: { enableAuth: true },
        },
      });
      binding.agentId = agent.agentId;
      save();
    }
    let agent = await client.conversationalAi.agents.get(binding.agentId);
    if (!binding.procedureId && agent.branchId) {
      try {
        const proc = await client.conversationalAi.agents.procedures.create(
          binding.agentId,
          agent.branchId,
          {
            name: 'Exercise-only coaching',
            type: 'free_form',
            content: prompt('tutor'),
            trigger: 'When coaching this exercise',
          },
        );
        binding.procedureId = proc.procedureId;
        save();
        await client.conversationalAi.agents.procedures.compile(binding.agentId, agent.branchId);
        agent = await client.conversationalAi.agents.get(binding.agentId);
      } catch {
        binding.deviations.push(
          'Procedure nicht verfügbar; fester Coaching-Prompt und Server-Lookup.',
        );
        save();
      }
    }
    requireThat(
      agent.versionId,
      503,
      'version_binding',
      'Provider liefert keine feste Agentversion.',
    );
    binding.versionId = agent.versionId;
    binding.mode = binding.kbId && binding.procedureId ? 'kb_procedure' : 'runtime_lookup';
    binding.status = 'ready';
    save();
    return binding;
  } catch (e) {
    binding.status = 'failed';
    save();
    throw e;
  }
}
export async function tokens(app: Blueprint, s: Session, ownerId: string, runId?: string) {
  const client = eleven();
  let agentId = process.env.ELEVENLABS_INTERVIEWER_AGENT_ID,
    versionId: string | undefined;
  if (runId) {
    const ctx = app.context(ownerId, runId);
    requireThat(
      ctx.rules.length > 0,
      422,
      'independent',
      'Vor unabhängiger Erstentscheidung kein Tutor.',
    );
    const v = app.store.get<Snapshot>('versions', ctx.versionId)!;
    requireThat(v.sessionId === s.id, 403, 'scope', 'Fremder Tutor-Run.');
    const b = await tutorBinding(app, v, ownerId);
    agentId = b.agentId!;
    versionId = b.versionId!;
  } else {
    requireThat(
      ['capture', 'debrief'].includes(s.state),
      409,
      'capture_closed',
      'Voice nur während Capture/Debrief.',
    );
    requireThat(agentId, 503, 'agent', 'ELEVENLABS_INTERVIEWER_AGENT_ID fehlt.');
    const configured = await client.conversationalAi.agents.get(agentId);
    requireThat(
      configured.conversationConfig.agent?.prompt?.prompt === prompt('interviewer'),
      503,
      'agent_prompt',
      'Interviewer-Prompt passt nicht zu prompts/interviewer.v1.txt. provisioning script verwenden.',
    );
    requireThat(
      configured.platformSettings?.privacy?.recordVoice === false,
      503,
      'privacy',
      'Interviewer muss Provider-Audio-Saving deaktivieren.',
    );
    versionId = configured.versionId;
  }
  requireThat(
    agentId && versionId,
    503,
    'version_binding',
    'Agent und feste Version erforderlich.',
  );
  const conversation = await client.conversationalAi.conversations.getWebrtcToken({
    agentId,
    versionId,
  });
  const scribe = runId ? null : await client.tokens.singleUse.create('realtime_scribe');
  const latest = app.session(s.id, ownerId);
  requireThat(
    runId
      ? latest.id === s.id
      : latest.state === s.state &&
          ['capture', 'debrief'].includes(latest.state) &&
          latest.epoch === s.epoch,
    409,
    'epoch',
    'Voice-Verbindung inzwischen geschlossen.',
  );
  if (runId) app.context(ownerId, runId);
  return { conversationToken: conversation.token, scribeToken: scribe?.token, versionId };
}
export async function speakTeachback(text: string) {
  const client = eleven();
  requireThat(process.env.ELEVENLABS_VOICE_ID, 503, 'voice', 'ELEVENLABS_VOICE_ID fehlt.');
  const stream = await client.textToSpeech.convert(process.env.ELEVENLABS_VOICE_ID, {
    text,
    modelId: 'eleven_multilingual_v2',
    outputFormat: 'pcm_16000',
  });
  const bytes = Buffer.from(await new Response(stream as ReadableStream).arrayBuffer());
  const wav = Buffer.alloc(44 + bytes.length);
  wav.write('RIFF');
  wav.writeUInt32LE(36 + bytes.length, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(bytes.length, 40);
  bytes.copy(wav, 44);
  return wav.toString('base64');
}
