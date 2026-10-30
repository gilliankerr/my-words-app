const H = require('../../../app-next/js/home-collections');
const E = require('../../../app-next/js/expression');
const G = require('../../../app-next/js/word-groups');
const B = require('../../../app-next/js/book-records');
const { randomUUID } = require('node:crypto');
const { makeFixtures } = require('../fixtures');
const { MemoryRepository } = require('../harness/memory-repository');
const { WorkspaceService } = require('../../../server/next/workspace-service');
function ctx(records = []) { return { scopeKey: 'fictional', records: () => records, project: () => ({extra:[]}) }; }
test('combined favourites include original stars, book highlights and checked shopping without hidden/recovery content', () => {
  const records = [
    {id:'note',kind:'note',category:'notes',text:'Complete note',favourite:true},
    {id:'person',kind:'person',category:'people',name:'Pat',text:'Pat',groups:['Favourites']},
    {id:'book',kind:'phrase',category:'home',text:'Lamp',highlight:true},
    {id:'shopping',kind:'shopping',category:'shopping-list',text:'Milk',checked:true},
    {id:'hidden',kind:'note',category:'notes',text:'Hidden',favourite:true,hidden:true},
    {id:'deleted',kind:'note',category:'notes',text:'Deleted',favourite:true,tombstone:true}
  ];
  expect(H.favouriteEntries(ctx(records)).map(e => e.target.id)).toEqual(['person','note','book','shopping']);
  expect(records[2].highlight).toBe(true);
});
test('legacy two Home positions retain their order and unavailable references without changing stored envelopes', () => {
  const records = [{id:G.slotId(2),kind:'preference',category:'home-slot:2',groupId:'gone',groupLabel:'Old choice',future:{keep:true}}];
  const choices = H.shortcutTargets(ctx(records));
  expect(choices).toEqual([{type:'group',id:'gone',label:'Old choice'}]);
  expect(records[0].future).toEqual({keep:true});
});
test('shortcut reorder and removal preserve opaque fields, and stored list overrides legacy slots', () => {
  const records = [{...B.addition('preference','shortcuts','Shortcuts',H.SHORTCUT_ID),targets:[{type:'note',id:'a',label:'A',future:1},{type:'person',id:'b',label:'B'}],future:{keep:true},revision:4}];
  const changed = H.changeShortcuts(records[0], [records[0].targets[1],records[0].targets[0]]);
  expect(changed.future).toEqual({keep:true}); expect(changed.targets[1].future).toBe(1);
  expect(H.shortcutTargets(ctx(records)).map(t => t.id)).toEqual(['a','b']);
  expect(() => B.validatePayload({...records[0],targets:[{type:'script',id:'x',label:'Invalid'}]})).toThrow();
});
test('new preference scopes use owner/revision checks and export complete envelopes',async()=>{
  const f=makeFixtures(),service=new WorkspaceService(new MemoryRepository(f.workspaces));
  for(const category of ['shortcuts','book-highlights']){
    const p={...B.addition('preference',category,category,randomUUID()),...(category==='shortcuts'?{targets:[{type:'note',id:'note',label:'Note'}]}:{choices:{'word:home:1':true}}),future:{keep:true}};
    const request={recordId:p.id,base:0,operation:randomUUID(),payload:p};
    expect((await service.save('demo','reader',request)).outcome).toBe('accepted');
    await expect(service.save('demo','outsider',{...request,operation:randomUUID()})).rejects.toMatchObject({status:403});
    const stale=await service.save('demo','reader',{...request,operation:randomUUID(),payload:{...p,text:'Later'}});
    expect(stale.outcome).toBe('conflict');expect(stale.latest.payload.future).toEqual({keep:true});
    const M=require('../../../app-next/js/model');const pack=M.validatePackage(JSON.stringify(M.exportPackage(await service.read('demo','reader'))),'demo','owner');expect(B.latest(pack.workspace.records[p.id]).payload).toEqual(p);
  }
});

test('book highlights keep the latest rapid choice and recover the earlier selection on failed local saving',async()=>{
  const records=[],messages=[],scopeKey=randomUUID(),c={...ctx(records),scopeKey,message:text=>messages.push(text),scopeAlive:()=>true,trackDraftQueue:()=>{}};
  let release; const gate=new Promise(resolve=>release=resolve);let calls=0;
  c.save=async p=>{calls++;if(calls===1)await gate;records.splice(0,records.length,{...p,revision:calls});return {outcome:'waiting'};};
  const p={id:'word',kind:'phrase',category:'home',text:'Lamp',highlight:false};
  const first=H.toggleBook(c,p);await Promise.resolve();expect(H.bookSelected(c,p)).toBe(true);const second=H.toggleBook(c,p);expect(H.bookSelected(c,p)).toBe(false);release();await first;expect(H.bookSelected(c,p)).toBe(false);await second;expect(records[0].choices.word).toBe(false);
  c.save=async()=>{throw Error('Fictional storage failure');};await H.toggleBook(c,p);expect(H.bookSelected(c,p)).toBe(false);expect(messages).toContain('Fictional storage failure');
});

test('malformed retained shortcut preferences fail visibly without replacing the saved record',()=>{
  const p={...B.addition('preference','shortcuts','Shortcuts',H.SHORTCUT_ID),targets:'damaged retained value',future:{keep:true}};
  expect(()=>H.shortcutTargets(ctx([p]))).toThrow('Invalid shortcut choices');expect(p.targets).toBe('damaged retained value');expect(p.future).toEqual({keep:true});
});
