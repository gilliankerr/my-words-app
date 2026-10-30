(function(root){
  'use strict';
  async function render(ctx){
    const token=ctx.screenToken?.(),index=await NextDictionary.load();if(ctx.scopeAlive?.()===false||token!==ctx.screenToken?.())return;
    ctx.clear('Icons settings');ctx.node('p','Change wording, favourites and picture visibility. Hidden pictures already in a message remain there until removed.',ctx.main);
    for(const text of NextSymbolCatalogue.warnings(NextDictionaryView.current(ctx).dictionary))ctx.node('p',text,ctx.main,'notice');
    const form=ctx.node('form',undefined,ctx.main,'dictionary-search');const label=ctx.node('label','Find a picture to change',form);label.htmlFor='icon-editor-query';const input=ctx.node('input',undefined,form);input.id=label.htmlFor;input.type='search';
    const submit=ctx.node('button','Find pictures',form);submit.type='submit';const area=ctx.node('section',undefined,ctx.main);
    function listing(limit=48){area.replaceChildren();const p=NextDictionaryView.current(ctx),d=p.dictionary||{};const words=index.symbols.map(s=>NextSymbolCatalogue.effective(s,d));
      const query=input.value.toLowerCase().trim(),results=words.filter(s=>!query||[s.label,s.group,...NextSymbolCatalogue.aliases(d,s.id)].join(' ').toLowerCase().includes(query));
      ctx.node('p',results.length+' pictures',area);
      for(const s of results){const row=ctx.node('div',undefined,area,'dictionary-editor-row');NextDictionaryView.image(ctx,s,row);ctx.node('span',s.label+(s.hidden?' — Hidden':''),row);ctx.button('Change '+s.label,()=>edit(ctx,index,s.id),row);}
      const favourites=NextDictionary.preferences(p).favourites;if(favourites.length){ctx.node('h2','Favourite order',area);for(const [n,id] of favourites.entries()){const s=words.find(s=>s.id===id);const row=ctx.node('div',undefined,area,'actions');ctx.node('span',s?.label||'Unavailable saved picture',row);for(const [label,offset] of [['Move up',-1],['Move down',1]]){const button=ctx.button(label,async()=>{const copy=structuredClone(NextDictionaryView.current(ctx)),ids=NextDictionary.preferences(copy).favourites,j=n+offset;if(j<0||j>=ids.length)return;[ids[n],ids[j]]=[ids[j],ids[n]];copy.dictionary={...NextDictionary.preferences(copy),favourites:ids};try{const result=await ctx.save(copy,{base:copy.revision??0});if(['accepted','waiting'].includes(result?.outcome)&&area.isConnected)listing();}catch(e){ctx.node('p',e.message,row,'notice');}},row);button.disabled=n+offset<0||n+offset>=favourites.length;button.setAttribute('aria-label',label+' '+(s?.label||'unavailable picture'));}}
      }
    }
    form.onsubmit=e=>{e.preventDefault();listing();};listing();ctx.button('Return to Settings',ctx.home);
  }
  function edit(ctx,index,id){
    const saved=NextDictionaryView.current(ctx),draft=ctx.drafts?.()[saved.id];let copy=structuredClone(draft?.state==='draft'?draft.payload:saved),base=draft?.state==='draft'?draft.base:saved.revision??0;
    const symbol=index.symbols.find(s=>s.id===id),effective=NextSymbolCatalogue.effective(symbol,copy.dictionary||{});ctx.clear('Change picture');
    const layout=ctx.node('div',undefined,ctx.main,'dictionary-editor-layout'),form=ctx.node('form',undefined,layout,'dictionary-search'),preview=ctx.node('section',undefined,layout,'dictionary-preview');ctx.node('h2','Communication preview',preview);
    const inputs={};
    for(const [key,label,value] of [['label','Word label',effective.label],['messageText','Show wording',copy.dictionary?.messageText?.[id]||''],['aliases','Other search words',NextSymbolCatalogue.aliases(copy.dictionary,id).join('\n')]]){const l=ctx.node('label',label,form),input=ctx.node(key==='label'?'input':'textarea',undefined,form);input.id='icon-edit-'+key;l.htmlFor=input.id;input.value=value;input.maxLength=key==='label'?200:key==='messageText'?4000:4020;inputs[key]=input;}
    const favouriteLabel=ctx.node('label',undefined,form,'check-row'),favourite=ctx.node('input',undefined,favouriteLabel);favourite.type='checkbox';favourite.checked=NextDictionary.preferences(copy).favourites.includes(id);ctx.node('span','Favourite',favouriteLabel);
    const hideLabel=ctx.node('label',undefined,form,'check-row'),hidden=ctx.node('input',undefined,hideLabel);hidden.type='checkbox';hidden.checked=effective.hidden;ctx.node('span','Hide from browsing',hideLabel);
    ctx.node('p','Blank Show wording uses the word label. Enter one search word or phrase per line. Hiding keeps saved references and selected messages.',form);
    const feedback=ctx.node('p','',form,'notice');feedback.setAttribute('role','status');let draftQueue=Promise.resolve();
    function collect(){let result=NextSymbolCatalogue.update(copy,id,{label:inputs.label.value,messageText:inputs.messageText.value.trim()||null,aliases:inputs.aliases.value.split('\n').map(s=>s.trim()).filter(Boolean),hidden:hidden.checked});const d=NextDictionary.preferences(result);if(d.favourites.includes(id)!==favourite.checked)result=NextDictionary.toggle(result,'favourites',id);return result;}
    function paint(){const e=NextSymbolCatalogue.effective(symbol,copy.dictionary||{});preview.replaceChildren();ctx.node('h2','Communication preview',preview);NextDictionaryView.image(ctx,e,preview);ctx.node('p',e.label,preview);ctx.node('p',e.messageText,preview,'passage');}
    const remember=()=>{try{copy=collect();paint();const captured=structuredClone(copy);draftQueue=draftQueue.catch(()=>{}).then(()=>ctx.rememberDraft(captured,base)).catch(e=>{if(feedback.isConnected)feedback.textContent='Draft could not be saved: '+e.message;});}catch(e){feedback.textContent=e.message;}};
    for(const input of [...Object.values(inputs),favourite,hidden])input.addEventListener('input',remember);paint();
    const save=ctx.node('button','Save picture choices',form);save.type='submit';form.onsubmit=async e=>{e.preventDefault();const controls=[...form.querySelectorAll('input,textarea,button')];try{copy=collect();controls.forEach(c=>c.disabled=true);feedback.textContent='Saving picture choices…';await draftQueue;const result=await ctx.save(copy,{base});if(!feedback.isConnected)return;if(['accepted','waiting'].includes(result?.outcome)){base=result.revision;await ctx.discardDraft(copy.id);feedback.textContent=result.outcome==='waiting'?'Saved on this device. Waiting to sync.':'Picture choices saved.';}}catch(error){feedback.textContent=error.message;}finally{controls.forEach(c=>c.disabled=false);}};
    ctx.button('Reset wording',()=>{inputs.label.value=symbol.label;inputs.messageText.value='';copy=NextSymbolCatalogue.update(copy,id,{label:null,messageText:null});paint();feedback.textContent='Original wording restored in this draft. Save to keep it.';draftQueue=draftQueue.catch(()=>{}).then(()=>ctx.rememberDraft(copy,base));},form);
    ctx.button('Cancel changes',async()=>{await draftQueue;await ctx.discardDraft(copy.id);await render(ctx);},form);
    ctx.button('Back to icon settings',()=>render(ctx),form);
  }
  root.NextDictionaryEditor={render};
})(globalThis);
