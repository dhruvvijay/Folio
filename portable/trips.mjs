import { createHash, randomBytes, randomUUID } from 'node:crypto';

const currencies = new Set(['INR','USD','EUR','GBP','CAD','AUD','SGD','AED']);
const hash = value => createHash('sha256').update(value).digest('hex');
const reply = (body,status=200) => Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
class Problem extends Error { constructor(status,message){ super(message); this.status=status; } }
function check(ok,message,status=400){ if(!ok) throw new Problem(status,message); }
function label(value,max){ check(typeof value==='string' && value.trim().length>0 && value.trim().length<=max,'Enter a shorter, nonempty name or description.'); return value.trim(); }
function cents(n,min=1){check(Number.isSafeInteger(n) && n>=min && n<=999999999,'Enter a valid amount with at most two decimal places.');return n;}

export function allocate(total,shares,ids){
  cents(total);
  check(Array.isArray(shares) && shares.length>0 && shares.length<=ids.size,'Choose the people sharing this bill.');
  const seen=new Set();
  for(const s of shares){
    check(s && ids.has(s.id) && !seen.has(s.id) && Number.isInteger(s.weight) && s.weight>=1 && s.weight<=100,'Each participant needs a distinct name and 1–100 shares.');
    seen.add(s.id);
  }
  const sum=shares.reduce((n,s)=>n+s.weight,0);
  const rows=shares.map(s=>({id:s.id,weight:s.weight,amount:Math.floor(total*s.weight/sum),remainder:total*s.weight%sum}));
  const extra=total-rows.reduce((n,r)=>n+r.amount,0);
  rows.sort((a,b)=>b.remainder-a.remainder || a.id.localeCompare(b.id));
  return rows.map(({id,weight,amount},i)=>({id,weight,amount:amount+Number(i<extra)}));
}

export function summarize(members,entries){
  const balance=Object.fromEntries(members.map(m=>[m.id,0]));
  let spent=0;
  for(const e of entries){
    if(e.kind==='bill'){
      spent+=e.amount; balance[e.payer]+=e.amount;
      for(const s of e.shares) balance[s.id]-=s.amount;
    } else { balance[e.from]+=e.amount; balance[e.to]-=e.amount; }
  }
  const ordered=Object.entries(balance).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]) || a[0].localeCompare(b[0]));
  const debt=ordered.filter(x=>x[1]<0),credit=ordered.filter(x=>x[1]>0), transfers=[];
  let i=0,j=0;
  while(i<debt.length && j<credit.length){
    const amount=Math.min(-debt[i][1],credit[j][1]);
    transfers.push({from:debt[i][0],to:credit[j][0],amount});
    debt[i][1]+=amount;credit[j][1]-=amount;
    if(!debt[i][1])i++; if(!credit[j][1])j++;
  }
  return {spent,balance,transfers};
}

async function readBody(req){
  check(req.headers.get('origin')===new URL(req.url).origin,'Open Folio directly to make changes.',403);
  check(req.headers.get('content-type')?.split(';')[0]==='application/json','Send JSON.',415);
  check(req.body,'Missing request.');
  const reader=req.body.getReader(),chunks=[]; let size=0;
  try{
    for(;;){const item=await reader.read(); if(item.done)break;size+=item.value.length;
      if(size>8192){await reader.cancel();throw new Problem(413,'Request too large.');} chunks.push(item.value);}
    const value=JSON.parse(Buffer.concat(chunks).toString());check(value && typeof value==='object' && !Array.isArray(value),'Invalid request.');return value;
  } catch(e){if(e instanceof Problem)throw e;throw new Problem(400,'Invalid JSON.');}
}
async function detail(tx,id,user){
  const trip=(await tx.query('SELECT id,name,currency,budget,revision,owner_id FROM folio_trips WHERE id=?',[id])).rows[0];
  const members=(await tx.query('SELECT id,name,user_id FROM folio_trip_members WHERE trip_id=? ORDER BY name,id',[id])).rows;
  const me=members.find(m=>m.user_id===user.id);
  check(trip && me,'Trip not found.',404);
  const entries=(await tx.query('SELECT id,payload FROM folio_trip_entries WHERE trip_id=? ORDER BY seq',[id])).rows.map(r=>({id:r.id,...JSON.parse(r.payload)}));
  return {id,name:trip.name,currency:trip.currency,budget:trip.budget,revision:trip.revision,manager:trip.owner_id===user.id,me:me.id,
    members:members.map(m=>({id:m.id,name:m.name,linked:!!m.user_id})),entries,...summarize(members,entries)};
}
export async function tripsResponse(req,auth,db){
  try{
    const path=new URL(req.url).pathname, post=req.method==='POST';
    check(post || req.method==='GET','Method not allowed.',405);
    const session=await auth.authenticate(req);check(session,'Sign in to open trips.',401);
    check(req.headers.get('x-folio-account')===session.id,'Account changed. Refresh Folio.',403);
    const b=post?await readBody(req):{};
    const result=await db.transaction(async tx=>{
      const user=await auth.authenticate(req,tx);check(user?.id===session.id,'Sign in again.',401);
      if(path==='/api/trips'){
        if(!post)return {trips:(await tx.query('SELECT t.id,t.name,t.currency FROM folio_trips t JOIN folio_trip_members m ON m.trip_id=t.id WHERE m.user_id=? ORDER BY t.name,t.id',[user.id])).rows};
        const id=randomUUID(),name=label(b.name,80); check(currencies.has(b.currency),'Choose a supported currency.');
        await tx.query('INSERT INTO folio_trips (id,name,owner_id,currency,budget) VALUES (?,?,?,?,?)',[id,name,user.id,b.currency,cents(b.budget??0,0)]);
        await tx.query('INSERT INTO folio_trip_members(id,trip_id,name,user_id) VALUES (?,?,?,?)',[randomUUID(),id,user.name,user.id]);
        return detail(tx,id,user);
      }
      if(path==='/api/trips/join' && post){
        check(typeof b.code==='string' && /^[a-f0-9]{32}$/.test(b.code),'Invalid invitation.');
        const digest=hash(b.code);
        const slot=(await tx.query('SELECT trip_id FROM folio_trip_members WHERE invite_hash=? AND expires>? AND user_id IS NULL',[digest,Date.now()])).rows[0];
        check(slot,'Invitation expired or already used.',404);
        await tx.query('UPDATE folio_trips SET revision=revision+1 WHERE id=?',[slot.trip_id]);
        check(!(await tx.query('SELECT id FROM folio_trip_members WHERE trip_id=? AND user_id=?',[slot.trip_id,user.id])).rows.length,'You already belong to this trip.',409);
        check((await tx.query('UPDATE folio_trip_members SET user_id=?,invite_hash=NULL,expires=NULL WHERE trip_id=? AND invite_hash=? AND expires>? AND user_id IS NULL RETURNING id',[user.id,slot.trip_id,digest,Date.now()])).rows.length,'Invitation expired or already used.',404);
        return detail(tx,slot.trip_id,user);
      }
      const match=/^\/api\/trips\/([a-f0-9-]{36})(?:\/(member|invite|bill|settle|undo))?$/.exec(path);
      check(match && post===!!match[2],'Trip not found.',404);
      const [,id,action]=match;
      if(post){
        const lock=await tx.query('UPDATE folio_trips SET revision=revision WHERE id=? AND id IN (SELECT trip_id FROM folio_trip_members WHERE user_id=?) RETURNING id',[id,user.id]);
        check(lock.rows.length,'Trip not found.',404);
      }
      const t=await detail(tx,id,user);if(!post)return t;
      check(t.revision===b.revision,'This trip changed. Refresh before saving.',409);
      const ids=new Set(t.members.map(m=>m.id));
      if(action==='member' || action==='invite' || action==='undo')check(t.manager,'Only the trip manager can do this.',403);
      let code;
      if(action==='member'){
        check(ids.size<40,'A trip can have up to 40 people.');
        await tx.query('INSERT INTO folio_trip_members(id,trip_id,name) VALUES (?,?,?)',[randomUUID(),id,label(b.name,80)]);
      } else if(action==='invite'){
        check(t.members.some(m=>m.id===b.member && !m.linked),'Choose an unlinked friend.');
        code=randomBytes(16).toString('hex');
        await tx.query('UPDATE folio_trip_members SET invite_hash=?,expires=? WHERE id=?',[hash(code),Date.now()+86400000,b.member]);
      } else if(action==='undo'){
        check(t.entries.at(-1)?.id===b.entry && !!b.entry,'Choose the latest entry.');
        await tx.query('DELETE FROM folio_trip_entries WHERE trip_id=? AND id=?',[id,b.entry]);
      } else {
        check(t.entries.length<1000,'This trip has reached 1,000 entries.');
        const amount=cents(b.amount); let entry;
        if(action==='bill'){
          check(ids.has(b.payer) && (t.manager || b.payer===t.me),'Select an eligible payer.',403);
          entry={kind:'bill',description:label(b.description,120),payer:b.payer,amount,shares:allocate(amount,b.shares,ids)};
        } else {
          check(t.manager,'Only the manager can confirm a repayment.',403);
          check(t.transfers.some(x=>x.from===b.from && x.to===b.to && x.amount>=amount),'This repayment exceeds the suggested transfer.');
          entry={kind:'settlement',from:b.from,to:b.to,amount};
        }
        entry.at=new Date().toISOString();
        await tx.query('INSERT INTO folio_trip_entries(id,trip_id,seq,payload) VALUES (?,?,?,?)',[randomUUID(),id,t.revision+1,JSON.stringify(entry)]);
      }
      await tx.query('UPDATE folio_trips SET revision=revision+1 WHERE id=?',[id]);
      return {...await detail(tx,id,user),...(code?{code}:{})};
    });
    return reply(result);
  }catch(e){return e instanceof Problem?reply({error:e.message},e.status):reply({error:'Trips are temporarily unavailable.'},503);}
}
