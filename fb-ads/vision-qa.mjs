#!/usr/bin/env node
// vision-qa.mjs — grades rendered creatives against the brand rubric with a vision model.
//
// This is the "external" verifier for the vision-qa acceptance criterion: a model that
// did NOT generate the creative grades the rendered image against config.brand. The
// verdict is written as a per-creative ARTIFACT with provenance — model, gradedAt, and
// the sha256 of the exact image graded — because a verdict without provenance is
// indistinguishable from a hardcoded fixture constant, and the acceptance check
// (scripts/verify-acceptance.registry.mjs) rejects exactly that.
//
// Usage:
//   node vision-qa.mjs --run <runDir>            grade every non-skipped creative in
//                                                <runDir>/database.json; write
//                                                <runDir>/<creative_id>/vision-review.json
//   node vision-qa.mjs --image <path> [--id <creative_id>]   grade one image ad hoc
//
//   DRY_RUN=1 never touches the network: it writes a status "dry_run" artifact (with a
//   real imageSha256 when the file exists) so offline verify can prove the wiring
//   without ever minting a fake "passed".
//
// Zero dependencies by template contract: raw fetch against the Anthropic Messages API
// (POST /v1/messages), the same convention every other external call in this agent uses.
// Env: ANTHROPIC_API_KEY (name only ever lands on disk; per-client key).

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENT_DIR = dirname(fileURLToPath(import.meta.url));
// Read at call time (not module load) so DRY_RUN is honored however the module is
// loaded - including tests that flip it after import.
const isDryRun = () => Boolean(process.env.DRY_RUN);

const DEFAULT_MODEL = 'claude-opus-4-8';
const API_URL = 'https://api.anthropic.com/v1/messages';

const MEDIA_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

// The verdict the model must produce. additionalProperties:false + required on every
// field so a malformed grade is a hard error, not a silently-lenient pass.
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['passed', 'failed'] },
    issues: {
      type: 'array',
      items: { type: 'string' },
      description: 'Every rubric violation found; empty only when status is passed.',
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['status', 'issues', 'confidence'],
  additionalProperties: false,
};

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// The rubric is built from config.brand — the same block the generation brief uses —
// plus the creative's own intent fields, so the grader checks what THIS creative was
// supposed to be, not a generic "does this look nice".
export function buildRubricPrompt(config, creative) {
  const brand = config.brand ?? {};
  const lines = [
    'You are a brand QA reviewer for a Facebook/Meta ad. Grade the attached creative image strictly against the rubric below.',
    'Fail the creative on ANY rubric violation, rendering artifact (garbled text, distorted anatomy, watermark remnants), or mismatch between the image and its stated intent. When uncertain, fail with low confidence rather than pass.',
    '',
    `Brand mission: ${brand.mission ?? '(not set)'}`,
    `Audience: ${brand.audience ?? '(not set)'}`,
    `Tone: ${brand.tone ?? '(not set)'}`,
    `Message pillars: ${(brand.message_pillars ?? []).join(' | ') || '(none)'}`,
  ];
  const rules = brand.generation_rules ?? [];
  if (rules.length) {
    lines.push('Hard generation rules (each is an automatic fail if violated):');
    for (const rule of rules) lines.push(`- ${rule}`);
  }
  if (brand.confidential_name) {
    lines.push('- The client\'s real brand name is CONFIDENTIAL and must not appear anywhere in the image.');
  }
  lines.push(
    '',
    'This creative\'s stated intent:',
    `- Format: ${creative.format ?? '(unknown)'}`,
    `- Persona: ${creative.persona_key ?? '(unknown)'}`,
    `- Insight: ${creative.insight_key ?? '(unknown)'}`,
    `- Generation prompt it was rendered from: ${creative.prompt ?? '(unknown)'}`,
    `- Ad copy it will run with: ${creative.ad_copy ?? '(unknown)'}`,
  );
  return lines.join('\n');
}

async function callVisionModel(config, creative, imagePath) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Vision QA needs the per-client Anthropic key (env NAME lives in .env.example).');
  }
  const mediaType = MEDIA_TYPES[extname(imagePath).toLowerCase()];
  if (!mediaType) throw new Error(`unsupported image type for vision QA: ${imagePath}`);

  const body = {
    model: config.vision_qa?.model ?? DEFAULT_MODEL,
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: readFileSync(imagePath).toString('base64'),
            },
          },
          { type: 'text', text: buildRubricPrompt(config, creative) },
        ],
      },
    ],
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`vision QA request failed: HTTP ${res.status} ${await res.text()}`);
  }
  const payload = await res.json();

  // A refusal is a failed grade with a reason, not a crash: the creative goes back to
  // the human gate either way, and the artifact records why.
  if (payload.stop_reason === 'refusal') {
    return { verdict: { status: 'failed', issues: ['vision model refused to grade this image'], confidence: 'low' }, model: payload.model };
  }
  if (payload.stop_reason === 'max_tokens') {
    throw new Error('vision QA response truncated (stop_reason max_tokens)');
  }
  const text = (payload.content ?? []).find((b) => b.type === 'text')?.text;
  if (!text) throw new Error(`vision QA returned no text verdict (stop_reason ${payload.stop_reason})`);
  return { verdict: JSON.parse(text), model: payload.model };
}

// Grade one creative; returns the artifact object (also written to disk when outDir given).
export async function gradeCreative(config, creative, { agentDir = AGENT_DIR, outDir = null } = {}) {
  const imagePath = creative.local_path && (isAbsolute(creative.local_path)
    ? creative.local_path
    : join(agentDir, creative.local_path));
  const imageExists = Boolean(imagePath) && existsSync(imagePath);

  let artifact;
  if (isDryRun()) {
    artifact = {
      creative_id: creative.creative_id,
      status: 'dry_run',
      issues: ['DRY_RUN: no network; this is a wiring rehearsal, never a pass'],
      confidence: null,
      model: 'dry-run',
      gradedAt: 'dry-run',
      imageSha256: imageExists ? sha256File(imagePath) : null,
    };
  } else {
    if (!imageExists) {
      throw new Error(`creative ${creative.creative_id} has no image on disk at ${creative.local_path ?? '(unset)'} — nothing to grade`);
    }
    const { verdict, model } = await callVisionModel(config, creative, imagePath);
    artifact = {
      creative_id: creative.creative_id,
      status: verdict.status,
      issues: verdict.issues,
      confidence: verdict.confidence,
      model,
      gradedAt: new Date().toISOString(),
      imageSha256: sha256File(imagePath),
    };
  }

  if (outDir) {
    const dir = join(outDir, creative.creative_id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'vision-review.json'), JSON.stringify(artifact, null, 2) + '\n');
  }
  return artifact;
}

export async function gradeRun(config, runDir, { agentDir = AGENT_DIR } = {}) {
  const db = JSON.parse(readFileSync(join(runDir, 'database.json'), 'utf8'));
  const results = [];
  for (const creative of db.creatives ?? []) {
    if (creative.status === 'skipped') continue;
    const artifact = await gradeCreative(config, creative, { agentDir, outDir: runDir });
    // Stamp the database row from the ARTIFACT so downstream readers see the same
    // verdict verify grades — but the artifact stays the source of truth.
    creative.vision_review = {
      status: artifact.status,
      model: artifact.model,
      gradedAt: artifact.gradedAt,
      imageSha256: artifact.imageSha256,
      issues: artifact.issues,
    };
    results.push(artifact);
    console.log(`[vision-qa] ${creative.creative_id}: ${artifact.status}${artifact.issues?.length ? ` (${artifact.issues.join('; ')})` : ''}`);
  }
  writeFileSync(join(runDir, 'database.json'), JSON.stringify(db, null, 2) + '\n');
  const failed = results.filter((r) => r.status === 'failed').length;
  console.log(`[vision-qa] graded ${results.length} creative(s): ${results.length - failed - results.filter((r) => r.status === 'dry_run').length} passed, ${failed} failed${isDryRun() ? ' (DRY_RUN rehearsal)' : ''}`);
  return results;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--')) throw new Error('usage: node vision-qa.mjs --run <runDir> | --image <path> [--id <creative_id>]');
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1] || '').href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const config = JSON.parse(readFileSync(
      isDryRun() && existsSync(join(AGENT_DIR, 'fixtures', 'client.config.json'))
        ? join(AGENT_DIR, 'fixtures', 'client.config.json')
        : join(AGENT_DIR, 'client.config.json'),
      'utf8',
    ));
    if (args.run) {
      await gradeRun(config, args.run);
    } else if (args.image) {
      const artifact = await gradeCreative(
        config,
        { creative_id: args.id ?? 'adhoc', local_path: args.image },
        { outDir: null },
      );
      console.log(JSON.stringify(artifact, null, 2));
      if (artifact.status === 'failed') process.exitCode = 1;
    } else {
      throw new Error('usage: node vision-qa.mjs --run <runDir> | --image <path> [--id <creative_id>]');
    }
  } catch (err) {
    console.error(`[vision-qa] FAIL: ${err.message}`);
    process.exit(1);
  }
}
