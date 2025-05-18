require('dotenv').config();

const fs = require('fs');
const path = require('path');
const Proxy = require('http-mitm-proxy');
const axios = require('axios');

const {
  OPENAI_API_MODEL = 'gpt-4.1-mini-2025-04-14',
  OPENAI_API_URL = 'https://api.proxyapi.ru/openai/v1/chat/completions',
  OPENAI_API_KEY,
  OPENAI_SYSTEM_PROMPT = 'You are Grammar Fix Machine, an assistant who corrects spelling and punctuation errors in the text. Your task is only to correct the received text and provide the corrected version. Never write anything on your own, only process the text.',
  PROXY_PORT = '8000',
} = process.env;

if (!OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY is not set.');
  process.exit(1);
}

const certDir = path.join(__dirname, 'certs');
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir);
}

const proxy = Proxy();

proxy.onError((ctx, err, errorKind) => {
  const url = ctx?.clientToProxyRequest?.url || '';
  console.error(`${errorKind} on ${url}:`, err);
});

const axiosInstance = axios.create({
  baseURL: OPENAI_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENAI_API_KEY}`
  },
  timeout: 10000
});

async function correctText(text) {
  const response = await axiosInstance.post('', {
    model: OPENAI_API_MODEL,
    messages: [
      { role: 'system', content: OPENAI_SYSTEM_PROMPT },
      { role: 'user', content: text }
    ],
    temperature: 0
  });
  return response.data.choices[0].message.content.trim();
}

function splitRawBodyAndRest(raw) {
  const idx = raw.indexOf('\r\n');
  return idx >= 0
    ? [raw.slice(0, idx), raw.slice(idx)]
    : [raw, ''];
}

function writeAndContinue(ctx, body, cb) {
  const buffer = Buffer.from(body);
  ctx.proxyToServerRequest.setHeader('content-length', buffer.length);
  ctx.proxyToServerRequest.write(buffer);
  cb();
}

async function handleChatPostMessage(ctx, chunks, cb) {
  const body = Buffer.concat(chunks).toString();

  const boundaryMatch = body.match(/^(--[^\r\n]+)/);
  if (!boundaryMatch) {
    console.log('[NOT_PROCESSED] Unable to find boundary, skipping processing');
    return writeAndContinue(ctx, body, cb);
  }

  const boundary = boundaryMatch[1];
  const parts = body.split(boundary).slice(1);
  const idx = parts.findIndex(p => /name="blocks"/.test(p));
  if (idx === -1) {
    console.log('[NOT_PROCESSED] "blocks" field not found, skipping processing');
    return writeAndContinue(ctx, body, cb);
  }

  const [rawHeaders, rawRest] = parts[idx].split(/\r?\n\r?\n/);
  const [rawJson, rest] = splitRawBodyAndRest(rawRest);

  let blocks;
  try {
    blocks = JSON.parse(rawJson);
  } catch (e) {
    console.log(`[NOT_PROCESSED] Failed to parse blocks JSON: ${e.message}`);
    return writeAndContinue(ctx, body, cb);
  }

  for (const block of blocks) {
    if (!Array.isArray(block.elements)) continue;
    for (const section of block.elements) {
      if (!Array.isArray(section.elements)) continue;
      for (const el of section.elements) {
        if (el.type === 'text' && typeof el.text === 'string') {
          const original = el.text;
          try {
            const corrected = await correctText(original);
            el.text = corrected;
            console.log(`[ORIGINAL] ${original}`);
            console.log(`[CORRECTED] ${corrected}`);
          } catch (err) {
            console.log(`[NOT_PROCESSED] "${original}" Reason: ${err.message || err}`);
          }
        } else {
          console.log(`[NOT_PROCESSED] element skipped, type: ${el.type}, not a text element`);
        }
      }
    }
  }

  const newJson = JSON.stringify(blocks);
  parts[idx] = `${rawHeaders}\r\n\r\n${newJson}${rest}`;
  const modified = parts.map(p => boundary + p).join('');
  writeAndContinue(ctx, modified, cb);
}

proxy.onRequest((ctx, callback) => {
  const chunks = [];
  ctx.onRequestData((ctx, chunk, cb) => {
    chunks.push(chunk);
    cb(null);
  });
  ctx.onRequestEnd((ctx, cb) => {
    if (
      ctx.clientToProxyRequest.method === 'POST' &&
      /^\/api\/chat\.postMessage(\?.*)?$/.test(ctx.clientToProxyRequest.url)
    ) {
      handleChatPostMessage(ctx, chunks, cb);
    } else {
      writeAndContinue(ctx, Buffer.concat(chunks).toString(), cb);
    }
  });
  callback();
});

proxy.onResponse((ctx, callback) => {
  ctx.onResponseData((ctx, chunk, cb) => cb(null, chunk));
  callback();
});

proxy.listen({ port: Number(PROXY_PORT), sslCaDir: certDir }, () => {
  console.log(`Proxy is running on the port: ${PROXY_PORT}`);
});