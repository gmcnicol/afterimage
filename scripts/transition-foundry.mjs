#!/usr/bin/env node

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULTS = {
  count: 24,
  width: 640,
  height: 360,
  fps: 15,
  duration: 0.75,
  topK: 16,
  recipes: ['white-burn', 'glitch-bands', 'plasma', 'dropout-foam']
};

const RECIPE_LIST = new Set([
  'white-burn',
  'glitch-bands',
  'plasma',
  'block-decay',
  'head-switch-smear',
  'dropout-foam'
]);

function printUsage() {
  console.log(`Usage:
  node scripts/transition-foundry.mjs run [options]
  node scripts/transition-foundry.mjs generate [options]
  node scripts/transition-foundry.mjs analyze --manifest <path> [options]
  node scripts/transition-foundry.mjs review --manifest <path> [options]

Options:
  --out-dir <path>        Output directory for generated assets.
  --manifest <path>       Existing manifest to analyze or review.
  --count <n>             Number of candidates to generate. Default: ${DEFAULTS.count}
  --width <n>             Frame width. Default: ${DEFAULTS.width}
  --height <n>            Frame height. Default: ${DEFAULTS.height}
  --fps <n>               Frame rate. Default: ${DEFAULTS.fps}
  --duration <seconds>    Clip duration. Default: ${DEFAULTS.duration}
  --top-k <n>             Number of winners to use for review outputs. Default: ${DEFAULTS.topK}
  --recipes <csv>         Recipe families. Default: ${DEFAULTS.recipes.join(',')}
  --demo-a <path>         Optional first clip for demo transitions.
  --demo-b <path>         Optional second clip for demo transitions.
  --seed <n>              Base random seed. Default: current time.
`);
}

function parseArgs(argv) {
  const [command = 'run', ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) {
      options[key] = true;
      continue;
    }

    options[key] = value;
    index += 1;
  }

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  return { command, options };
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFloat(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value, digits = 3) {
  return Number(value).toFixed(digits);
}

function smoothstep(t) {
  return t * t * (3 - (2 * t));
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function sample(random, min, max) {
  return min + ((max - min) * random());
}

function sanitizeSegment(input) {
  return String(input).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function inferRunDirectory(options) {
  if (options['out-dir']) {
    return path.resolve(options['out-dir']);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve('artifacts', 'transition-foundry', timestamp);
}

function buildConfig(options) {
  const recipes = String(options.recipes ?? DEFAULTS.recipes.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  for (const recipe of recipes) {
    if (!RECIPE_LIST.has(recipe)) {
      throw new Error(`Unsupported recipe "${recipe}". Supported recipes: ${[...RECIPE_LIST].join(', ')}`);
    }
  }

  return {
    outDir: inferRunDirectory(options),
    manifestPath: options.manifest ? path.resolve(options.manifest) : undefined,
    count: clamp(toInt(options.count, DEFAULTS.count), 1, 1000),
    width: clamp(toInt(options.width, DEFAULTS.width), 64, 4096),
    height: clamp(toInt(options.height, DEFAULTS.height), 64, 4096),
    fps: clamp(toInt(options.fps, DEFAULTS.fps), 1, 120),
    duration: clamp(toFloat(options.duration, DEFAULTS.duration), 0.2, 5),
    topK: clamp(toInt(options['top-k'], DEFAULTS.topK), 1, 64),
    recipes,
    demoA: options['demo-a'] ? path.resolve(options['demo-a']) : undefined,
    demoB: options['demo-b'] ? path.resolve(options['demo-b']) : undefined,
    seed: toInt(options.seed, Date.now() & 0x7fffffff)
  };
}

async function ensureTools() {
  await runCommand('ffmpeg', ['-version']);
  await runCommand('ffprobe', ['-version']);
}

async function runCommand(binary, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const stdoutChunks = [];
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const stdout = options.binaryOutput ? stdoutBuffer : stdoutBuffer.toString('utf8');

      if (code === 0) {
        resolve({
          stdout,
          stderr,
          stdoutBuffer
        });
        return;
      }

      reject(new Error(`${binary} ${args.join(' ')} failed with exit code ${code}\n${stderr || stdout.toString()}`));
    });
  });
}

function sampleCandidate(recipe, random, config, index) {
  const base = {
    id: `${sanitizeSegment(recipe)}-${String(index + 1).padStart(4, '0')}`,
    recipe,
    width: config.width,
    height: config.height,
    fps: config.fps,
    duration: config.duration,
    seed: Math.floor(random() * 1_000_000_000)
  };

  switch (recipe) {
    case 'white-burn':
      return {
        ...base,
        parameters: {
          noise: sample(random, 14, 38),
          blurA: sample(random, 0.15, 0.8),
          blurB: sample(random, 0.3, 1.2),
          contrast: sample(random, 1.4, 2.8),
          threshold: sample(random, 82, 152)
        }
      };
    case 'glitch-bands':
      return {
        ...base,
        parameters: {
          ampA: sample(random, 85, 170),
          ampB: sample(random, 40, 120),
          periodA: sample(random, 3, 11),
          periodB: sample(random, 9, 36),
          speedA: sample(random, 17, 42),
          speedB: sample(random, 9, 26),
          noise: sample(random, 16, 40),
          blur: sample(random, 0.05, 0.55),
          contrast: sample(random, 1.55, 2.95),
          threshold: sample(random, 78, 152)
        }
      };
    case 'plasma':
      return {
        ...base,
        parameters: {
          ampX: sample(random, 55, 130),
          ampY: sample(random, 55, 140),
          periodX: sample(random, 7, 20),
          periodY: sample(random, 7, 24),
          speedA: sample(random, 7, 20),
          speedB: sample(random, 7, 22),
          noise: sample(random, 12, 28),
          blur: sample(random, 0.1, 0.8),
          contrast: sample(random, 1.35, 2.45),
          threshold: sample(random, 78, 146)
        }
      };
    case 'block-decay':
      return {
        ...base,
        parameters: {
          noise: sample(random, 14, 30),
          blockWidth: sample(random, 16, 52),
          blockHeight: sample(random, 10, 40),
          blur: sample(random, 0.05, 0.8),
          contrast: sample(random, 1.45, 2.7),
          threshold: sample(random, 84, 156)
        }
      };
    case 'head-switch-smear':
      return {
        ...base,
        parameters: {
          noise: sample(random, 14, 34),
          bandHeight: sample(random, 10, 26),
          smearShift: sample(random, 22, 68),
          jitter: sample(random, 4, 16),
          blur: sample(random, 0.05, 0.6),
          contrast: sample(random, 1.45, 2.75),
          threshold: sample(random, 82, 152)
        }
      };
    case 'dropout-foam':
      return {
        ...base,
        parameters: {
          noise: sample(random, 18, 42),
          blobScaleX: sample(random, 14, 34),
          blobScaleY: sample(random, 10, 28),
          shear: sample(random, 8, 26),
          scatterX: sample(random, 6, 20),
          scatterY: sample(random, 4, 16),
          blur: sample(random, 0.05, 0.7),
          contrast: sample(random, 1.55, 3.0),
          threshold: sample(random, 76, 148)
        }
      };
    default:
      throw new Error(`Unhandled recipe "${recipe}".`);
  }
}

function buildPatternSource(candidate) {
  const { width, height, fps, duration, parameters } = candidate;
  const sourcePrefix = `nullsrc=s=${width}x${height}:r=${fps}:d=${formatNumber(duration)}`;
  const offset = formatNumber(parameters.threshold - 128, 1);

  switch (candidate.recipe) {
    case 'white-burn':
      return `${sourcePrefix},format=gray,noise=alls=${formatNumber(parameters.noise, 1)}:allf=t+u,scale=${Math.max(18, Math.round(width / 9))}:${Math.max(10, Math.round(height / 9))}:flags=neighbor,scale=${width}:${height}:flags=neighbor,gblur=sigma=${formatNumber(parameters.blurA)},geq=lum='clip(lum(clip(X+if(gt(sin(floor(Y/8)*1.5+T*1.1),0),24,-16)+7*sin(Y/5)+5*sin(X/23),0,W-1),clip(Y+if(gt(sin(floor(X/19)+T*0.8),0),5,-3)+3*sin(X/31),0,H-1))+22*sin((X+Y)/15)+18*sin(Y/9)+12*sin(X/7),0,255)',eq=contrast=${formatNumber(parameters.contrast)}:brightness=-0.11,lutyuv=y='clip(val+${offset},0,255)',gblur=sigma=${formatNumber(parameters.blurB)}`;
    case 'glitch-bands':
      return `${sourcePrefix},format=gray,geq=lum='clip(lum(clip(X+if(gt(sin(floor(Y/5)*1.9+T*11.7),0),26,-24)+14*sin(Y/2.3+T*31)+8*sin(Y/11-T*7),0,W-1),clip(Y+if(gt(sin(floor(X/14)*1.3+T*7.8),0),4,-5)+2*sin(X/9+T*17),0,H-1))+${formatNumber(parameters.ampA, 1)}*sin(Y/${formatNumber(parameters.periodA, 2)}+T*${formatNumber(parameters.speedA, 2)})+${formatNumber(parameters.ampB, 1)}*sin((Y+X/7)/${formatNumber(parameters.periodB, 2)}-T*${formatNumber(parameters.speedB, 2)})+34*sin(X/3.2+T*23)+18*sin((X+Y)/13-T*15),0,255)',noise=alls=${formatNumber(parameters.noise, 1)}:allf=t+u,eq=contrast=${formatNumber(parameters.contrast)}:brightness=-0.09,lutyuv=y='clip(val+${offset},0,255)',gblur=sigma=${formatNumber(parameters.blur)}`;
    case 'plasma':
      return `${sourcePrefix},format=gray,geq=lum='clip(lum(clip(X+if(gt(sin(floor(Y/9)*1.25+T*3.2),0),14,-12)+8*sin(Y/6+T*9),0,W-1),clip(Y+if(gt(sin(floor(X/16)*1.1+T*2.7),0),5,-4)+4*sin(X/15-T*6),0,H-1))+${formatNumber(parameters.ampX, 1)}*sin(X/${formatNumber(parameters.periodX, 2)}+T*${formatNumber(parameters.speedA, 2)})+${formatNumber(parameters.ampY, 1)}*sin(Y/${formatNumber(parameters.periodY, 2)}-T*${formatNumber(parameters.speedB, 2)})+24*sin((X+Y)/5.5+T*18),0,255)',scale=${Math.max(18, Math.round(width / 13))}:${Math.max(10, Math.round(height / 13))}:flags=neighbor,scale=${width}:${height}:flags=neighbor,noise=alls=${formatNumber(parameters.noise, 1)}:allf=t+u,gblur=sigma=${formatNumber(parameters.blur)},eq=contrast=${formatNumber(parameters.contrast)}:brightness=-0.07,lutyuv=y='clip(val+${offset},0,255)'`;
    case 'block-decay': {
      const blockWidth = clamp(Math.round(parameters.blockWidth), 8, candidate.width);
      const blockHeight = clamp(Math.round(parameters.blockHeight), 8, candidate.height);
      return `${sourcePrefix},format=gray,noise=alls=${formatNumber(parameters.noise, 1)}:allf=t+u,scale=${blockWidth}:${blockHeight}:flags=neighbor,scale=${width}:${height}:flags=neighbor,geq=lum='clip(lum(clip(X+if(gt(sin(floor(Y/5)+T*1.4),0),${Math.max(6, Math.round(blockWidth / 2))},-${Math.max(6, Math.round(blockWidth / 3))})+if(gt(sin(floor(Y/13)+T*2.6),0),8,-6),0,W-1),clip(Y+if(gt(sin(floor(X/17)+T*1.2),0),5,-5),0,H-1))+16*sin(Y/4+T*4.5)+10*sin(X/6-T*3.5),0,255)',eq=contrast=${formatNumber(parameters.contrast)}:brightness=-0.06,lutyuv=y='clip(val+${offset},0,255)',gblur=sigma=${formatNumber(parameters.blur)}`;
    }
    case 'head-switch-smear': {
      const bandHeight = clamp(Math.round(parameters.bandHeight), 6, candidate.height - 2);
      const smearShift = Math.round(parameters.smearShift);
      const jitter = formatNumber(parameters.jitter, 1);
      return `${sourcePrefix},format=gray,noise=alls=${formatNumber(parameters.noise, 1)}:allf=t+u,scale=${Math.max(18, Math.round(width / 11))}:${Math.max(10, Math.round(height / 11))}:flags=neighbor,scale=${width}:${height}:flags=neighbor,geq=lum='clip(lum(clip(X+if(gt(Y,H-${bandHeight}),${smearShift}+10*sin(T*9+Y/3),0)+if(gt(sin(floor(Y/3)+T*5.2),0),${Math.round(smearShift / 3)},-${Math.round(smearShift / 4)})+${jitter}*sin(Y/2+T*19),0,W-1),clip(Y+if(gt(Y,H-${bandHeight}),2*sin(X/11+T*13),0),0,H-1))+22*sin((X+Y)/9)+18*sin(Y/4-T*11),0,255)',eq=contrast=${formatNumber(parameters.contrast)}:brightness=-0.08,lutyuv=y='clip(val+${offset},0,255)',gblur=sigma=${formatNumber(parameters.blur)}`;
    }
    case 'dropout-foam':
      return `${sourcePrefix},format=gray,noise=alls=${formatNumber(parameters.noise, 1)}:allf=t+u,scale=${Math.max(16, Math.round(width / parameters.blobScaleX))}:${Math.max(10, Math.round(height / parameters.blobScaleY))}:flags=neighbor,scale=${width}:${height}:flags=neighbor,geq=lum='clip(lum(clip(X+if(gt(sin(floor(Y/4)+T*3.9),0),${Math.round(parameters.shear)},-${Math.round(parameters.shear * 0.8)})+${formatNumber(parameters.scatterX, 1)}*sin(Y/3+T*14)+${formatNumber(parameters.scatterX * 0.6, 1)}*sin((X+Y)/17-T*9)+if(gt(sin(floor((Y+X/9)/11)+T*2.2),0),10,-8),0,W-1),clip(Y+if(gt(sin(floor(X/15)+T*2.7),0),5,-5)+${formatNumber(parameters.scatterY, 1)}*sin(X/13-T*9)+${formatNumber(parameters.scatterY * 0.7, 1)}*sin((X-Y)/19+T*7)+if(gt(sin(floor((X+Y/7)/13)+T*1.7),0),4,-3),0,H-1))+34*sin((X+Y)/8)+26*sin(X/5-T*17)+22*sin(Y/6+T*19)+18*sin((X*0.7+Y*1.3)/11+T*13),0,255)',eq=contrast=${formatNumber(parameters.contrast)}:brightness=-0.10,lutyuv=y='clip(val+${offset},0,255)',gblur=sigma=${formatNumber(parameters.blur)}`;
    default:
      throw new Error(`Unhandled recipe "${candidate.recipe}".`);
  }
}

function buildMaskFilter(candidate) {
  switch (candidate.recipe) {
    case 'white-burn':
      return `[0:v][1:v]blend=all_expr='clip((B-A)*4.8+16,0,255)',gblur=sigma=0.22,eq=contrast=1.42:brightness=-0.03,format=gray[v]`;
    case 'glitch-bands':
      return `[0:v][1:v]blend=all_expr='clip((B-A)*6.1+10,0,255)',gblur=sigma=0.12,eq=contrast=1.58:brightness=-0.04,format=gray[v]`;
    case 'block-decay':
      return `[0:v][1:v]blend=all_expr='clip((B-A)*3.1+28,0,255)',gblur=sigma=0.10,eq=contrast=1.52:brightness=-0.03,format=gray[v]`;
    case 'head-switch-smear':
      return `[0:v][1:v]blend=all_expr='clip((B-A)*4.6+18,0,255)',gblur=sigma=0.12,eq=contrast=1.55:brightness=-0.04,format=gray[v]`;
    case 'dropout-foam':
      return `[0:v][1:v]blend=all_expr='clip((B-A)*5.4+12,0,255)',gblur=sigma=0.10,eq=contrast=1.62:brightness=-0.04,format=gray[v]`;
    case 'plasma':
    default:
      return `[0:v][1:v]blend=all_expr='clip((B-A)*5.2+12,0,255)',gblur=sigma=0.18,eq=contrast=1.38:brightness=-0.03,format=gray[v]`;
  }
}

function buildOverlayFilter(candidate) {
  switch (candidate.recipe) {
    case 'white-burn':
      return '[0:v]format=gray,eq=contrast=1.65:brightness=-0.08,scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=neighbor,scale=iw:ih:flags=neighbor,split=2[p0][p1];[1:v]format=gray,gblur=sigma=8[m];[p1][m]blend=all_expr=\'clip((A*0.90)+(B*0.55),0,255)\'[body];[p0][body]blend=all_expr=\'clip((A*0.75)+(B*0.95),0,255)\',eq=contrast=1.10:brightness=0.02,format=yuv420p[v]';
    case 'block-decay':
      return '[0:v]format=gray,scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=neighbor,scale=iw:ih:flags=neighbor,eq=contrast=1.55:brightness=-0.07[p];[1:v]format=gray,split=2[m0][m1];[m1]gblur=sigma=2[msoft];[p][m0]blend=all_expr=\'clip((A*0.95)+(B*0.35),0,255)\'[rough];[rough][msoft]blend=all_expr=\'clip((A*0.78)+(B*0.40),0,255)\',eq=contrast=1.06:brightness=0.01,format=yuv420p[v]';
    case 'head-switch-smear':
      return '[0:v]format=gray,eq=contrast=1.70:brightness=-0.10,split=2[p0][p1];[p1]scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=neighbor,scale=iw:ih:flags=neighbor[macro];[1:v]format=gray,split=2[m0][m1];[m1]gblur=sigma=3[msoft];[macro][m0]blend=all_expr=\'clip((A*0.92)+(B*0.48),0,255)\'[body];[p0][body]blend=all_expr=\'clip((A*0.80)+(B*0.88),0,255)\'[hot];[hot][msoft]blend=all_expr=\'clip((A*0.78)+(B*0.35),0,255)\',eq=contrast=1.08:brightness=0.01,format=yuv420p[v]';
    case 'dropout-foam':
      return '[0:v]format=gray,eq=contrast=1.85:brightness=-0.11,split=2[p0][p1];[p0]scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=neighbor,scale=iw:ih:flags=neighbor[macro];[p1]gblur=sigma=2.5[softp];[1:v]format=gray,split=2[m0][m1];[m1]gblur=sigma=4[msoft];[macro][m0]blend=all_expr=\'clip((A*0.98)+(B*0.38),0,255)\'[body];[softp][body]blend=all_expr=\'clip((A*0.82)+(B*0.86),0,255)\'[rich];[rich][msoft]blend=all_expr=\'clip((A*0.76)+(B*0.30),0,255)\',eq=contrast=1.10:brightness=0.02,format=yuv420p[v]';
    default:
      return '[1:v]format=gray,split=2[base][blurin];[blurin]gblur=sigma=9[glow];[base][glow]blend=all_expr=\'min(255,A+B)\'[hot];[hot]scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=neighbor,scale=iw:ih:flags=neighbor,eq=contrast=1.08:brightness=0.02,format=yuv420p[v]';
  }
}

function getReviewDemoDuration(candidate) {
  switch (candidate.recipe) {
    case 'white-burn':
      return 5;
    case 'block-decay':
      return 3;
    case 'head-switch-smear':
      return 3;
    case 'dropout-foam':
      return 3;
    default:
      return candidate.duration;
  }
}

function buildRampSource(candidate) {
  const { width, height, fps, duration } = candidate;
  const sourcePrefix = `nullsrc=s=${width}x${height}:r=${fps}:d=${formatNumber(duration)},format=gray`;

  if (candidate.recipe === 'white-burn') {
    const preIgniteEnd = duration * 0.38;
    const hitStart = duration * 0.38;
    const hitEnd = duration * 0.56;
    const settleEnd = duration * 0.78;

    return `${sourcePrefix},geq=lum='255*if(lt(T,${formatNumber(preIgniteEnd)}),0.03+0.07*(T/${formatNumber(preIgniteEnd)}),if(lt(T,${formatNumber(hitEnd)}),0.10+0.78*((T-${formatNumber(hitStart)})/${formatNumber(hitEnd - hitStart)}),if(lt(T,${formatNumber(settleEnd)}),0.88+0.10*((T-${formatNumber(hitEnd)})/${formatNumber(settleEnd - hitEnd)}),0.98+0.02*((T-${formatNumber(settleEnd)})/${formatNumber(Math.max(duration - settleEnd, 0.001))}))))'`;
  }

  return `${sourcePrefix},geq=lum='255*clip(T/${formatNumber(duration)},0,1)'`;
}

async function renderCandidate(candidate, directories, config) {
  const baseName = `${candidate.id}__seed-${candidate.seed}`;
  const maskPath = path.join(directories.masks, `${baseName}.mp4`);
  const maskPreviewPath = path.join(directories.maskPreviews, `${baseName}.mp4`);
  const overlayPath = path.join(directories.overlays, `${baseName}.mp4`);
  const demoPath = path.join(directories.demos, `${baseName}.mp4`);
  const demoSegmentPath = getReviewDemoDuration(candidate) > candidate.duration
    ? path.join(directories.demos, `${baseName}.segment.mp4`)
    : demoPath;
  const patternSource = buildPatternSource(candidate);
  const rampSource = buildRampSource(candidate);

  await runCommand('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', patternSource,
    '-f', 'lavfi',
    '-i', rampSource,
    '-filter_complex', buildMaskFilter(candidate),
    '-map', '[v]',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    maskPath
  ]);

  await runCommand('ffmpeg', [
    '-y',
    '-i', maskPath,
    '-filter_complex', '[0:v]format=gray,split=2[base][glowin];[glowin]gblur=sigma=7[glow];[base][glow]blend=all_expr=\'min(255,A+B)\'[hot];[hot]eq=brightness=0.10:contrast=1.9,lutrgb=r=\'clip(val*0.35+12,0,255)\':g=\'clip(val*0.85+18,0,255)\':b=\'clip(val*1.10+28,0,255)\',format=yuv420p[v]',
    '-map', '[v]',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    maskPreviewPath
  ]);

  await runCommand('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', patternSource,
    '-i', maskPath,
    '-filter_complex', buildOverlayFilter(candidate),
    '-map', '[v]',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    overlayPath
  ]);

  const demoFilter = config.demoA && config.demoB
    ? `[0:v]trim=duration=${formatNumber(candidate.duration)},setpts=PTS-STARTPTS,scale=${candidate.width}:${candidate.height},setsar=1,scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=neighbor,scale=iw:ih:flags=neighbor,noise=alls=4:allf=t+u,eq=saturation=0.72:contrast=1.06:brightness=-0.02[a];[1:v]trim=duration=${formatNumber(candidate.duration)},setpts=PTS-STARTPTS,scale=${candidate.width}:${candidate.height},setsar=1,scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=neighbor,scale=iw:ih:flags=neighbor,noise=alls=4:allf=t+u,eq=saturation=0.72:contrast=1.06:brightness=-0.02[b];[2:v]format=gray[m];[a][b][m]maskedmerge[cut];[3:v]scale=${candidate.width}:${candidate.height},setsar=1[ov];[cut][ov]blend=all_expr='min(255,A+B*0.55)'[mix];[mix]noise=alls=4:allf=t+u,eq=saturation=0.82:contrast=1.04:brightness=-0.03[v]`
    : `[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=neighbor,scale=iw:ih:flags=neighbor,noise=alls=4:allf=t+u,eq=saturation=0.72:contrast=1.06:brightness=-0.02[a];[1:v]scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=neighbor,scale=iw:ih:flags=neighbor,noise=alls=4:allf=t+u,eq=saturation=0.72:contrast=1.06:brightness=-0.02[b];[2:v]format=gray[m];[a][b][m]maskedmerge[cut];[3:v]scale=${candidate.width}:${candidate.height},setsar=1[ov];[cut][ov]blend=all_expr='min(255,A+B*0.55)'[mix];[mix]noise=alls=4:allf=t+u,eq=saturation=0.82:contrast=1.04:brightness=-0.03[v]`;

  const demoArgs = config.demoA && config.demoB
    ? [
      '-y',
      '-i', config.demoA,
      '-i', config.demoB,
      '-i', maskPath,
      '-i', overlayPath,
      '-filter_complex', demoFilter,
      '-map', '[v]',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      demoSegmentPath
    ]
    : [
      '-y',
      '-f', 'lavfi',
      '-i', `testsrc2=s=${candidate.width}x${candidate.height}:r=${candidate.fps}:d=${formatNumber(candidate.duration)}`,
      '-f', 'lavfi',
      '-i', `rgbtestsrc=s=${candidate.width}x${candidate.height}:r=${candidate.fps}:d=${formatNumber(candidate.duration)}`,
      '-i', maskPath,
      '-i', overlayPath,
      '-filter_complex', demoFilter,
      '-map', '[v]',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      demoSegmentPath
    ];

  await runCommand('ffmpeg', demoArgs);

  const reviewDemoDuration = getReviewDemoDuration(candidate);
  if (reviewDemoDuration > candidate.duration) {
    await runCommand('ffmpeg', [
      '-y',
      '-stream_loop', '-1',
      '-i', demoSegmentPath,
      '-t', formatNumber(reviewDemoDuration),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      demoPath
    ]);

    await fs.rm(demoSegmentPath, { force: true });
  }

  return {
    ...candidate,
    paths: {
      mask: path.relative(directories.runDir, maskPath),
      maskPreview: path.relative(directories.runDir, maskPreviewPath),
      overlay: path.relative(directories.runDir, overlayPath),
      demo: path.relative(directories.runDir, demoPath)
    }
  };
}

async function generateManifest(config) {
  const runDir = config.outDir;
  const directories = {
    runDir,
    masks: path.join(runDir, 'masks'),
    maskPreviews: path.join(runDir, 'mask-previews'),
    overlays: path.join(runDir, 'overlays'),
    demos: path.join(runDir, 'demos'),
    reviews: path.join(runDir, 'reviews')
  };

  await fs.mkdir(directories.masks, { recursive: true });
  await fs.mkdir(directories.maskPreviews, { recursive: true });
  await fs.mkdir(directories.overlays, { recursive: true });
  await fs.mkdir(directories.demos, { recursive: true });
  await fs.mkdir(directories.reviews, { recursive: true });

  const random = mulberry32(config.seed);
  const candidates = [];

  for (let index = 0; index < config.count; index += 1) {
    const recipe = pick(random, config.recipes);
    const candidate = sampleCandidate(recipe, random, config, index);
    console.log(`generate ${index + 1}/${config.count} ${candidate.id}`);
    candidates.push(await renderCandidate(candidate, directories, config));
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    generator: 'transition-foundry',
    config: {
      count: config.count,
      width: config.width,
      height: config.height,
      fps: config.fps,
      duration: config.duration,
      recipes: config.recipes,
      seed: config.seed,
      demoA: config.demoA,
      demoB: config.demoB
    },
    runDir,
    candidates
  };

  const manifestPath = path.join(runDir, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifestPath;
}

function escapeMoviePath(filePath) {
  return filePath.replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "\\'");
}

async function probeSignalStats(filePath, filterChain) {
  const lavfi = `movie='${escapeMoviePath(filePath)}',${filterChain}`;
  const { stdout } = await runCommand('ffprobe', [
    '-v', 'error',
    '-f', 'lavfi',
    '-i', lavfi,
    '-show_frames',
    '-show_entries', 'frame=pts_time:frame_tags=lavfi.signalstats.YAVG,lavfi.signalstats.YDIF',
    '-of', 'json'
  ]);

  const parsed = JSON.parse(stdout);
  const frames = Array.isArray(parsed.frames) ? parsed.frames : [];

  return frames.map((frame, index) => ({
    index,
    ptsTime: Number(frame.pts_time ?? index),
    yavg: Number(frame.tags?.['lavfi.signalstats.YAVG'] ?? 0),
    ydif: Number(frame.tags?.['lavfi.signalstats.YDIF'] ?? 0)
  }));
}

async function extractFrameHash(filePath, timeSeconds) {
  const { stdoutBuffer } = await runCommand('ffmpeg', [
    '-v', 'error',
    '-ss', formatNumber(timeSeconds),
    '-i', filePath,
    '-vf', 'scale=16:16,format=gray',
    '-frames:v', '1',
    '-f', 'rawvideo',
    '-'
  ], { binaryOutput: true });

  if (stdoutBuffer.length === 0) {
    return '0'.repeat(256);
  }

  let sum = 0;
  for (const value of stdoutBuffer.values()) {
    sum += value;
  }

  const mean = sum / stdoutBuffer.length;
  return [...stdoutBuffer.values()].map((value) => (value >= mean ? '1' : '0')).join('');
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeRampFit(lumaFrames) {
  if (lumaFrames.length === 0) {
    return 0;
  }

  const errors = lumaFrames.map((frame, index) => {
    const actual = clamp(frame.yavg / 255, 0, 1);
    const target = smoothstep(index / Math.max(lumaFrames.length - 1, 1));
    return Math.abs(actual - target);
  });

  return clamp(1 - average(errors), 0, 1);
}

function computeOccupancy(lumaFrames, thresholdFrames) {
  if (lumaFrames.length === 0 || thresholdFrames.length === 0) {
    return 0;
  }

  const startCoverage = clamp((thresholdFrames[0]?.yavg ?? 0) / 255, 0, 1);
  const endCoverage = clamp((thresholdFrames.at(-1)?.yavg ?? 0) / 255, 0, 1);
  const meanCoverage = average(thresholdFrames.map((frame) => clamp(frame.yavg / 255, 0, 1)));
  const startPenalty = clamp(startCoverage / 0.18, 0, 1);
  const endPenalty = clamp((1 - endCoverage) / 0.08, 0, 1);
  const meanPenalty = Math.abs(meanCoverage - 0.45) / 0.45;

  return clamp(1 - ((startPenalty * 0.35) + (endPenalty * 0.45) + (meanPenalty * 0.20)), 0, 1);
}

function computeStructure(structureFrames) {
  if (structureFrames.length === 0) {
    return 0;
  }

  const value = average(structureFrames.map((frame) => clamp(frame.yavg / 255, 0, 1)));
  return clamp(value / 0.25, 0, 1);
}

function computeTemporalMotion(lumaFrames) {
  if (lumaFrames.length === 0) {
    return 0;
  }

  const meanDifference = average(lumaFrames.map((frame) => clamp(frame.ydif / 255, 0, 1)));
  const target = 0.12;
  const distance = Math.abs(meanDifference - target) / target;
  return clamp(1 - distance, 0, 1);
}

function hammingDistance(left, right) {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);

  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) {
      distance += 1;
    }
  }

  return distance;
}

function scoreCandidates(candidatesWithMetrics) {
  const baseSorted = [...candidatesWithMetrics].sort((left, right) => right.metrics.baseScore - left.metrics.baseScore);
  const ranked = [];

  for (const candidate of baseSorted) {
    const novelty = ranked.length === 0
      ? 1
      : clamp(
        Math.min(...ranked.map((existing) => hammingDistance(candidate.metrics.frameHash, existing.metrics.frameHash))) / 256,
        0,
        1
      );

    const finalScore = (
      (candidate.metrics.rampFit * 0.35) +
      (candidate.metrics.occupancy * 0.20) +
      (candidate.metrics.structure * 0.20) +
      (candidate.metrics.temporalMotion * 0.15) +
      (novelty * 0.10)
    );

    ranked.push({
      ...candidate,
      metrics: {
        ...candidate.metrics,
        novelty,
        finalScore
      }
    });
    ranked.sort((left, right) => right.metrics.finalScore - left.metrics.finalScore);
  }

  return ranked;
}

async function analyzeManifest(config) {
  const manifestPath = config.manifestPath;
  if (!manifestPath) {
    throw new Error('analyze requires --manifest <path>.');
  }

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const runDir = manifest.runDir ?? path.dirname(manifestPath);
  const analyzed = [];

  for (const [index, candidate] of manifest.candidates.entries()) {
    const maskPath = path.join(runDir, candidate.paths.mask);
    console.log(`analyze ${index + 1}/${manifest.candidates.length} ${candidate.id}`);

    const lumaFrames = await probeSignalStats(maskPath, 'signalstats');
    const thresholdFrames = await probeSignalStats(maskPath, 'format=gray,lutyuv=y=\'if(gt(val,180),255,0)\',signalstats');
    const structureFrames = await probeSignalStats(maskPath, 'scale=64:36,edgedetect,signalstats');
    const frameHash = await extractFrameHash(maskPath, candidate.duration / 2);

    const rampFit = computeRampFit(lumaFrames);
    const occupancy = computeOccupancy(lumaFrames, thresholdFrames);
    const structure = computeStructure(structureFrames);
    const temporalMotion = computeTemporalMotion(lumaFrames);
    const baseScore = (
      (rampFit * 0.40) +
      (occupancy * 0.25) +
      (structure * 0.20) +
      (temporalMotion * 0.15)
    );

    analyzed.push({
      ...candidate,
      metrics: {
        rampFit,
        occupancy,
        structure,
        temporalMotion,
        baseScore,
        frameHash,
        frameCount: lumaFrames.length,
        startLuma: clamp((lumaFrames[0]?.yavg ?? 0) / 255, 0, 1),
        endLuma: clamp((lumaFrames.at(-1)?.yavg ?? 0) / 255, 0, 1)
      }
    });
  }

  const ranked = scoreCandidates(analyzed);
  const analysis = {
    analyzedAt: new Date().toISOString(),
    manifestPath,
    runDir,
    candidates: ranked
  };

  const analysisPath = path.join(runDir, 'analysis.json');
  await fs.writeFile(analysisPath, `${JSON.stringify(analysis, null, 2)}\n`, 'utf8');

  const csvLines = [
    'rank,id,recipe,final_score,ramp_fit,occupancy,structure,temporal_motion,novelty,start_luma,end_luma,mask,mask_preview,demo'
  ];

  ranked.forEach((candidate, index) => {
    csvLines.push([
      index + 1,
      candidate.id,
      candidate.recipe,
      formatNumber(candidate.metrics.finalScore, 4),
      formatNumber(candidate.metrics.rampFit, 4),
      formatNumber(candidate.metrics.occupancy, 4),
      formatNumber(candidate.metrics.structure, 4),
      formatNumber(candidate.metrics.temporalMotion, 4),
      formatNumber(candidate.metrics.novelty, 4),
      formatNumber(candidate.metrics.startLuma, 4),
      formatNumber(candidate.metrics.endLuma, 4),
      candidate.paths.mask,
      candidate.paths.maskPreview,
      candidate.paths.demo
    ].join(','));
  });

  await fs.writeFile(path.join(runDir, 'ranked.csv'), `${csvLines.join('\n')}\n`, 'utf8');
  return analysisPath;
}

async function extractContactFrames(analysis, topK, frameDirectory) {
  await fs.mkdir(frameDirectory, { recursive: true });
  const selected = analysis.candidates.slice(0, topK);

  for (const [index, candidate] of selected.entries()) {
    const sourcePath = path.join(analysis.runDir, candidate.paths.maskPreview ?? candidate.paths.mask);
    const framePath = path.join(frameDirectory, `${String(index + 1).padStart(3, '0')}.png`);
    await runCommand('ffmpeg', [
      '-y',
      '-ss', formatNumber(candidate.duration / 2),
      '-i', sourcePath,
      '-vf', 'format=gray',
      '-frames:v', '1',
      framePath
    ]);
  }
}

async function buildReviewArtifacts(config) {
  const manifestPath = config.manifestPath;
  if (!manifestPath) {
    throw new Error('review requires --manifest <path>.');
  }

  const runDir = path.dirname(manifestPath);
  const analysisPath = path.join(runDir, 'analysis.json');
  if (!existsSync(analysisPath)) {
    throw new Error(`Missing analysis file at ${analysisPath}. Run analyze first.`);
  }

  const analysis = JSON.parse(await fs.readFile(analysisPath, 'utf8'));
  const reviewDir = path.join(analysis.runDir, 'reviews');
  const frameDirectory = path.join(reviewDir, 'contact-frames');
  const topK = Math.min(config.topK, analysis.candidates.length);
  const selected = analysis.candidates.slice(0, topK);

  await extractContactFrames(analysis, topK, frameDirectory);

  const columns = Math.ceil(Math.sqrt(topK));
  const rows = Math.ceil(topK / columns);
  await runCommand('ffmpeg', [
    '-y',
    '-framerate', '1',
    '-i', path.join(frameDirectory, '%03d.png'),
    '-frames:v', '1',
    '-filter_complex', `tile=${columns}x${rows}:padding=8:margin=8:color=white`,
    path.join(reviewDir, 'contact-sheet.png')
  ]);

  const concatListPath = path.join(reviewDir, 'top-demos.txt');
  const concatList = selected
    .map((candidate) => `file '${path.join(analysis.runDir, candidate.paths.demo).replaceAll("'", "'\\''")}'`)
    .join('\n');
  await fs.writeFile(concatListPath, `${concatList}\n`, 'utf8');

  await runCommand('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',
    path.join(reviewDir, 'top-demos.mp4')
  ]);

  const summary = {
    reviewedAt: new Date().toISOString(),
    topK,
    winners: selected.map((candidate, index) => ({
      rank: index + 1,
      id: candidate.id,
      recipe: candidate.recipe,
      finalScore: candidate.metrics.finalScore,
      mask: candidate.paths.mask,
      maskPreview: candidate.paths.maskPreview,
      overlay: candidate.paths.overlay,
      demo: candidate.paths.demo
    }))
  };

  await fs.writeFile(path.join(reviewDir, 'winners.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return reviewDir;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const config = buildConfig(options);

  await ensureTools();

  switch (command) {
    case 'run': {
      const manifestPath = await generateManifest(config);
      const nestedConfig = { ...config, manifestPath };
      await analyzeManifest(nestedConfig);
      await buildReviewArtifacts(nestedConfig);
      console.log(manifestPath);
      break;
    }
    case 'generate': {
      const manifestPath = await generateManifest(config);
      console.log(manifestPath);
      break;
    }
    case 'analyze': {
      await analyzeManifest(config);
      console.log(path.join(path.dirname(config.manifestPath), 'analysis.json'));
      break;
    }
    case 'review': {
      const reviewDir = await buildReviewArtifacts(config);
      console.log(reviewDir);
      break;
    }
    default:
      printUsage();
      throw new Error(`Unknown command "${command}".`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
