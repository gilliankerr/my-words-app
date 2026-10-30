const {test,expect}=require('@playwright/test');
async function signIn(page){await page.goto('/#home');await page.getByLabel('Account',{exact:true}).fill('reader');await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Home',exact:true})).toBeVisible();await page.evaluate(()=>navigator.serviceWorker.ready);}
test('Home has separate Favourites and Shortcuts buttons',async({page})=>{
  await signIn(page);const actions=page.locator('.home-actions');
  await expect(actions.getByRole('button',{name:'Favourites',exact:true})).toBeVisible();
  await expect(actions.getByRole('button',{name:'Shortcuts',exact:true})).toBeVisible();
  await expect(actions.getByRole('button',{name:'Choose favourite',exact:true})).toHaveCount(0);
  for(const width of [320,390,768]){await page.setViewportSize({width,height:844});const boxes=await actions.locator('button').evaluateAll(bs=>bs.slice(0,3).map(b=>({top:b.getBoundingClientRect().top,height:b.getBoundingClientRect().height})));expect(new Set(boxes.map(b=>b.top)).size).toBe(1);expect(boxes.every(b=>b.height>=44)).toBe(true);await page.screenshot({path:`test-results/next/home-collections-${width}.png`,fullPage:true});}
  await page.setViewportSize({width:320,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='32px');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
async function seed(page){
  await page.goto('/#home');
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  return page.evaluate(async()=>{
    const repo=new NextRepository();await repo.signIn('reader','reader-fictional-only');const prefix='Collection '+crypto.randomUUID().slice(0,8);
    const payloads=[
      {...NextBook.addition('note','notes','Complete wording — Après l’école.',crypto.randomUUID(),prefix+' note'),title:prefix+' note',favourite:true,future:{keep:true}},
      {...NextBook.addition('person','people',prefix+' person\nRecognition clue',crypto.randomUUID(),prefix+' person'),groups:['Family','Favourites']},
      {...NextBook.addition('group','quick-words','Tea\nPlease',crypto.randomUUID(),prefix+' group'),words:[{text:'Tea'},{text:'Please'}],favourite:true},
      {...NextBook.addition('notebook','notebooks',prefix+' notebook',crypto.randomUUID(),prefix+' notebook'),notebook:{title:prefix+' notebook',sections:[{name:'Conversation',words:['Complete phrase']}]},favourite:true}
    ];
    const manifest=await (await fetch('/assets/dictionary/manifest.json')).json();const picture=manifest.symbols[0];
    const snapshot=await repo.request('workspaces/demo'),current=Object.values(snapshot.records).find(r=>NextBook.latest(r).payload.category==='dictionary');
    const pref=current?NextBook.latest(current).payload:{...NextBook.addition('preference','dictionary','Picture dictionary',NextDictionary.PREFERENCE_ID),dictionary:{favourites:[]}};
    pref.dictionary={...pref.dictionary,favourites:[...new Set([...(pref.dictionary?.favourites||[]),picture.id])]};
    for(const p of payloads)await repo.request('workspaces/demo/operations',{recordId:p.id,base:0,operation:crypto.randomUUID(),payload:p});
    await repo.request('workspaces/demo/operations',{recordId:pref.id,base:current?.current||0,operation:crypto.randomUUID(),payload:pref});
    return {prefix,picture:picture.label,pictureId:picture.id,note:payloads[0].id,person:payloads[1].id};
  });
}
async function signInSeeded(page){await page.getByLabel('Account',{exact:true}).fill('reader');await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Home',exact:true})).toBeVisible();await page.evaluate(()=>navigator.serviceWorker.ready);}
const home=page=>page.getByRole('link',{name:'Home',exact:true}).click();

test('Favourites combines stars, persisted book highlights and shopping ticks with offline Back recovery',async({page,context})=>{
  const f=await seed(page);await signInSeeded(page);
  await page.getByRole('button',{name:/Communication book Words/}).click();await page.getByRole('button',{name:'Greetings & Farewells',exact:true}).click();
  const word=page.locator('.words button[aria-pressed="false"]').first();const text=await word.innerText();await word.click();await expect(page.getByRole('button',{name:text,exact:true})).toHaveAttribute('aria-pressed','true');
  await home(page);await page.getByRole('button',{name:'Shopping list',exact:true}).click();
  const item=page.locator('.shopping-item').filter({has:page.locator('input:not(:checked)')}).first(),shoppingText=await item.locator('label span').innerText();await item.getByRole('checkbox').check();
  await expect(page.locator('#status')).toContainText(/saved/i);
  await home(page);await page.getByRole('button',{name:'Favourites',exact:true}).click();
  for(const section of ['People','Notes','Pictures','Situation notebooks','Word groups','Communication book','Shopping list'])await expect(page.getByRole('heading',{name:section,exact:true})).toBeVisible();
  for(const kind of ['note','person','group','notebook'])await expect(page.getByRole('button',{name:f.prefix+' '+kind,exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Show '+f.picture,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:text,exact:true})).toBeVisible();
  await expect(page.locator('[data-favourite-item^="shopping:"]').filter({hasText:shoppingText})).toBeVisible();
  for(const width of [320,390,768]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('.favourites-collection button').evaluateAll(bs=>bs.every(b=>b.getBoundingClientRect().height>=44))).toBe(true);if(width!==320)await page.screenshot({path:`test-results/next/favourites-${width}.png`,fullPage:true});}
  await page.getByRole('button',{name:f.prefix+' note',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('main > .passage')).toHaveText('Complete wording — Après l’école.');
  await page.goBack();await expect(page.getByRole('heading',{name:'Favourites',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:f.prefix+' note',exact:true})).toBeFocused();
  await page.evaluate(()=>NextTrial.exportText());
  await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'Favourites',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:text,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:f.prefix+' group',exact:true})).toBeVisible();
  await home(page);await page.getByRole('button',{name:/Communication book Words/}).click();await page.getByRole('button',{name:'Greetings & Farewells',exact:true}).click();await expect(page.getByRole('button',{name:text,exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:text,exact:true}).click();
  await home(page);await page.getByRole('button',{name:'Shopping list',exact:true}).click();await page.getByRole('checkbox',{name:shoppingText,exact:true}).uncheck();await expect(page.locator('#status')).toContainText(/saved/i);
  await home(page);await page.getByRole('button',{name:'Favourites',exact:true}).click();await expect(page.locator('[data-favourite-item^="book:"]').filter({hasText:text})).toHaveCount(0);await expect(page.locator('[data-favourite-item^="shopping:"]').filter({hasText:shoppingText})).toHaveCount(0);
});

test('Shortcuts preview, order, remove and Undo preserve original content through offline reload',async({page,context})=>{
  const f=await seed(page);await signInSeeded(page);await page.getByRole('button',{name:'Shortcuts',exact:true}).click();
  for(const [section,label]of [['Notes',f.prefix+' note'],['People',f.prefix+' person']]){
    await page.getByRole('button',{name:'Add shortcut',exact:true}).click();await page.getByLabel('Section',{exact:true}).selectOption(section);await page.getByLabel('Find saved content',{exact:true}).fill(label);await page.getByRole('button',{name:'Search',exact:true}).click();
    await page.getByRole('button',{name:label,exact:true}).click();await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();await page.getByRole('button',{name:'Add to Shortcuts',exact:true}).click();await expect(page.locator('.shortcuts-collection')).toContainText(label);
  }
  await context.setOffline(true);await page.getByRole('button',{name:'Edit shortcuts',exact:true}).click();
  const person=page.locator('[data-shortcut="person:'+f.person+'"]');await person.getByRole('button',{name:'Move up: '+f.prefix+' person',exact:true}).click();
  await expect(page.locator('.shortcut-row > button')).toHaveText([f.prefix+' person',f.prefix+' note']);
  await person.getByRole('button',{name:'Remove shortcut',exact:true}).click();await expect(person).toHaveCount(0);await page.getByRole('button',{name:'Undo shortcut change',exact:true}).click();
  await expect(page.locator('.shortcut-row > button')).toHaveText([f.prefix+' person',f.prefix+' note']);
  await page.reload();await expect(page.getByRole('heading',{name:'Shortcuts',exact:true})).toBeVisible();await expect(page.locator('.shortcut-row > button')).toHaveText([f.prefix+' person',f.prefix+' note']);
  for(const width of [390,768]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/next/shortcuts-${width}.png`,fullPage:true});}
  await page.getByRole('button',{name:f.prefix+' note',exact:true}).click();await expect(page.locator('main > .passage')).toHaveText('Complete wording — Après l’école.');await page.goBack();await expect(page.getByRole('heading',{name:'Shortcuts',exact:true})).toBeVisible();
  const backup=await page.evaluate(async()=>JSON.parse(await NextTrial.exportText()));const records=Object.values(backup.workspace.records).map(r=>r.revisions.find(v=>v.number===r.current).payload);
  expect(records.find(p=>p.id===f.note)).toMatchObject({future:{keep:true},text:'Complete wording — Après l’école.'});
});

test('an unconfirmed shortcut edit keeps the list usable and reports recovery',async({page})=>{
  await signIn(page);
  await page.evaluate(async()=>{
    const main=document.getElementById('main'),node=(tag,text,parent,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;parent?.append(e);return e;};
    const note={id:'fictional-failure-note',kind:'note',category:'notes',text:'Retained wording',title:'Retained note'};
    const pref={...NextBook.addition('preference','shortcuts','Shortcuts',NextHomeCollections.SHORTCUT_ID),targets:[{type:'note',id:note.id,label:'Retained note'}],revision:1};
    const ctx={scopeKey:'fictional-failure',main,node,clear:title=>{main.replaceChildren();node('h1',title,main);},records:()=>[note,pref],project:()=>({extra:[]}),scopeAlive:()=>true,button:(label,fn,parent=main,cls)=>{const b=node('button',label,parent,cls);b.type='button';b.onclick=()=>Promise.resolve().then(fn).catch(ctx.report);return b;},save:async()=>({outcome:'failed'}),message:text=>document.getElementById('status').textContent=text,report:error=>document.getElementById('status').textContent=error.message};
    await NextHomeCollections.shortcuts(ctx,true);
  });
  await page.getByRole('button',{name:'Remove shortcut',exact:true}).click();
  await expect(page.locator('#status')).toContainText('not confirmed');
  await expect(page.getByRole('button',{name:'Retained note',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Remove shortcut',exact:true})).toBeEnabled();
});
