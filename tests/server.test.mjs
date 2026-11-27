import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { startServer } from '../portable/server.mjs';
import { getDatabase } from '../portable/database.mjs';

const origin = 'http://localhost:8080';
const password = 'correct horse battery staple 2026';
const nextPassword = 'new horse battery staple 2026';
const blank = { transactions: [], budgets: [], goals: [], recurring: [], currency: 'INR', openingBalance: 0, demo: false };

async function setup(t, { envOverride = {}, serverOptions = {} } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'folio-http-test-'));
  const env = { FOLIO_ORIGIN: origin, PORT: '0', FOLIO_SQLITE_PATH: path.join(dir, 'db.sqlite'), ...envOverride };
  let running = await startServer(env, serverOptions);
  const inspect = await getDatabase({ FOLIO_SQLITE_PATH: env.FOLIO_SQLITE_PATH });
  t.after(async () => { await running.close(); await inspect.close(); await rm(dir, { recursive: true, force: true }); });
  let address = `http://127.0.0.1:${running.server.address().port}`;
  async function call(route, { method = 'GET', body, cookie, headers = {}, source = origin } = {}) {
    const options = {
      method, headers: { Host: 'localhost:8080', ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(JSON.stringify(body)) }),
        ...(source === null ? {} : { Origin: source }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    };
    return new Promise((resolve, reject) => {
      const req = httpRequest(address + route, options, response => {
        const chunks = [];
        response.on('data', value => chunks.push(value));
        response.on('error', reject);
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const responseHeaders = new Headers();
          for (let i = 0; i < response.rawHeaders.length; i += 2) responseHeaders.append(response.rawHeaders[i], response.rawHeaders[i + 1]);
          resolve({ status: response.statusCode, headers: responseHeaders,
            data: responseHeaders.get('content-type')?.includes('application/json') ? JSON.parse(text) : text,
            cookie: responseHeaders.getSetCookie()[0]?.split(';')[0] });
        });
      });
      req.on('error', reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  async function signup(email, name = 'Customer') {
    const result = await call('/api/auth/signup', { method: 'POST', body: { email, name, password } });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result;
  }
  async function restart() {
    await running.close();
    running = await startServer(env, serverOptions);
    address = `http://127.0.0.1:${running.server.address().port}`;
  }
  return { call, signup, inspect, env, restart };
}

test('HTTP boundary exposes login and health but denies unauthenticated ledger and spoofed owner', async t => {
  const { call } = await setup(t);
  assert.equal((await call('/healthz')).status, 200);
  assert.equal((await call('/login')).status, 200);
  assert.equal((await call('/')).status, 200);
  assert.equal((await call('/api/auth/session')).data.user, null);
  const ledger = await call('/api/ledger', { headers: { 'oai-authenticated-user-id': 'folio-portable-owner', 'x-folio-client-key': 'victim' } });
  assert.equal(ledger.status, 401);
  assert.match(ledger.headers.get('cache-control'), /no-store/);
  assert.equal((await call('/api/ledger', { headers: { Host: 'evil.test' } })).status, 421);
});

test('two customer ledgers stay isolated; guessed workspace and revision conflicts cannot overwrite data', async t => {
  const { call, signup } = await setup(t);
  const alice = await signup('alice@example.test', 'Alice');
  const bob = await signup('bob@example.test', 'Bob');
  assert.match(alice.headers.getSetCookie()[0], /HttpOnly/);
  assert.match(alice.headers.getSetCookie()[0], /SameSite=Lax/);
  const a = (await call('/api/ledger', { cookie: alice.cookie })).data;
  const b = (await call('/api/ledger', { cookie: bob.cookie })).data;
  assert.notEqual(a.workspace, b.workspace);
  assert.equal(a.state, null); assert.equal(b.state, null);
  const state = { ...blank, transactions: [{ id: 'private-a', date: '2026-11-26', description: 'Alice private record', amount: -21.5, category: 'Food & Dining' }] };
  const save = await call('/api/ledger', { method: 'PUT', cookie: alice.cookie, body: { workspace: a.workspace, expectedRevision: 0, state } });
  assert.equal(save.status, 200, JSON.stringify(save.data));
  const attack = await call('/api/ledger', { method: 'PUT', cookie: bob.cookie, headers: { 'oai-authenticated-user-id': alice.data.user.id }, body: { workspace: a.workspace, expectedRevision: 1, state: blank } });
  assert.equal(attack.status, 403);
  const bRead = await call(`/api/ledger?workspace=${a.workspace}`, { cookie: bob.cookie, headers: { 'oai-authenticated-user-id': alice.data.user.id } });
  assert.equal(bRead.data.workspace, b.workspace); assert.equal(bRead.data.state, null);
  const conflict = await call('/api/ledger', { method: 'PUT', cookie: alice.cookie, body: { workspace: a.workspace, expectedRevision: 0, state: blank } });
  assert.equal(conflict.status, 409); assert.deepEqual(conflict.data.state, state);
  assert.deepEqual((await call('/api/ledger', { cookie: alice.cookie })).data.state, state);
});

test('cross-origin mutations, missing origin, invalid auth input, and oversized bodies are rejected', async t => {
  const { call, signup } = await setup(t);
  const body = { email: 'csrf@example.test', name: 'CSRF', password };
  for (const source of ['https://evil.test', null]) {
    assert.equal((await call('/api/auth/signup', { method: 'POST', body, source })).status, 403);
  }
  assert.equal((await call('/api/auth/signup', { method: 'POST', body, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await call('/api/auth/signup', { method: 'POST', body: { ...body, password: 'short' } })).status, 400);
  assert.equal((await call('/api/auth/signup', { method: 'POST', body: { ...body, name: 'x'.repeat(20_000) } })).status, 413);
  const user = await signup('csrfvalid@example.test');
  const ledger = (await call('/api/ledger', { cookie: user.cookie })).data;
  assert.equal((await call('/api/ledger', { method: 'PUT', cookie: user.cookie, source: 'https://evil.test', body: { workspace: ledger.workspace, expectedRevision: 0, state: blank } })).status, 403);
});

test('password rotation and recovery revoke previous sessions and invalidate previous recovery codes', async t => {
  const { call, signup, inspect } = await setup(t);
  const account = await signup('recover@example.test');
  const login = await call('/api/auth/login', { method: 'POST', body: { email: 'RECOVER@example.test', password } });
  assert.equal(login.status, 200);
  const profile = await call('/api/auth/profile', { method: 'PATCH', cookie: account.cookie, body: { name: 'New name' } });
  assert.equal(profile.data.user.name, 'New name');
  const changed = await call('/api/auth/password', { method: 'POST', cookie: account.cookie, body: { currentPassword: password, newPassword: nextPassword } });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.ok(changed.data.recoveryCode);
  for (const cookie of [account.cookie, login.cookie]) assert.equal((await call('/api/ledger', { cookie })).status, 401);
  assert.equal((await call('/api/ledger', { cookie: changed.cookie })).status, 200);
  assert.equal((await call('/api/auth/recovery', { method: 'POST', body: { email: 'recover@example.test', recoveryCode: account.data.recoveryCode, newPassword: password } })).status, 401);
  const recovered = await call('/api/auth/recovery', { method: 'POST', body: { email: 'recover@example.test', recoveryCode: changed.data.recoveryCode, newPassword: password } });
  assert.equal(recovered.status, 200, JSON.stringify(recovered.data));
  assert.notEqual(recovered.data.recoveryCode, changed.data.recoveryCode);
  assert.equal((await call('/api/ledger', { cookie: changed.cookie })).status, 401);
  const rows = (await inspect.query('SELECT password_hash, recovery_hash FROM folio_users')).rows;
  assert.notEqual(rows[0].password_hash, password); assert.notEqual(rows[0].recovery_hash, recovered.data.recoveryCode);
  const again = await call('/api/auth/login', { method: 'POST', body: { email: 'recover@example.test', password } });
  assert.equal(again.status, 200);
  const token = again.cookie.split('=')[1];
  assert.equal((await inspect.query('SELECT token_hash FROM folio_sessions')).rows[0].token_hash, createHash('sha256').update(token).digest('hex'));
});

test('logout-all and deletion revoke access; deletion removes only the authenticated customer', async t => {
  const { call, signup, inspect } = await setup(t);
  const alice = await signup('delete@example.test'); const bob = await signup('retain@example.test');
  const a = (await call('/api/ledger', { cookie: alice.cookie })).data;
  await call('/api/ledger', { method: 'PUT', cookie: alice.cookie, body: { workspace: a.workspace, expectedRevision: 0, state: blank } });
  assert.equal((await call('/api/auth/account', { method: 'DELETE', cookie: alice.cookie, body: { password: 'wrong password value' } })).status, 401);
  const deleted = await call('/api/auth/account', { method: 'DELETE', cookie: alice.cookie, body: { password, userId: bob.data.user.id } });
  assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
  assert.equal((await call('/api/ledger', { cookie: alice.cookie })).status, 401);
  assert.equal((await inspect.query('SELECT workspace FROM folio_ledgers WHERE workspace = ?', [a.workspace])).rows.length, 0);
  assert.equal((await inspect.query('SELECT id FROM folio_users WHERE id = ?', [alice.data.user.id])).rows.length, 0);
  assert.equal((await call('/api/ledger', { cookie: bob.cookie })).status, 200);
  assert.equal((await call('/api/auth/logout-all', { method: 'POST', cookie: bob.cookie, body: {} })).status, 200);
  assert.equal((await call('/api/ledger', { cookie: bob.cookie })).status, 401);
});

test('server-side session expiry denies both ledger access and authenticated session lookup', async t => {
  const { call, signup, inspect } = await setup(t);
  const user = await signup('expire@example.test');
  await inspect.query('UPDATE folio_sessions SET expires_at = ? WHERE user_id = ?', [Date.now() - 1, user.data.user.id]);
  assert.equal((await call('/api/ledger', { cookie: user.cookie })).status, 401);
  assert.equal((await call('/api/auth/session', { cookie: user.cookie })).data.user, null);
});

test('customer sessions and ledgers persist after a server restart', async t => {
  const { call, signup, restart } = await setup(t);
  const user = await signup('restart@example.test');
  const ledger = (await call('/api/ledger', { cookie: user.cookie })).data;
  const state = { ...blank, openingBalance: 2500 };
  assert.equal((await call('/api/ledger', { method: 'PUT', cookie: user.cookie, body: { workspace: ledger.workspace, expectedRevision: 0, state } })).status, 200);
  await restart();
  assert.equal((await call('/api/auth/session', { cookie: user.cookie })).data.user.id, user.data.user.id);
  const restored = await call('/api/ledger', { cookie: user.cookie });
  assert.equal(restored.status, 200); assert.deepEqual(restored.data.state, state); assert.equal(restored.data.revision, 1);
});

test('client IP headers are trusted only behind the declared Render ingress', async t => {
  for (const render of [undefined, 'true']) {
    await t.test(render ? 'Render ingress' : 'ordinary host', async st => {
      const { call } = await setup(st, { envOverride: { RENDER: render }, serverOptions: {
        databaseFactory: cfg => getDatabase({ FOLIO_SQLITE_PATH: cfg.FOLIO_SQLITE_PATH }),
        authFactory: () => ({ handle: req => Response.json({ client: req.headers.get('x-folio-client-key') }), authenticate: () => null }),
      } });
      const headers = { 'CF-Connecting-IP': '198.51.100.42', 'X-Forwarded-For': '198.51.100.43', 'x-folio-client-key': 'forged' };
      const response = await call('/api/auth/session', { headers });
      if (render) assert.equal(response.data.client, '198.51.100.42');
      else assert.notEqual(response.data.client, '198.51.100.42');
      assert.notEqual(response.data.client, 'forged');
      const invalid = await call('/api/auth/session', { headers: { ...headers, 'CF-Connecting-IP': 'not-an-ip' } });
      assert.notEqual(invalid.data.client, 'not-an-ip');
    });
  }
});

test('routine host health probes do not keep a serverless database awake', async t => {
  const { call } = await setup(t, { serverOptions: {
    databaseFactory: async cfg => {
      const db = await getDatabase(cfg);
      return { ...db, check: () => { throw new Error('A health probe must not issue a database query'); } };
    },
  } });
  for (let attempt = 0; attempt < 3; attempt++) assert.equal((await call('/healthz')).status, 200);
});

test('trip manager splits a bill, invites a friend and records a repayment without exposing private ledgers', async t => {
  const { call, signup } = await setup(t);
  const manager=await signup('manager@example.test','Manager');
  const friend=await signup('traveler@example.test','Traveler');
  const outsider=await signup('outsider@example.test','Outsider');
  const req=(actor,path,body)=>call('/api/trips'+path,{cookie:actor.cookie,headers:{'X-Folio-Account':actor.data.user.id},method:body?'POST':'GET',body});
  assert.equal((await call('/api/trips')).status,401);
  const created=await req(manager,'',{name:'Goa',currency:'INR',budget:50000});
  assert.equal(created.status,200,JSON.stringify(created.data));
  const path='/'+created.data.id;
  const update=(actor,op,data)=>req(actor,path+'/'+op,data);
  assert.equal((await req(outsider,path)).status,404);
  const guest=await update(manager,'member',{name:'Traveler',revision:0});
  const member=guest.data.members.find(m=>!m.linked).id, me=guest.data.me;
  const invitation=await update(manager,'invite',{member,revision:1});
  const joined=await req(friend,'/join',{code:invitation.data.code});
  assert.equal(joined.data.me,member);
  assert.equal((await req(outsider,'/join',{code:invitation.data.code})).status,404);
  assert.equal((await update(friend,'member',{revision:3,name:'Someone'})).status,403);
  const payload={description:'Group dinner',amount:1001,payer:me,shares:[{id:me,weight:1},{id:member,weight:2}],revision:3};
  assert.equal((await update(friend,'bill',payload)).status,403);
  assert.equal((await update(manager,'bill',{...payload,shares:[{id:member,weight:-1}]})).status,400);
  const bill=await update(manager,'bill',payload);
  assert.equal(bill.data.spent,1001); assert.deepEqual(bill.data.transfers,[{from:member,to:me,amount:667}]);
  assert.equal((await update(manager,'bill',payload)).status,409);
  assert.equal((await req(friend,path)).data.entries.length,1);
  assert.equal((await req(outsider,'')).data.trips.length,0);
  const settlement={from:member,to:me,amount:667,revision:4};
  assert.equal((await update(friend,'settle',settlement)).status,403);
  assert.equal((await update(manager,'settle',{...settlement,amount:668})).status,400);
  const paid=await update(manager,'settle',settlement);
  assert.deepEqual(paid.data.transfers,[]); assert.equal(paid.data.spent,1001);
  const undone=await update(manager,'undo',{entry:paid.data.entries.at(-1).id,revision:5});
  assert.equal(undone.data.transfers[0].amount,667);
  assert.equal((await call('/api/ledger',{cookie:friend.cookie})).data.state,null);
  assert.equal((await call('/api/trips'+path+'/member',{method:'POST',source:null,cookie:manager.cookie,headers:{'X-Folio-Account':manager.data.user.id},body:{revision:6,name:'bad'}})).status,403);
});
