(function(root,factory){root.NextDictionaryView=factory();})(globalThis,function(){
  'use strict';
  const sessions=new Map(), favouriteStates=new Map();
  function reset(){sessions.clear();favouriteStates.clear();}
  function current(ctx){return ctx.records().find(p=>p.kind==='preference'&&p.category==='dictionary'&&!p.tombstone)||{...ctx.newPayload('preference','dictionary','Picture dictionary','Picture dictionary'),id:NextDictionary.PREFERENCE_ID,dictionary:{favourites:[],selection:[],aliases:{},composition:false}};}
  function image(ctx,item,parent){const img=ctx.node('img',undefined,parent,'dictionary-picture');img.alt='';img.src=item.asset;img.width=120;img.height=120;img.loading='lazy';img.decoding='async';img.onerror=()=>{img.remove();parent.classList.add('dictionary-image-unavailable');ctx.node('span','Picture unavailable',parent,'dictionary-image-status');};}
  function favouriteState(ctx){
    let state=favouriteStates.get(ctx.scopeKey);
    if(!state){state={pending:new Map(),queue:Promise.resolve(),listeners:new Set(),serial:0,base:[...NextDictionary.preferences(current(ctx)).favourites]};favouriteStates.set(ctx.scopeKey,state);}
    return state;
  }
  function favourites(ctx){
    const ids=[...favouriteState(ctx).base];
    for(const [id,choice] of favouriteState(ctx).pending){const at=ids.indexOf(id);if(choice.selected&&at<0)ids.push(id);else if(!choice.selected&&at>=0)ids.splice(at,1);}
    return ids;
  }
  function notify(ctx){for(const paint of favouriteState(ctx).listeners)if(!paint())favouriteState(ctx).listeners.delete(paint);}
  function star(ctx,item,parent){
    const state=favouriteState(ctx),chosen=favourites(ctx).includes(item.id);
    const button=ctx.button(chosen?'★':'☆',()=>{
      const choice={selected:!favourites(ctx).includes(item.id),serial:++state.serial};state.pending.set(item.id,choice);notify(ctx);
      const task=state.queue.catch(()=>{}).then(async()=>{
        if(ctx.scopeAlive?.()===false)return;
        const latest=current(ctx),payload=structuredClone(latest),prefs=NextDictionary.preferences(latest);
        prefs.favourites=prefs.favourites.filter(id=>id!==item.id);if(choice.selected)prefs.favourites.push(item.id);payload.dictionary=prefs;
        try{
          const result=await ctx.save(payload,{base:latest.revision??0,backgroundSync:true});
          if(!['accepted','waiting'].includes(result?.outcome))throw new Error('Favourite could not be saved. Tap its star to try again.');
          state.base=[...prefs.favourites];
        }catch(error){if(ctx.scopeAlive?.()!==false){state.base=[...NextDictionary.preferences(current(ctx)).favourites];ctx.message(error.message||'Favourite could not be saved. Tap its star to try again.');}}
        finally{if(state.pending.get(item.id)===choice)state.pending.delete(item.id);if(ctx.scopeAlive?.()!==false)notify(ctx);}
      });state.queue=task;ctx.trackDraftQueue?.(task);return task;
    },parent,'favourite-star');button.dataset.favouriteSymbol=item.id;button.setAttribute('aria-label','Favourite '+item.label);button.setAttribute('aria-pressed',String(chosen));
    const paint=()=>{if(!button.isConnected||ctx.scopeAlive?.()===false)return false;const selected=favourites(ctx).includes(item.id);button.textContent=selected?'★':'☆';button.setAttribute('aria-pressed',String(selected));return true;};state.listeners.add(paint);
    return button;
  }
  function show(ctx,items){
    NextDictionary.show(ctx,items);
    if(items.length===1){star(ctx,items[0],ctx.main.querySelector('[data-show-page]'));ctx.shortcut&&ctx.button('Add shortcut',()=>ctx.shortcut({type:'picture',id:items[0].id,label:items[0].label}));}
  }
  async function render(ctx,index){
    const key=ctx.scopeKey;const s={...(sessions.get(key)||{group:null,query:'',count:24,error:'',attempt:null})};sessions.set(key,s);
    // Each retained history DOM owns its browse snapshot. Its handlers restore that
    // snapshot before rendering rather than using a later screen's category/query.
    const redraw=(patch={})=>{sessions.set(key,{...s,...patch});return render(ctx,index);};
    const payload=current(ctx),prefs=NextDictionary.preferences(payload);favouriteState(ctx).base=[...prefs.favourites];const all=index.symbols.map(p=>NextSymbolCatalogue.effective(p,prefs));
    const title=s.group===null?'Icons':s.query?'Search pictures':s.group==='All'?'All pictures':s.group;
    const scroll=window.scrollY;ctx.clear(title);ctx.refreshOnReturn?.(()=>redraw());
    for(const text of NextSymbolCatalogue.warnings(payload.dictionary))ctx.node('p',text,ctx.main,'notice');
    function card(item,parent){
      const article=ctx.node('article',undefined,parent,'dictionary-card');article.dataset.symbol=item.id;
      const choice=ctx.button('',()=>show(ctx,[item]),article,'dictionary-word');
      image(ctx,item,choice);ctx.node('span',item.label,choice);choice.setAttribute('aria-label','Show '+item.label);
      star(ctx,item,article);
    }
    const favouriteSection=ctx.node('section',undefined,ctx.main);ctx.node('h2','Favourites',favouriteSection);
    const favouriteGrid=ctx.node('div',undefined,favouriteSection,'dictionary-grid');favouriteGrid.dataset.dictionaryFavourites='';
    const empty=ctx.node('p','Tap ☆ beside pictures to keep them here.',favouriteSection);
    let shown='';
    const paintFavourites=()=>{
      if(!favouriteSection.isConnected||ctx.scopeAlive?.()===false)return false;
      const ids=favourites(ctx),key=JSON.stringify(ids);empty.hidden=ids.length>0;
      if(key!==shown){shown=key;favouriteGrid.replaceChildren();for(const id of ids){const item=all.find(p=>p.id===id&&!p.hidden);if(item)card(item,favouriteGrid);}}
      return true;
    };
    paintFavourites();favouriteState(ctx).listeners.add(paintFavourites);
    if(s.group===null){
      const section=ctx.node('section',undefined,ctx.main);ctx.node('h2','Categories',section);const grid=ctx.node('div',undefined,section,'dictionary-category-grid');
      const categoryCues={'Nature and animals':2256,'Music':2521,'Tools and gardening':2922};
      for(const group of index.categories){const button=ctx.button('',()=>redraw({group,query:'',count:24}),grid,'dictionary-category');const cue=all.find(p=>p.group===group&&!p.hidden&&p.sourceId===categoryCues[group])||all.find(p=>p.group===group&&!p.hidden);if(cue)image(ctx,cue,button);ctx.node('span',group,button);}
      ctx.button('All pictures',()=>redraw({group:'All',query:'',count:24}));

    }else{
      const results=NextSymbolCatalogue.search(index,s.query,s.group,prefs),section=ctx.node('section',undefined,ctx.main);const status=ctx.node('p',results.length+' pictures',section);status.setAttribute('role','status');
      const area=ctx.node('div',undefined,section);area.dataset.dictionaryResults='';
      const groups=new Map();for(const item of results){const name=NextSymbolCatalogue.pictureGroup(item);if(!groups.has(name))groups.set(name,[]);groups.get(name).push(item);}
      for(const [name,items] of groups){const group=ctx.node('section',undefined,area);group.dataset.pictureGroup=name;if(name)ctx.node('h2',name,group);const grid=ctx.node('div',undefined,group,'dictionary-grid');for(const item of items)card(item,grid);}
      if(!results.length)ctx.node('p','No pictures found. Clear search or choose a category.',section);
      ctx.button('Categories',()=>redraw({group:null,query:'',count:24}));
    }
    const form=ctx.node('form',undefined,ctx.main,'dictionary-compact-search');
    const label=ctx.node('label','Search pictures',form,'dictionary-search-label');label.htmlFor='dictionary-query';
    const row=ctx.node('div',undefined,form,'dictionary-search-row');const input=ctx.node('input',undefined,row);input.id=label.htmlFor;input.type='search';input.maxLength=1000;input.value=s.query;
    const submit=ctx.node('button','Search',row);submit.type='submit';form.onsubmit=e=>{e.preventDefault();return redraw({query:input.value,group:'All',count:24});};
    if(s.query)ctx.button('Clear search',()=>redraw({group:null,query:'',count:24}),form);
    if(title==='Icons'||s.count>24)window.scrollTo(0,scroll);
  }
  return {render,current,image,show,reset,favouriteIds:ctx=>{favouriteState(ctx).base=[...NextDictionary.preferences(current(ctx)).favourites];return favourites(ctx);}};
});
