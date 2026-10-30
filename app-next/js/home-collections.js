(function(root,factory){
  const api=factory(typeof module==='object'?require('./book-records'):root.NextBook,typeof module==='object'?require('./model'):root.NextModel,typeof module==='object'?require('./expression'):root.NextExpression,typeof module==='object'?require('./word-groups'):root.NextWordGroups,typeof module==='object'?require('./notebooks'):root.NextNotebooks);
  if(typeof module==='object')module.exports=api;else root.NextHomeCollections=api;
})(globalThis,function(B,M,E,G,N){
  'use strict';
  const SHORTCUT_ID='7b026a11-6bee-4d35-8100-000000000001', HIGHLIGHT_ID='7b026a11-6bee-4d35-8100-000000000002';
  const active=p=>!p.hidden&&!p.archived&&!p.tombstone;
  const accepted=result=>['accepted','waiting'].includes(result?.outcome);
  const strip=p=>{const copy=M.clone(p);delete copy.revision;delete copy.waiting;delete copy.synthetic;delete copy.available;return copy;};
  const sections=['People','Notes','Pictures','Situation notebooks','Word groups','Communication book','Shopping list','Personal information','Sections'];
  const routeLabels=[['quick-words','Quick words'],['people','People'],['personal-information','Personal information'],['notes','Notes'],['icons','Icons'],['book','Communication book'],['notebooks','Situation notebooks'],['shopping','Shopping list']];
  const selectionStates=new Map();
  function preference(ctx,category,id){const saved=ctx.records().find(p=>p.kind==='preference'&&p.category===category&&active(p));if(saved)B.validatePayload(saved);return saved||{id,kind:'preference',category,text:category==='shortcuts'?'Shortcuts':'Communication book highlights',binding:{source:'addition',category},revision:0};}
  function shortcutTargets(ctx){
    const saved=ctx.records().find(p=>p.kind==='preference'&&p.category==='shortcuts'&&active(p));
    if(saved){B.validatePayload(saved);return M.clone(saved.targets);}
    return G.slots(ctx).filter(s=>s.groupId).map(s=>({type:'group',id:s.groupId,label:s.groupLabel||'Saved word group'}));
  }
  function changeShortcuts(p,targets){return {...strip(p),targets:M.clone(targets),undoTargets:M.clone(p.targets||[]),undoRevision:(p.revision||0)+1,changeId:crypto.randomUUID()};}
  function highlights(ctx){
    let state=selectionStates.get(ctx.scopeKey);
    if(!state){state={pending:new Map(),queue:Promise.resolve(),listeners:new Set(),choices:{...(preference(ctx,'book-highlights',HIGHLIGHT_ID).choices||{})}};selectionStates.set(ctx.scopeKey,state);}
    return state;
  }
  function syncHighlights(ctx){highlights(ctx).choices={...(preference(ctx,'book-highlights',HIGHLIGHT_ID).choices||{})};}
  function bookSelected(ctx,p){const state=highlights(ctx),choice=state.pending.get(p.id);return choice?choice.selected:state.choices[p.id]??!!p.highlight;}
  function paintHighlights(ctx){for(const paint of highlights(ctx).listeners)if(!paint())highlights(ctx).listeners.delete(paint);}
  function highlightButton(ctx,p,button,isReading=()=>true){
    const paint=()=>{if(!button.isConnected||ctx.scopeAlive?.()===false)return false;if(isReading())button.setAttribute('aria-pressed',String(bookSelected(ctx,p)));return true;};
    highlights(ctx).listeners.add(paint);paint();
  }
  function toggleBook(ctx,p){
    const state=highlights(ctx),choice={selected:!bookSelected(ctx,p)};state.pending.set(p.id,choice);paintHighlights(ctx);
    const task=state.queue.catch(()=>{}).then(async()=>{
      if(ctx.scopeAlive?.()===false)return;
      const latest=preference(ctx,'book-highlights',HIGHLIGHT_ID),payload={...strip(latest),choices:{...(latest.choices||{}),[p.id]:choice.selected}};
      try{const result=await ctx.save(payload,{base:latest.revision||0,backgroundSync:true,backgroundLabel:'Highlights'});if(!accepted(result))throw Error('Highlight could not be saved. Tap the word to try again.');state.choices={...payload.choices};}
      catch(error){if(ctx.scopeAlive?.()!==false)ctx.message(error.message||'Highlight could not be saved. Your earlier choices are kept.');}
      finally{if(state.pending.get(p.id)===choice)state.pending.delete(p.id);if(ctx.scopeAlive?.()!==false)paintHighlights(ctx);}
    });state.queue=task;ctx.trackDraftQueue?.(task);return task;
  }
  function entry(type,p,section,label){return {target:{type,id:p.id,label:type==='notebook'?'Situation notebook':label||p.name||p.text},section,label:label||p.name||p.text,item:p};}
  function candidates(ctx,index){
    const records=ctx.records().filter(active),out=[];
    for(const p of E.peopleRecords(records))out.push(entry('person',p,'People',E.personName(p)));
    for(const p of E.noteRecords(records))out.push(entry('note',p,'Notes',E.noteName(p)));
    for(const p of N.records(ctx))out.push(entry('notebook',p,'Situation notebooks',N.title(p)));
    for(const p of G.groups(ctx))out.push(entry('group',p,'Word groups',p.name||'Saved word group'));
    const projected=ctx.project?.();
    const bookWords=projected?.vocabulary?projected.vocabulary.filter(s=>!['notes','shopping-list'].includes(s.id)).flatMap(s=>s.words):records.filter(p=>p.kind==='phrase'&&!['notes','shopping-list','rescue'].includes(p.category));
    for(const p of bookWords.filter(active))out.push(entry('book',p,'Communication book',p.text));
    for(const p of (ctx.shoppingItems?.()||records.filter(p=>p.kind==='shopping'&&p.category==='shopping-list')).filter(active))out.push(entry('shopping',p,'Shopping list',p.text));
    for(const p of records.filter(p=>p.kind==='page'&&!E.peopleRecords([p]).length&&!E.noteRecords([p]).length&&p.category==='personal'&&!['guide'].includes(p.binding?.path?.[0])&&!(globalThis.NextDiscovery?.excludedPersonal(p))))out.push(entry('personal',p,'Personal information',p.name||'Personal page'));
    if(index){const prefs=records.find(p=>p.kind==='preference'&&p.category==='dictionary')?.dictionary||{};for(const p of index.symbols.map(p=>NextSymbolCatalogue.effective(p,prefs)).filter(p=>!p.hidden))out.push(entry('picture',p,'Pictures',p.label));}
    for(const [id,label]of routeLabels)out.push({target:{type:'destination',id,label},label,section:'Sections'});
    return out;
  }
  function favouriteEntries(ctx,index){
    const records=ctx.records(),dictionary=records.find(p=>p.kind==='preference'&&p.category==='dictionary')?.dictionary||{},legacyGroups=G.slots(ctx).filter(s=>s.groupId).map(s=>s.groupId);
    syncHighlights(ctx);
    const pictureIds=globalThis.NextDictionaryView?.favouriteIds(ctx)||dictionary.favourites||[];
    return candidates(ctx,index).filter(e=>{
      const p=e.item;if(!p)return false;
      if(e.target.type==='person')return E.personCategories(p).includes('Favourites');
      if(e.target.type==='picture')return pictureIds.includes(p.id);
      if(e.target.type==='book')return bookSelected(ctx,p);
      if(e.target.type==='shopping')return !!p.checked;
      if(e.target.type==='group')return p.favourite===true||(p.favourite===undefined&&legacyGroups.includes(p.id));
      if(e.target.type==='notebook')return !!(p.favourite||p.printFavourite);
      return !!(p.favourite??p.original?.favourite);
    }).sort((a,b)=>sections.indexOf(a.section)-sections.indexOf(b.section)||(a.section==='Pictures'?pictureIds.indexOf(a.target.id)-pictureIds.indexOf(b.target.id):a.section==='Notes'?(a.item.favouriteOrder||0)-(b.item.favouriteOrder||0)||String(a.target.id).localeCompare(String(b.target.id)):0));
  }
  function resolve(ctx,target,index){return candidates(ctx,index).find(e=>e.target.type===target.type&&e.target.id===target.id);}
  function open(ctx,e,back){
    if(e.target.type==='destination')return (ctx.openDestination||ctx.navigate)(e.target.id);
    if(e.target.type==='note')return E.readNote(ctx,e.item);
    if(e.target.type==='person')return E.readPerson(ctx,e.item);
    if(e.target.type==='group')return G.open(ctx,e.item.id,back);
    if(e.target.type==='notebook')return N.read(ctx,e.item,back);
    if(e.target.type==='picture')return NextDictionaryView.show(ctx,[e.item]);
    if(e.target.type==='shopping')return ctx.openShopping?.(e.item);
    if(e.target.type==='personal')return ctx.openPersonal?.(e.item);
    return ctx.showPage(e.label,parent=>{ctx.node('p',e.item.text,parent,'passage');ctx.button('Add shortcut',()=>addShortcut(ctx,e.target),parent);});
  }
  async function loadIndex(ctx,heading){try{return await NextDictionary.load();}catch{if(heading.isConnected)ctx.message('Pictures could not open. Your other saved choices are available.');return null;}}
  async function favourites(ctx){
    ctx.clear('Favourites');const heading=ctx.main.firstChild;ctx.refreshOnReturn?.(()=>favourites(ctx));
    const area=ctx.node('div',undefined,ctx.main,'favourites-collection');
    const draw=index=>{area.replaceChildren();const entries=favouriteEntries(ctx,index);if(!entries.length){ctx.node('p','Star content or highlight words to keep them here.',area);return;}
      for(const section of sections){const found=entries.filter(e=>e.section===section);if(!found.length)continue;const group=ctx.node('section',undefined,area);ctx.node('h2',section,group);
        if(section==='Shopping list')ctx.node('p','Ticked items',group,'collection-hint');
        const choices=ctx.node('div',undefined,group,section==='Pictures'?'dictionary-grid':'collection-choices');
        for(const e of found){const b=ctx.button(e.target.type==='picture'?'':e.label,()=>open(ctx,e,()=>ctx.navigate('favourites')),choices,'collection-open');b.dataset.favouriteItem=e.target.type+':'+e.target.id;
          if(e.target.type==='picture'){NextDictionaryView.image(ctx,e.item,b);ctx.node('span',e.label,b);b.setAttribute('aria-label','Show '+e.label);}
          if(e.target.type==='book'||e.target.type==='shopping')b.classList.add('highlighted');
        }
      }
    };draw(null);const index=await loadIndex(ctx,heading);if(heading.isConnected&&ctx.scopeAlive?.()!==false)draw(index);
  }
  async function shortcuts(ctx,editing=false){
    ctx.clear(editing?'Edit shortcuts':'Shortcuts');const heading=ctx.main.firstChild;ctx.refreshOnReturn?.(()=>shortcuts(ctx,editing));
    const area=ctx.node('div',undefined,ctx.main,'shortcuts-collection');
    const draw=index=>{area.replaceChildren();const targets=shortcutTargets(ctx),available=candidates(ctx,index);
      if(!targets.length)ctx.node('p','Choose people, notes, pictures or other saved content for quick access.',area);
      for(const [i,target]of targets.entries()){
        const e=available.find(e=>e.target.type===target.type&&e.target.id===target.id),row=ctx.node('section',undefined,area,'shortcut-row');row.dataset.shortcut=target.type+':'+target.id;
        if(e){ctx.node('small',e.section,row,'shortcut-source');ctx.button(e.label,()=>open(ctx,e,()=>ctx.navigate('shortcuts')),row,'collection-open');}
        else ctx.node('p',target.label+' — unavailable',row);
        if(editing){const controls=ctx.node('div',undefined,row,'shortcut-controls');
          const up=ctx.button('Move up',()=>mutate(ctx,list=>{[list[i-1],list[i]]=[list[i],list[i-1]];return list;}),controls);up.disabled=i===0;up.setAttribute('aria-label','Move up: '+(e?.label||target.label));
          const down=ctx.button('Move down',()=>mutate(ctx,list=>{[list[i+1],list[i]]=[list[i],list[i+1]];return list;}),controls);down.disabled=i===targets.length-1;down.setAttribute('aria-label','Move down: '+(e?.label||target.label));
          ctx.button('Remove shortcut',()=>mutate(ctx,list=>list.filter(t=>!(t.type===target.type&&t.id===target.id))),controls);
        }
      }
    };draw(null);
    ctx.button('Add shortcut',()=>picker(ctx));
    ctx.button(editing?'Done':'Edit shortcuts',()=>shortcuts(ctx,!editing));
    const p=preference(ctx,'shortcuts',SHORTCUT_ID);
    if(editing&&p.undoTargets){const undo=ctx.button('Undo shortcut change',()=>mutate(ctx,()=>M.clone(p.undoTargets),p),ctx.main);undo.disabled=false;}
    const index=await loadIndex(ctx,heading);if(heading.isConnected&&ctx.scopeAlive?.()!==false)draw(index);
  }
  async function mutate(ctx,transform,expected){
    const heading=ctx.main.firstChild,latest=preference(ctx,'shortcuts',SHORTCUT_ID);
    if(expected&&(latest.changeId!==expected.changeId||M.canonical(latest.targets)!==M.canonical(expected.targets))){ctx.message('Shortcuts changed. Reopen them before undoing.');return;}
    const old=shortcutTargets(ctx),p=changeShortcuts({...latest,targets:old},transform(M.clone(old)));
    ctx.main.querySelectorAll('.shortcut-controls button').forEach(b=>b.disabled=true);
    try{const result=await ctx.save(p,{base:latest.revision||0,backgroundSync:true,backgroundLabel:'Shortcuts'});if(!accepted(result)&&result?.outcome!=='conflict')throw Error('Shortcut change was not confirmed. Earlier choices are kept. Try again.');if(accepted(result)&&heading.isConnected){await shortcuts(ctx,true);ctx.message('Shortcuts saved. Removed links keep their original content.');}}
    catch(error){if(heading.isConnected)await shortcuts(ctx,true);ctx.report(error);}
  }
  async function addShortcut(ctx,target){
    const heading=ctx.main.firstChild,latest=preference(ctx,'shortcuts',SHORTCUT_ID),old=shortcutTargets(ctx);
    if(old.some(t=>t.type===target.type&&t.id===target.id)){ctx.message('Already in Shortcuts.');return {outcome:'accepted'};}
    const result=await ctx.save(changeShortcuts({...latest,targets:old},[...old,M.clone(target)]),{base:latest.revision||0,backgroundSync:true,backgroundLabel:'Shortcuts'});
    if(!accepted(result)&&result?.outcome!=='conflict')throw Error('Shortcut was not confirmed. Earlier choices are kept. Try again.');
    if(accepted(result)&&heading.isConnected)ctx.message('Shortcut added.');return result;
  }
  async function picker(ctx){
    ctx.clear('Add shortcut');const heading=ctx.main.firstChild;
    const form=ctx.node('form',undefined,ctx.main,'all-search');const label=ctx.node('label','Find saved content',form);const query=ctx.node('input',undefined,form);query.id=label.htmlFor='shortcut-query';query.type='search';
    const filterLabel=ctx.node('label','Section',form),filter=ctx.node('select',undefined,form);filter.id=filterLabel.htmlFor='shortcut-section';
    for(const name of ['All sections',...sections])ctx.node('option',name,filter).value=name;
    const submit=ctx.node('button','Search',form);submit.type='submit';let index,count=30;const area=ctx.node('div',undefined,ctx.main,'shortcut-picker');
    const render=()=>{area.replaceChildren();const found=candidates(ctx,index).filter(e=>(filter.value==='All sections'||e.section===filter.value)&&E.normalise(e.label+' '+(e.item?.text||'')).includes(E.normalise(query.value)));
      for(const section of sections){const entries=found.slice(0,count).filter(e=>e.section===section);if(!entries.length)continue;const group=ctx.node('section',undefined,area);ctx.node('h2',section,group);
        for(const e of entries){const b=ctx.button(e.label,()=>{ctx.clear('Add shortcut');const screen=ctx.main.firstChild;ctx.node('h2',e.label,ctx.main);if(e.item?.text&&e.target.type!=='personal')ctx.node('p',e.item.text,ctx.main,'passage');if(e.target.type==='picture')NextDictionaryView.image(ctx,e.item,ctx.main);
          let saving=false;const use=ctx.button('Add to Shortcuts',async()=>{if(saving)return;saving=true;use.disabled=true;use.textContent='Saving…';try{const result=await addShortcut(ctx,e.target);if(accepted(result)&&screen.isConnected){ctx.navigate('shortcuts');ctx.message('Shortcut added.');}}finally{saving=false;use.disabled=false;use.textContent='Add to Shortcuts';}});},group,'collection-open');b.dataset.shortcutCandidate=e.target.type+':'+e.target.id;}
      }
      if(!found.length)ctx.node('p','No matching saved content.',area);
      if(found.length>count)ctx.button('Show more choices',()=>{count+=30;render();},area);
    };form.onsubmit=e=>{e.preventDefault();count=30;render();};filter.onchange=()=>{count=30;render();};render();index=await loadIndex(ctx,heading);if(heading.isConnected&&ctx.scopeAlive?.()!==false)render();
  }
  function groupStar(ctx,group,parent){
    let selected=group.favourite===true||(group.favourite===undefined&&G.slots(ctx).some(s=>s.groupId===group.id));
    const button=ctx.button(selected?'★':'☆',async()=>{button.disabled=true;try{const latest=G.groups(ctx,true).find(p=>p.id===group.id)||group;const result=await ctx.save({...strip(latest),favourite:!selected},{base:latest.revision||0,backgroundSync:true});if(accepted(result)){selected=!selected;button.textContent=selected?'★':'☆';button.setAttribute('aria-pressed',String(selected));}}finally{button.disabled=false;}},parent,'favourite-star');button.setAttribute('aria-label','Favourite word group');button.setAttribute('aria-pressed',String(selected));
  }
  return {SHORTCUT_ID,HIGHLIGHT_ID,shortcutTargets,changeShortcuts,favouriteEntries,candidates,resolve,open,favourites,shortcuts,picker,addShortcut,syncHighlights,bookSelected,highlightButton,toggleBook,groupStar,reset:()=>selectionStates.clear()};
});
