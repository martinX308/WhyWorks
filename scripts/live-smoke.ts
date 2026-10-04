import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import sharp from 'sharp';
import { Scribe, AudioFormat, CommitStrategy, RealtimeEvents } from '@elevenlabs/client';
import {
  eleven,
  prompt,
  model,
  structured,
  speakTeachback,
  VisionSchema,
  extraction,
} from '../src/adapters/providers';
import { QuestionPlanSchema } from '../src/domain/elicitation';
import { gate } from '../src/domain/interpreter';
import { Blueprint } from '../src/application/service';
import { Store } from '../src/adapters/store';

process.loadEnvFile('.env.local');
const reportPath = 'docs/provider-smoke-report.json';
const previous = process.argv.includes('--retry-extraction')
  ? JSON.parse(readFileSync(reportPath, 'utf8'))
  : null;
if (previous)
  assert(previous.source === 'synthetic_provider_smoke', 'Unexpected previous report source.');
const report = {
  date: new Date().toISOString(),
  previousEvidenceDate: previous?.date || null,
  source: 'synthetic_provider_smoke',
  countsAsA1LiveAcceptance: false,
  countsAsA2LiveAcceptance: false,
  model: model(),
  checks: (previous?.checks.filter(
    (c: { name: string }) => c.name !== 'claude_extraction_and_server_gate',
  ) || []) as {
    name: string;
    status: 'passed' | 'failed' | 'skipped';
    durationMs: number;
    evidence?: unknown;
    error?: unknown;
  }[],
  limitations: [
    'Synthetic image and generated speech; no human expert or browser microphone.',
    'WebRTC token issuance does not prove an established browser conversation.',
    'No ten-minute parallel capture, barge-in or Off record network proof.',
    'No Challenge publish or live question quotas certified.',
    'Recorded token usage covers retained successful responses, not all diagnostic attempts; provider currency charges not measured.',
  ],
};
function save() {
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function check<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (previous && name !== 'claude_extraction_and_server_gate')
    return report.checks.find((c) => c.name === name && c.status === 'passed')?.evidence as
      T | undefined;
  const at = Date.now();
  try {
    const evidence = await fn();
    report.checks.push({ name, status: 'passed', durationMs: Date.now() - at, evidence });
    console.log(name + ': passed');
    save();
    return evidence;
  } catch (error) {
    // SDK errors may contain request headers, tokens or URLs: never serialize them.
    const e = error as {
      name?: string;
      status?: number;
      statusCode?: number;
      message?: string;
      issues?: { path: unknown[]; code: string; message: string }[];
    };
    const local = e.name === 'Error' && !e.status && !e.statusCode;
    report.checks.push({
      name,
      status: 'failed',
      durationMs: Date.now() - at,
      error: {
        type: e.name,
        httpStatus: e.status || e.statusCode || null,
        validationIssues: e.issues?.map((issue) => ({
          path: issue.path,
          code: issue.code,
          message: issue.message,
        })),
        message:
          local && !/https?:|wss?:|token|key/i.test(e.message || '')
            ? e.message
            : 'Provider request failed; credentials and request details omitted.',
      },
    });
    console.log(name + ': failed');
    save();
    return undefined;
  }
}
save();
const client = eleven();
await check('interviewer_configuration', async () => {
  assert(process.env.ELEVENLABS_INTERVIEWER_AGENT_ID, 'Interviewer configuration missing.');
  const agent = await client.conversationalAi.agents.get(
    process.env.ELEVENLABS_INTERVIEWER_AGENT_ID,
  );
  assert(
    agent.conversationConfig.agent?.prompt?.prompt === prompt('interviewer'),
    'Interviewer prompt differs.',
  );
  assert(
    agent.platformSettings?.privacy?.recordVoice === false,
    'Provider audio saving is enabled.',
  );
  assert(agent.versionId, 'Interviewer has no pinned version.');
  assert(
    agent.conversationConfig.tts?.voiceId === process.env.ELEVENLABS_VOICE_ID,
    'Interviewer voice differs.',
  );
  return {
    promptMatches: true,
    recordVoice: false,
    versionPresent: true,
    language: agent.conversationConfig.agent?.language,
  };
});
await check('webrtc_token_issuance', async () => {
  const agent = await client.conversationalAi.agents.get(
    process.env.ELEVENLABS_INTERVIEWER_AGENT_ID!,
  );
  assert(agent.versionId, 'Interviewer has no pinned version.');
  const result = await client.conversationalAi.conversations.getWebrtcToken({
    agentId: agent.agentId,
    versionId: agent.versionId,
  });
  assert(result.token, 'Empty connection credential.');
  return { issued: true, versionPinned: true, browserConnected: false };
});

const statement =
  'Stop approval at two hundred basis points or more. Below two hundred basis points, approve only if the vendor is known, the purchase order matches, goods receipt is confirmed, and bank details have not changed.';
let audio: Buffer | undefined = previous
  ? readFileSync('data/live-smoke/generated-statement.wav')
  : undefined;
await check('teachback_tts', async () => {
  audio = Buffer.from(await speakTeachback(statement), 'base64');
  assert(
    audio.subarray(0, 4).toString() === 'RIFF' && audio.length > 3200,
    'Invalid or empty generated audio.',
  );
  mkdirSync('data/live-smoke', { recursive: true });
  writeFileSync('data/live-smoke/generated-statement.wav', audio);
  return {
    wavBytes: audio.length,
    durationSeconds: (audio.length - 44) / 32000,
    inputCharacters: statement.length,
    syntheticSpeech: true,
  };
});
let transcript: string | undefined = previous?.checks.find(
  (c: { name: string }) => c.name === 'scribe_realtime_with_timestamps',
)?.evidence?.text;
if (audio)
  await check('scribe_realtime_with_timestamps', async () => {
    const auth = await client.tokens.singleUse.create('realtime_scribe');
    const connection = await Scribe.connect({
      token: auth.token,
      modelId: 'scribe_v2_realtime',
      audioFormat: AudioFormat.PCM_16000,
      sampleRate: 16000,
      languageCode: 'en',
      commitStrategy: CommitStrategy.MANUAL,
      includeTimestamps: true,
    });
    try {
      const result = new Promise<{ text: string; words?: { start?: number; end?: number }[] }>(
        (resolve, reject) => {
          connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT_WITH_TIMESTAMPS, resolve);
          connection.on(RealtimeEvents.ERROR, () =>
            reject(new Error('Realtime Scribe reported an error.')),
          );
        },
      );
      // Observe rejection immediately while streaming; the final await reports it.
      void result.catch(() => {});
      let readyTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await new Promise<void>((resolve, reject) => {
          readyTimer = setTimeout(() => reject(new Error('Realtime connection timed out.')), 10000);
          connection.on(RealtimeEvents.SESSION_STARTED, () => resolve());
          connection.on(RealtimeEvents.ERROR, () =>
            reject(new Error('Realtime connection failed.')),
          );
          connection.on(RealtimeEvents.CLOSE, () =>
            reject(new Error('Realtime connection closed before readiness.')),
          );
        });
      } finally {
        clearTimeout(readyTimer);
      }
      const pcm = audio!.subarray(44);
      for (let i = 0; i < pcm.length; i += 16000) {
        connection.send({
          audioBase64: pcm.subarray(i, i + 16000).toString('base64'),
          sampleRate: 16000,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      connection.commit();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Realtime transcription timed out.')), 20000);
      });
      try {
        const committed = await Promise.race([result, timeout]);
        transcript = committed.text;
        assert(transcript.trim().length > 0, 'Empty committed transcript.');
        assert(/(two hundred|200)/i.test(transcript), 'Spoken numeric threshold missing.');
        assert(
          /bank/i.test(transcript) && /receipt/i.test(transcript),
          'Spoken prerequisites missing.',
        );
        assert(
          committed.words &&
            committed.words.length > 0 &&
            committed.words.some((w) => typeof w.start === 'number' && typeof w.end === 'number'),
          'Word timestamps missing.',
        );
        return { text: transcript, wordCount: committed.words.length, syntheticSpeech: true };
      } finally {
        clearTimeout(timer);
      }
    } finally {
      connection.close();
    }
  });

const facts = {
  vendorKnown: true,
  poMatches: true,
  varianceBps: 150,
  goodsReceiptConfirmed: true,
  bankDetailsChanged: false,
  verificationStatus: null,
};
await check('claude_vision_structured_output', async () => {
  const lines = [
    'SYNTHETIC SANDBOX — PROVIDER SMOKE',
    'Vendor known: Yes',
    'Purchase order matches: Yes',
    'Variance: 150 basis points',
    'Goods receipt confirmed: Yes',
    'Bank details changed: No',
  ];
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><rect width="960" height="640" fill="white"/>' +
    lines
      .map(
        (line, i) =>
          `<text x="40" y="${65 + i * 75}" font-size="26" font-family="sans-serif" fill="black">${line}</text>`,
      )
      .join('') +
    '</svg>';
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  const result = await structured('vision', VisionSchema, { source: 'synthetic_provider_smoke' }, [
    image.toString('base64'),
  ]);
  assert(isDeepStrictEqual(result.data.facts, facts), 'Visible facts were read incorrectly.');
  return { facts: result.data.facts, usage: result.usage, syntheticImage: true };
});

// A failed transcription never falls back to the scripted text for extraction.
if (transcript) {
  const store = new Store();
  const app = new Blueprint(store);
  const owner = 'provider-smoke';
  const { session } = app.create(owner, 'Synthetic provider smoke', 'replay');
  session.state = 'capture';
  const event = {
    id: 'smoke-event',
    epoch: 1,
    sequence: 1,
    atMs: 0,
    caseId: 'smoke-case',
    source: 'screen_observation',
    facts,
    frameId: 'smoke-frame',
  };
  const segment = {
    id: 'smoke-segment',
    epoch: 1,
    sequence: 1,
    atMs: 0,
    endMs: (audio!.length - 44) / 32,
    caseId: event.caseId,
    source: 'expert_statement',
    text: transcript,
    committed: true,
    audioId: null,
    timing: 'audio_unavailable',
    phase: 'live',
  };
  store.put('events', event, owner, session.id);
  store.put('segments', segment, owner, session.id);
  await check('claude_extraction_and_server_gate', async () => {
    const result = await extraction(app, session);
    const patch = result.data;
    app.validatePatch(session, patch);
    assert(
      patch.claims.length > 0 && patch.rules.length > 0,
      'Extraction returned no claims or rules.',
    );
    const rules = patch.rules.map((rule) => ({ ...rule, review: 'expert_confirmed' as const }));
    assert(
      gate(rules, 'approve', facts, ['sandbox_decide']).outcome === 'allowed',
      'Complete synthetic case was not permitted.',
    );
    assert(
      gate(rules, 'approve', { ...facts, varianceBps: 240 }, ['sandbox_decide']).outcome ===
        'blocked',
      'Learned stop threshold was not enforced.',
    );
    assert(
      gate(rules, 'approve', { ...facts, goodsReceiptConfirmed: null }, ['sandbox_decide'])
        .outcome !== 'allowed',
      'Unknown prerequisite was permitted.',
    );
    return {
      claimCount: patch.claims.length,
      ruleCount: patch.rules.length,
      exactQuotesValidated: true,
      permit: true,
      stop: true,
      unknownNotAllowed: true,
      usage: result.usage,
      note: 'Confirmation simulated only within isolated synthetic gate probe; nothing published.',
    };
  });
  await check('a2_question_planner', async () => {
    const gap = {
      id: 'smoke-gap',
      topic: 'Approval stop threshold',
      critical: true,
      status: 'open',
      claimIds: [],
    };
    const result = await structured('question-planner', QuestionPlanSchema, {
      epoch: 1,
      draftRevision: 0,
      phase: 'live',
      events: [event],
      draft: { ...session.draft, gaps: [gap] },
      eligibleGaps: [gap],
      askedTopics: [],
    });
    const candidate = result.data.candidates[0];
    assert(
      candidate &&
        candidate.caseId === event.caseId &&
        candidate.eventIds.includes(event.id) &&
        candidate.gapIds.includes(gap.id),
      'Planner did not bind its question to the supplied case and gap.',
    );
    assert(
      candidate.kind === 'guardrail' && candidate.topicKey === 'approval stop threshold',
      'Planner priority or topic normalization incorrect.',
    );
    return {
      question: candidate.question,
      kind: candidate.kind,
      sourceReferencesValid: true,
      usage: result.usage,
    };
  });
  store.close();
} else {
  report.checks.push({
    name: 'claude_extraction_and_server_gate',
    status: 'skipped',
    durationMs: 0,
    evidence: 'No real provider transcript available.',
  });
  report.checks.push({
    name: 'a2_question_planner',
    status: 'skipped',
    durationMs: 0,
    evidence: 'No real provider transcript available.',
  });
  save();
}
process.exit(report.checks.every((c) => c.status === 'passed') ? 0 : 1);
