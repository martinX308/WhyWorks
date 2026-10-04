import { readFileSync, writeFileSync } from 'node:fs';
import { eleven, prompt } from '../src/adapters/providers';
try {
  process.loadEnvFile('.env.local');
} catch {}
const client = eleven();
if (process.env.ELEVENLABS_INTERVIEWER_AGENT_ID) {
  let agent = await client.conversationalAi.agents.get(
    process.env.ELEVENLABS_INTERVIEWER_AGENT_ID,
  );
  if (process.argv.includes('--sync')) {
    if (!process.env.ELEVENLABS_VOICE_ID)
      throw new Error('ELEVENLABS_VOICE_ID in .env.local eintragen.');
    agent = await client.conversationalAi.agents.update(agent.agentId, {
      conversationConfig: {
        agent: {
          ...agent.conversationConfig.agent,
          language: 'en',
          prompt: { ...agent.conversationConfig.agent?.prompt, prompt: prompt('interviewer') },
        },
        tts: {
          ...agent.conversationConfig.tts,
          voiceId: process.env.ELEVENLABS_VOICE_ID,
          modelId: 'eleven_v3_conversational',
          expressiveMode: true,
        },
      },
    });
  }
  console.log(
    JSON.stringify(
      {
        agentId: agent.agentId,
        versionId: agent.versionId,
        language: agent.conversationConfig.agent?.language,
        promptMatches: agent.conversationConfig.agent?.prompt?.prompt === prompt('interviewer'),
        privacy: agent.platformSettings?.privacy,
        tts: agent.conversationConfig.tts,
      },
      null,
      2,
    ),
  );
} else {
  if (!process.env.ELEVENLABS_VOICE_ID)
    throw new Error('ELEVENLABS_VOICE_ID in .env.local eintragen.');
  const created = await client.conversationalAi.agents.create({
    name: 'Operational Blueprint Interviewer v1',
    conversationConfig: {
      agent: {
        language: 'en',
        firstMessage: '',
        prompt: {
          prompt: prompt('interviewer'),
          builtInTools: {
            skipTurn: {
              type: 'system',
              name: 'skip_turn',
              params: { systemToolType: 'skip_turn' },
            },
          },
        },
      },
      turn: { turnEagerness: 'patient', initialWaitTime: 30, turnTimeout: 30 },
      tts: {
        voiceId: process.env.ELEVENLABS_VOICE_ID,
        modelId: 'eleven_v3_conversational',
        expressiveMode: true,
      },
    },
    platformSettings: {
      auth: { enableAuth: true },
      privacy: {
        recordVoice: false,
        retentionDays: 0,
        deleteTranscriptAndPii: true,
        deleteAudio: true,
      },
    },
  });
  // Persist ID immediately; don't create another agent if later validation fails.
  const env = readFileSync('.env.local', 'utf8');
  writeFileSync(
    '.env.local',
    env.replace(
      /^ELEVENLABS_INTERVIEWER_AGENT_ID=.*$/m,
      'ELEVENLABS_INTERVIEWER_AGENT_ID=' + created.agentId,
    ),
  );
  console.log('Interviewer angelegt; ID lokal gespeichert. Live-Probe noch erforderlich.');
}
