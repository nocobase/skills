#!/usr/bin/env node

const http = require('http');
const https = require('https');
const { URL } = require('url');

function getArg(name, fallback = '') {
  const key = `--${name}`;
  const idx = process.argv.indexOf(key);
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return fallback;
}

function requestRaw(urlString, payloadJson, headers) {
  return new Promise((resolve) => {
    let urlObj;
    try {
      urlObj = new URL(urlString);
    } catch (err) {
      resolve({ statusCode: null, headers: {}, body: '', error: `invalid URL: ${err.message}` });
      return;
    }

    const isHttps = urlObj.protocol === 'https:';
    const mod = isHttps ? https : http;
    const payload = Buffer.from(payloadJson, 'utf8');

    const req = mod.request(
      {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        method: 'POST',
        path: `${urlObj.pathname}${urlObj.search}`,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'Content-Length': payload.length,
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || null,
            headers: res.headers || {},
            body: Buffer.concat(chunks).toString('utf8'),
            error: '',
          });
        });
      },
    );

    req.on('error', (err) => {
      resolve({ statusCode: null, headers: {}, body: '', error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

function parseSseJson(body) {
  const trimmed = (body || '').trim();
  const lines = trimmed.split(/\r?\n/);
  const dataLines = lines
    .filter((line) => /^\s*data:\s*/.test(line))
    .map((line) => line.replace(/^\s*data:\s*/, '').trim())
    .filter((line) => line && line !== '[DONE]');

  let parsed = null;
  let parseErr = '';
  if (dataLines.length) {
    const last = dataLines[dataLines.length - 1];
    try {
      parsed = JSON.parse(last);
    } catch (err) {
      parseErr = err.message;
    }
  }

  return {
    lineCount: lines.length,
    dataLineCount: dataLines.length,
    parsed,
    parseErr,
  };
}

async function main() {
  const mcpUrl = getArg('mcp-url', 'http://127.0.0.1:13000/api/mcp');
  const tokenEnv = getArg('token-env', 'NOCOBASE_API_TOKEN');
  const token = getArg('bearer-token', process.env[tokenEnv] || '');

  if (!token) {
    process.stderr.write(`missing token: set ${tokenEnv} or pass --bearer-token\n`);
    process.exit(1);
    return;
  }

  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: 1000,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'debug-mcp-node', version: '1.0.0' },
    },
  });

  const resp = await requestRaw(mcpUrl, payload, {
    Authorization: `Bearer ${token}`,
  });

  process.stdout.write(`status: ${resp.statusCode}\n`);
  process.stdout.write(`response length: ${resp.body.length}\n`);
  process.stdout.write(`starts with '{': ${String(resp.body.trim().startsWith('{'))}\n`);

  const parsed = parseSseJson(resp.body);
  process.stdout.write(`lines: ${parsed.lineCount}\n`);
  process.stdout.write(`data lines: ${parsed.dataLineCount}\n`);

  if (parsed.parsed) {
    process.stdout.write(`json parsed OK: ${Object.keys(parsed.parsed).join(', ')}\n`);
  } else if (parsed.parseErr) {
    process.stdout.write(`json parse failed: ${parsed.parseErr}\n`);
  } else {
    process.stdout.write('no data lines found\n');
  }
}

main().catch((err) => {
  process.stderr.write(`fatal error: ${err.stack || err.message}\n`);
  process.exit(1);
});

