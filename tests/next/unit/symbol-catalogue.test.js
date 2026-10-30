const C = require('../../../app-next/js/symbol-catalogue');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
test('User curation excludes gesture and greeting filler without a numeric quota',()=>{
  const brief=require('../../../data/icon-curation.json'),index=require('../../../app-next/assets/dictionary/manifest.json');
  expect(brief.target).toBeUndefined();
  for(const label of ['Yes','No','Hello','Goodbye','Please','Thank you','Handshake','First','Last'])expect(index.symbols.some(s=>s.label===label)).toBe(false);
  expect(index.symbols.map(s=>s.id)).toEqual(brief.concepts.map(c=>c.id));
  expect(new Set(brief.concepts.map(c=>c.id)).size).toBe(brief.concepts.length);
  for(const category of brief.categories)expect(brief.concepts.some(c=>c.categoryId===category.id)).toBe(true);
  for(const excluded of brief.excludedConcepts)expect(index.symbols.some(s=>s.id===excluded.id)).toBe(false);
});
test('all active assets are descriptive, unique, reviewed PNGs with verified provenance',()=>{
  const index=require('../../../app-next/assets/dictionary/manifest.json');C.validate(index);expect(index.symbols).toHaveLength(require('../../../data/icon-curation.json').concepts.length);expect(index.categories).toEqual(require('../../../data/icon-curation.json').categories.map(c=>c.label));
  expect(new Set(index.symbols.map(s=>s.sourceId)).size).toBe(index.symbols.length);
  for(const s of index.symbols){const bytes=fs.readFileSync(path.join(__dirname,'../../../app-next',s.asset));expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(s.sha256);expect(require('../harness/png').validatePNG(bytes)).toEqual({width:500,height:500});}
  expect(C.assets(index)).toHaveLength(index.symbols.length+3);
  for(const patch of [{schematic:true},{asset:'https://example.org/picture.png'},{sourceId:NaN},{review:'candidate'},{sha256:'bad'}])expect(()=>C.validate({...index,symbols:[{...index.symbols[0],...patch}]})).toThrow();
});
test('personal changes retain unknown IDs, full envelope and reset only requested wording',()=>{
  const before={future:{keep:true},dictionary:{favourites:['old'],selection:['missing'],future:{keep:true}}};
  const after=C.update(before,'icon-home-door',{label:'Front door',messageText:'Please open the door.',aliases:['entrée'],hidden:true});
  expect(after.future).toEqual(before.future);expect(after.dictionary.selection).toEqual(['missing']);expect(after.dictionary.future).toEqual({keep:true});
  expect(C.effective({id:'icon-home-door',label:'Door'},after.dictionary)).toMatchObject({label:'Front door',messageText:'Please open the door.',hidden:true});
  const reset=C.update(after,'icon-home-door',{label:null,messageText:null});
  expect(reset.dictionary.hidden).toEqual(['icon-home-door']);expect(reset.dictionary.aliases['icon-home-door']).toEqual(['entrée']);
  expect(before.dictionary.labels).toBeUndefined();
});
test('input validation and visible local search retain safe complete wording',()=>{
  for(const patch of [{label:''},{aliases:['a'.repeat(201)]},{hidden:'yes'},JSON.parse('{"__proto__":"bad"}')])expect(()=>C.update({},'icon-home-door',patch)).toThrow();
  const index={symbols:[{id:'icon-home-door',label:'Door',keywords:'entrance',group:'At home'},{id:'icon-home-bed',label:'Bed',keywords:'sleep',group:'At home'}]};
  const p=C.update({},'icon-home-door',{label:'<img onerror="bad">',aliases:['entrée'],hidden:false});
  expect(C.search(index,'ENTREE','All',p.dictionary)).toHaveLength(1);
  expect(C.search(index,'door','All',C.update(p,'icon-home-door',{hidden:true}).dictionary)).toEqual([]);
});
test('malformed retained overlays cannot blank the dictionary or be silently rewritten',()=>{
  const index={symbols:[{id:'icons-home-door',label:'Door',keywords:'entrance',group:'At home'}]};
  const corrupt={hidden:{unknown:'keep'},aliases:{'icons-home-door':{}},labels:{'icons-home-door':null}};
  expect(C.search(index,'door','All',corrupt)).toHaveLength(1);
  expect(corrupt.hidden).toEqual({unknown:'keep'});
});
test('same-account edits retain both picture preference proposals and reset null survives preservation/export',async()=>{
  const {WorkspaceService}=require('../../../server/next/workspace-service'),{MemoryRepository}=require('../harness/memory-repository'),{makeFixtures}=require('../fixtures'),M=require('../../../app-next/js/model'),B=require('../../../app-next/js/book-records'),D=require('../../../app-next/js/dictionary'),{randomUUID}=require('node:crypto');
  const service=new WorkspaceService(new MemoryRepository(makeFixtures().workspaces)),payload={...B.addition('preference','dictionary','Picture dictionary',D.PREFERENCE_ID,'Picture dictionary'),future:{keep:true},dictionary:{favourites:['missing'],messageText:{'icons-personal-care-shower':'Please help me.'}}};
  await service.save('demo','owner',{recordId:payload.id,base:0,operation:randomUUID(),payload});
  const first=C.update(payload,'icons-personal-care-shower',{messageText:null}),second=C.update(payload,'icons-personal-care-shower',{label:'Wash'});
  const outcomes=await Promise.all([service.save('demo','owner',{recordId:payload.id,base:1,operation:randomUUID(),payload:first}),service.save('demo','owner',{recordId:payload.id,base:1,operation:randomUUID(),payload:second})]);expect(outcomes.map(r=>r.outcome).sort()).toEqual(['accepted','conflict']);
  const state=await service.read('demo','owner'),pkg=M.exportPackage(state),record=pkg.workspace.records[payload.id];expect(record.revisions.at(-1).payload.dictionary.messageText['icons-personal-care-shower']).toBeNull();expect(record.revisions.at(-1).payload.future).toEqual({keep:true});expect(pkg.workspace.conflicts[0].proposal.payload.dictionary.labels).toEqual({'icons-personal-care-shower':'Wash'});
});
