(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NextSymbolCatalogue=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const aliases=(d,id)=>Array.isArray(d?.aliases?.[id])?d.aliases[id].filter(s=>typeof s==='string'):[];
  function warnings(d={}) {
    if(!object(d))return ['Saved picture settings need recovery. Original data is retained.'];
    const invalid=['favourites','selection','hidden'].some(k=>d[k]!==undefined&&(!Array.isArray(d[k])||d[k].some(s=>typeof s!=='string')))||['labels','messageText','aliases'].some(k=>d[k]!==undefined&&(!object(d[k])||Object.values(d[k]).some(v=>k==='aliases'?!Array.isArray(v)||v.some(s=>typeof s!=='string'):v!==null&&(typeof v!=='string'||!v.trim()))));
    return invalid?['Some saved picture settings need recovery. Original data is retained; export your book before repairing these settings.']:[];
  }
  function effective(symbol,dictionary={}) {
    dictionary=object(dictionary)?dictionary:{};
    const label=own(dictionary.labels,symbol.id)&&typeof dictionary.labels[symbol.id]==='string'&&dictionary.labels[symbol.id].trim()?dictionary.labels[symbol.id]:symbol.label;
    return {...symbol,label,messageText:own(dictionary.messageText,symbol.id)&&typeof dictionary.messageText[symbol.id]==='string'&&dictionary.messageText[symbol.id].trim()?dictionary.messageText[symbol.id]:label,hidden:Array.isArray(dictionary.hidden)&&dictionary.hidden.includes(symbol.id)};
  }
  function search(index,query='',group='All',dictionary={}) {
    const terms=norm(query).split(/\s+/).filter(Boolean);
    const categories=index.categories||[...new Set(index.symbols.map(s=>s.group))];
    return index.symbols.map(s=>effective(s,dictionary)).filter(s=>!s.hidden&&(group==='All'||s.group===group)&&terms.every(t=>norm([s.label,s.messageText,s.keywords,s.originalName,...aliases(dictionary,s.id)].join(' ')).includes(t))).sort((a,b)=>categories.indexOf(a.group)-categories.indexOf(b.group)||pictureGroup(a).localeCompare(pictureGroup(b),'en-CA')||a.label.localeCompare(b.label,'en-CA',{numeric:true})||a.id.localeCompare(b.id));
  }
  function pictureGroup(s) {
    if(s.group!=='Nature and animals')return '';
    const tags=s.originalCategory||'';
    if(/\banimal\b|\bmammal\b|\bbird\b|\binsect\b|\breptile\b|\bamphibian\b|\bmollusc\b|\bcrustacean\b|\bcoelenterata\b/i.test(tags))return 'Animals';
    if(/\btree\b|\bplant\b|\bflower\b|\bbush\b|\bfungus\b/i.test(tags))return 'Plants';
    if(/atmospheric|astronomy/i.test(tags))return 'Weather and sky';
    return 'Land and water';
  }
  function update(payload,id,patch) {
    if(typeof id!=='string'||!/^[-a-z0-9]+$/i.test(id)||['constructor','prototype','__proto__'].includes(id)||!object(patch))throw new Error('Invalid picture edit');
    for(const [key,value] of Object.entries(patch)) {
      if(!['label','messageText','aliases','hidden'].includes(key))throw new Error('Invalid picture field');
      if(['label','messageText'].includes(key)&&value!==null&&(typeof value!=='string'||!value.trim()||value.length>(key==='label'?200:4000)))throw new Error('Enter complete picture wording within the field limit.');
      if(key==='aliases'&&(!Array.isArray(value)||value.length>20||value.some(s=>typeof s!=='string'||!s.trim()||s.length>200)))throw new Error('Enter up to 20 search words, each within 200 characters.');
      if(key==='hidden'&&typeof value!=='boolean')throw new Error('Invalid picture visibility');
    }
    const result=clone(payload);result.dictionary??={};const d=result.dictionary;if(!object(d))throw new Error('Saved picture choices need recovery before editing.');
    for(const [key,value] of Object.entries(patch)) {
      if(key==='hidden'){if(d.hidden!==undefined&&!Array.isArray(d.hidden))throw new Error('Saved picture visibility needs recovery.');d.hidden??=[];d.hidden=value?[...new Set([...d.hidden,id])]:d.hidden.filter(x=>x!==id);}
      else {const field=key==='label'?'labels':key;d[field]??={};if(!object(d[field]))throw new Error('Saved picture wording needs recovery.');d[field][id]=value===null?null:typeof value==='string'?value.trim():clone(value);}
    }
    return result;
  }
  function validate(index) {
    if(index?.version!==2||index.provider!=='ARASAAC'||index.licence!=='CC BY-NC-SA 4.0'||index.licenceUrl!=='https://creativecommons.org/licenses/by-nc-sa/4.0/'||!Array.isArray(index.categories)||!index.categories.length||!Array.isArray(index.symbols)||!index.symbols.length)throw new Error('Invalid picture index');
    if(index.categories.some(s=>typeof s!=='string'||!s.trim())||new Set(index.categories).size!==index.categories.length)throw new Error('Invalid picture categories');
    const ids=new Set();
    for(const s of index.symbols){
      if(!/^icons-[a-z0-9-]+$/.test(s.id)||ids.has(s.id)||!Number.isSafeInteger(s.sourceId)||s.sourceId<1||s.schematic!==false||s.review!=='descriptive-reviewed'||!index.categories.includes(s.group)||typeof s.label!=='string'||!s.label.trim()||typeof s.keywords!=='string'||s.asset!==`/assets/dictionary/arasaac/${s.sourceId}_500.png`||s.source!==`https://static.arasaac.org/pictograms/${s.sourceId}/${s.sourceId}_500.png`||!/^[a-f0-9]{64}$/.test(s.sha256)||s.mediaType!=='image/png'||s.width!==500||s.height!==500||typeof s.originalName!=='string'||typeof s.originalCategory!=='string'||/\b(flag|country map)\b/i.test(s.originalName))throw new Error('Invalid descriptive picture');
      ids.add(s.id);
    }
    return index;
  }
  function assets(index){validate(index);return ['/assets/dictionary/manifest.json','/assets/dictionary/ARASAAC-LICENSE.txt','/assets/dictionary/ARASAAC-CREDITS.txt',...new Set(index.symbols.map(s=>s.asset))];}
  return {effective,search,pictureGroup,update,validate,assets,aliases,warnings};
});
