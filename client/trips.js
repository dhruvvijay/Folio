(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const codes=['INR','USD','EUR','GBP','CAD','AUD','SGD','AED'];
  function moneyInput(v){
    const s=String(v).trim();
    if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(s)) throw Error('Enter an amount with up to two decimal places.');
    const [whole,fraction='']=s.split('.');
    return Number(whole)*100+Number(fraction.padEnd(2,'0'));
  }
  const amountInput=(name,label,required=true)=>`<label>${label}<input name="${name}" type="number" step="0.01" min="${required?'0.01':'0'}" max="9999999.99" ${required?'required':''}></label>`;
  const btn=(label,attrs='')=>`<button class="button" ${attrs}>${label}</button>`;
  function mount(root,user,defaultCurrency){
    let trip=null,busy=false,version=0;
    const fmt=n=>new Intl.NumberFormat(undefined,{style:'currency',currency:trip.currency}).format(n/100);
    const name=id=>esc(trip.members.find(m=>m.id===id)?.name || 'Friend');
    const active=()=>root.isConnected && window.FolioAccount.user?.id===user.id;
    async function api(path,body){
      const r=await fetch('/api/trips'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'X-Folio-Account':user.id,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
      if(!active())throw Error('Account changed.');
      if(r.status===401){void window.FolioAccount.invalidate();throw Error('Sign in again.');}
      const data=await r.json();if(!r.ok)throw Error(data.error||'Could not load trips.');return data;
    }
    function layout(title,sub,inside,back=false){
      root.innerHTML=`<div class="page-head"><div>${back?btn('All trips','type="button" data-trip-list') : ''}<h1>${esc(title)}</h1><p>${esc(sub)}</p></div>${btn('Refresh','type="button" data-trip-refresh')}</div><p class="trip-status" role="status"></p><div class="trip-grid">${inside}</div>`;
    }
    async function list(){
      const v=++version;const data=await api('');if(v!==version||!active())return;trip=null;
      const options=codes.map(c=>`<option ${c===(codes.includes(defaultCurrency)?defaultCurrency:'USD')?'selected':''}>${c}</option>`).join('');
      layout('Trips & splits','Share trip bills, track your group budget, and settle up.',
        `<section class="card trip-wide"><h2>Your trips</h2>${data.trips.length?data.trips.map(t=>btn(esc(t.name),'type="button" data-trip-open="'+esc(t.id)+'"')).join(' '):'<p>Create a trip below or join a friend’s trip with their code.</p>'}</section>
        <section class="card"><h2>Create a trip</h2><form data-trip-form="create"><label>Trip name<input name="name" required maxlength="80" placeholder="Goa weekend"></label><label>Trip currency<select name="currency">${options}</select></label>${amountInput('budget','Group budget (optional)',false)}${btn('Create trip')}</form></section>
        <section class="card"><h2>Join a trip</h2><form data-trip-form="join"><label>One-use invitation code<input required name="code" maxlength="32" autocomplete="off" spellcheck="false"></label>${btn('Join trip')}</form></section>`);
    }
    function show(t){
      if(!active())return;
      trip=t;
      const options=ms=>ms.map(m=>`<option value="${esc(m.id)}" ${m.id===t.me?'selected':''}>${esc(m.name)}</option>`).join('');
      const status=t.budget?(t.spent<=t.budget?fmt(t.budget-t.spent)+' left in budget':fmt(t.spent-t.budget)+' over budget'):'No group budget set';
      const balances=t.members.map(m=>`<li><span>${esc(m.name)}${m.id===t.me?' (you)':''}</span><strong>${t.balance[m.id]===0?'Even':(t.balance[m.id]>0?'Gets back ':'Owes ')+fmt(Math.abs(t.balance[m.id]))}</strong></li>`).join('');
      const transfers=t.transfers.map((s,i)=>`<li><span>${name(s.from)} pays ${name(s.to)} <strong>${fmt(s.amount)}</strong></span>${t.manager?btn('Record repayment','type="button" data-repay="'+i+'"'):''}</li>`).join('');
      const guests=t.members.filter(m=>!m.linked);
      const manage=t.manager?`<section class="card"><h2>Trip manager</h2><form data-trip-form="member"><label>Friend’s trip name<input required name="name" maxlength="80"></label>${btn('Add friend')}</form>${guests.length?`<form data-trip-form="invite"><label>Invite a friend to their place<select name="member">${options(guests)}</select></label>${btn('Generate invite code')}</form>`:''}<div data-code></div></section>`:'';
      const bills=t.entries.slice().reverse().map(e=>`<li><div><strong>${e.kind==='bill'?esc(e.description):'Repayment'}</strong><br>${e.kind==='bill'?name(e.payer)+' paid · '+e.shares.map(s=>name(s.id)+' '+fmt(s.amount)).join(', '):name(e.from)+' paid '+name(e.to)}</div><strong>${fmt(e.amount)}</strong></li>`).join('');
      layout(t.name,(t.manager?'You manage this trip':'Shared trip')+' · '+t.currency,
        `<section class="card"><h2>Trip spending</h2><p class="trip-total">${fmt(t.spent)}</p><p>${esc(status)}</p></section>
        <section class="card"><h2>Balances</h2><ul>${balances}</ul></section>
        <section class="card"><h2>Split a bill</h2><form data-trip-form="bill"><label>What was it for?<input name="description" required maxlength="120" placeholder="Dinner on Saturday"></label>${amountInput('amount','Bill total')}<label>Paid by<select name="payer">${options(t.members.filter(m=>t.manager || m.id===t.me))}</select></label><fieldset><legend>Split by shares</legend><p>Use 1 each for an equal split, 0 to skip someone, or a larger number for a bigger share.</p>${t.members.map(m=>`<label class="trip-share">${esc(m.name)}<input name="w-${esc(m.id)}" type="number" min="0" max="100" step="1" value="1" required></label>`).join('')}</fieldset>${btn('Save split bill')}</form></section>
        <section class="card"><h2>Settle up</h2>${transfers?`<ul>${transfers}</ul><p>Record a repayment after money has changed hands.</p>`:'<p>Everyone is even.</p>'}</section>${manage}
        <section class="card trip-wide"><h2>Trip history</h2>${bills?`<ul>${bills}</ul>${t.manager?btn('Undo latest entry','type="button" data-undo'):''}`:'<p>No bills recorded yet.</p>'}</section>`,true);
      if(t.code){
        root.querySelector('[data-code]').innerHTML=`<label>Share privately with this friend<input readonly value="${esc(t.code)}"></label><p>The code works once and expires in 24 hours. Generating another replaces it.</p>`;
        root.querySelector('[data-code] input').select();
      }
    }
    async function run(fn){
      if(busy)return; busy=true;root.setAttribute('aria-busy','true');root.inert=true;
      try{await fn();}catch(e){if(active()){
        let p=root.querySelector('.trip-status');
        if(!p){layout('Trips & splits','', '');p=root.querySelector('.trip-status');}
        p.textContent=e.message||'Could not connect. Refresh to try again.';
      }}finally{busy=false;root.inert=false;root.removeAttribute('aria-busy');}
    }
    const refresh=()=>trip?api('/'+trip.id).then(show):list();
    root.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.hasAttribute('data-trip-list'))void run(list);
      if(b.hasAttribute('data-trip-refresh'))void run(refresh);
      if(b.dataset.tripOpen)void run(()=>api('/'+b.dataset.tripOpen).then(show));
      if(b.dataset.repay!==undefined){
        const s=trip.transfers[Number(b.dataset.repay)];
        if(confirm('Confirm this repayment has already been made?'))void run(()=>api('/'+trip.id+'/settle',{...s,revision:trip.revision}).then(show));
      }
      if(b.hasAttribute('data-undo') && confirm('Remove the latest entry and recalculate this trip’s balances?'))void run(()=>api('/'+trip.id+'/undo',{entry:trip.entries.at(-1).id,revision:trip.revision}).then(show));
    });
    root.addEventListener('submit',e=>{
      const form=e.target;if(!form.dataset.tripForm)return;e.preventDefault();
      const d=new FormData(form),action=form.dataset.tripForm;
      void run(async()=>{
        if(action==='create')return show(await api('',{name:d.get('name'),currency:d.get('currency'),budget:moneyInput(d.get('budget')||'0')}));
        if(action==='join')return show(await api('/join',{code:d.get('code').trim()}));
        const body={revision:trip.revision};
        if(action==='member')body.name=d.get('name');
        if(action==='invite')body.member=d.get('member');
        if(action==='bill')Object.assign(body,{payer:d.get('payer'),description:d.get('description'),amount:moneyInput(d.get('amount')),shares:trip.members.map(m=>({id:m.id,weight:Number(d.get('w-'+m.id))})).filter(s=>s.weight>0)});
        show(await api('/'+trip.id+'/'+action,body));
      });
    });
    root.textContent='Loading trips…';void run(list);
  }
  window.FolioTrips=Object.freeze({mount});
})();
