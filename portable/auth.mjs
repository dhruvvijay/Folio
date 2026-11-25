import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const maxCredentialBytes = 4096;
const maxAuthorizationLength = 4 * Math.ceil(maxCredentialBytes / 3) + 16;
const controlCharacter = /[\u0000-\u001f\u007f-\u009f]/u;
const emptyCredential = Buffer.alloc(0);

function validateTransport(origin) {
  const url = URL.parse(String(origin));
  if (url?.protocol === 'https:' || (url?.protocol === 'http:' && loopbackHosts.has(url.hostname))) return;
  throw new Error('FOLIO_ORIGIN must use HTTPS unless its hostname is localhost or a loopback address.');
}

function configuredCredential(env) {
  const username = env.FOLIO_USERNAME ?? 'folio';
  const password = env.FOLIO_PASSWORD;
  if (typeof username !== 'string' || !username.trim() || username.includes(':') || controlCharacter.test(username)) {
    throw new Error('FOLIO_USERNAME must be a nonempty username without a colon or control characters.');
  }
  if (typeof password !== 'string' || Array.from(password).length < 20 || !password.trim() ||
      password === username || controlCharacter.test(password)) {
    throw new Error('FOLIO_PASSWORD must be a distinct password of at least 20 characters without control characters.');
  }
  const credential = Buffer.from(username + ':' + password, 'utf8');
  if (credential.length > maxCredentialBytes) {
    credential.fill(0);
    throw new Error('Folio credentials are too long for an HTTP Authorization header.');
  }
  return credential;
}

function readCredential(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || header.length > maxAuthorizationLength ||
      req.headersDistinct?.authorization?.length > 1) return null;
  const match = /^Basic[ \t]+([A-Za-z0-9+/]+={0,2})$/i.exec(header);
  if (!match) return null;
  const token = match[1];
  const credential = Buffer.from(token, 'base64');
  const canonical = credential.toString('base64');
  if (credential.length > maxCredentialBytes ||
      (canonical !== token && canonical.replace(/=+$/, '') !== token)) {
    credential.fill(0);
    return null;
  }
  return credential;
}

export function createAuth({ env = process.env, origin = 'http://localhost:8080' } = {}) {
  validateTransport(origin);
  const key = randomBytes(32);
  const digest = value => createHmac('sha256', key).update(value).digest();
  const material = configuredCredential(env);
  const expected = digest(material);
  material.fill(0);

  function authenticate(req, res) {
    const credential = readCredential(req);
    const provided = digest(credential ?? emptyCredential);
    credential?.fill(0);
    const valid = timingSafeEqual(provided, expected);
    if (valid && credential) return true;

    res.writeHead(401, {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="Folio Finance", charset="UTF-8"',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : 'Authentication required.\n');
    return false;
  }

  return { authenticate };
}
