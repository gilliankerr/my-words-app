const {test,expect}=require('@playwright/test');
async function open(page){await page.goto('/#icons');await page.getByLabel('Account',{exact:true}).fill('reader');await page.getByLabel('Password',{exact:true}).fill('reader-fictional-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Icons',exact:true})).toBeVisible();}
async function search(page,text,category='All'){await page.getByLabel('Search pictures',{exact:true}).fill(text);await page.getByRole('button',{name:'Search',exact:true}).click();await expect(page.getByLabel('Search pictures',{exact:true})).toHaveValue(text);}

test('Icons uses one compact search row without composition or category dropdown',async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  await expect(page.getByLabel('Search category',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Clear search',exact:true})).toHaveCount(0);
  const input=await page.getByLabel('Search pictures',{exact:true}).boundingBox(),button=await page.getByRole('button',{name:'Search',exact:true}).boundingBox();
  expect(Math.abs(input.y-button.y)).toBeLessThan(2);expect(input.height).toBeGreaterThanOrEqual(44);expect(button.height).toBeGreaterThanOrEqual(44);
  expect((await page.locator('.dictionary-compact-search').boundingBox()).height).toBeLessThan(110);
  await page.getByRole('button',{name:'Personal care',exact:true}).click();await expect(page.getByRole('button',{name:'Compose a message',exact:true})).toHaveCount(0);
  await expect(page.getByText('Picture dictionary',{exact:true})).toHaveCount(0);
  await page.screenshot({path:'test-results/next/icons-simplified-phone.png',fullPage:true});
  await page.locator('.dictionary-compact-search').screenshot({path:'test-results/next/icons-compact-search.png'});
});
test('Icons uses Categories and compact whole labelled picture choices',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  await page.getByRole('button',{name:'Personal care',exact:true}).click();
  await expect(page.getByRole('button',{name:'Categories',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Picture categories',exact:true})).toHaveCount(0);
  const geometry=await page.locator('[data-dictionary-results] .dictionary-word').evaluateAll(buttons=>buttons.map(button=>{const rect=button.getBoundingClientRect(),img=button.querySelector('img');return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,imageHeight:img?.getBoundingClientRect().height,overflow:button.scrollWidth>button.clientWidth,border:getComputedStyle(button).borderTopWidth};}));
  expect(new Set(geometry.filter(b=>b.y===geometry[0].y).map(b=>b.x)).size).toBe(3);
  expect(geometry.every(b=>b.width>=44&&b.height>=44&&!b.overflow&&b.imageHeight<=80&&b.border==='0px')).toBe(true);
  await page.screenshot({path:testInfo.outputPath('icons-compact-phone.png'),fullPage:true});
  await page.setViewportSize({width:768,height:1024});await page.screenshot({path:testInfo.outputPath('icons-compact-tablet.png'),fullPage:true});
});
test('descriptive pictures search locally and retain search and focus after page Show',async({page})=>{
  await open(page);await expect(page.locator('.dictionary-category')).toHaveCount(15);await search(page,'shower','Personal care');await expect(page.locator('[data-dictionary-results]').getByRole('button',{name:'Show Shower',exact:true})).toHaveCount(1);
  const shower=page.locator('[data-dictionary-results]').getByRole('button',{name:'Show Shower',exact:true});await shower.click();await expect(page.locator('[data-show-page]')).toContainText('Shower');await expect(page.locator('[data-show-page] img')).toHaveAttribute('src','/assets/dictionary/arasaac/27728_500.png');await page.keyboard.press('Escape');await expect(shower).toBeFocused();await search(page,'CAFE');await expect(page.locator('[data-dictionary-results]')).toContainText('Café');
});
test('ordered favourites and all active images survive offline reload without message composition',async({page,context})=>{
  await open(page);await page.getByRole('button',{name:'Personal care',exact:true}).click();
  for(const word of ['Shower','Bath']){await page.getByRole('button',{name:'Show '+word,exact:true}).click();await page.getByRole('button',{name:'Favourite '+word,exact:true}).click();await expect(page.getByRole('button',{name:'Favourite '+word,exact:true})).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape');}
  await expect(page.getByRole('button',{name:'Compose a message',exact:true})).toHaveCount(0);
  await expect(page.getByText('My message',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Categories',exact:true}).click();
  await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await page.reload();await expect(page.locator('[data-dictionary-favourites] [data-symbol]')).toHaveCount(2);await page.getByRole('button',{name:'Personal care',exact:true}).click();
  const loaded=await page.evaluate(async()=>{const index=await NextDictionary.load();return Promise.all(index.symbols.map(s=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i.naturalWidth===500);i.onerror=()=>resolve(false);i.src=s.asset;})));});expect(loaded).toHaveLength(require('../../../app-next/assets/dictionary/manifest.json').symbols.length);expect(loaded.every(Boolean)).toBe(true);
});
test('late loads preserve Home; private search makes no provider request; reset clears picture state',async({page})=>{
  await open(page);await page.getByRole('link',{name:'Home',exact:true}).click();await page.reload();await page.evaluate(()=>{const fetch=globalThis.fetch.bind(globalThis);globalThis.fetch=(u,...a)=>u===NextDictionary.MANIFEST?new Promise(resolve=>{globalThis.releaseDictionaryLoad=async()=>resolve(await fetch(u,...a));}):fetch(u,...a);});await page.getByRole('button',{name:'Icons Picture dictionary',exact:true}).click();await page.waitForFunction(()=>typeof releaseDictionaryLoad==='function');await page.getByRole('link',{name:'Home',exact:true}).click();await page.evaluate(()=>releaseDictionaryLoad());await expect(page.getByRole('heading',{name:'Home',exact:true})).toBeVisible();await page.getByRole('button',{name:'Icons Picture dictionary',exact:true}).click();const requests=[];page.on('request',r=>requests.push(r.url()));await search(page,'synthetic-only-private-needle');await expect(page.locator('[data-dictionary-results] [data-symbol]')).toHaveCount(0);expect(requests.some(u=>u.includes('synthetic-only-private-needle'))).toBe(false);expect(requests.every(u=>new URL(u).origin===new URL(page.url()).origin)).toBe(true);await search(page,'shower');await page.locator('[data-dictionary-results]').getByRole('button',{name:'Show Shower',exact:true}).click();await page.evaluate(()=>NextDictionary.reset());await expect(page.locator('.dictionary-show')).toHaveCount(0);
});
test.describe('image failure fallback',()=>{test.use({serviceWorkers:'block'});test('failed images retain complete labelled controls and enlarged text reflows',async({page})=>{
  await page.addInitScript(()=>{delete Navigator.prototype.serviceWorker;});await page.route('**/assets/dictionary/arasaac/27728_500.png',r=>r.abort());await open(page);await search(page,'shower');const shower=page.locator('[data-dictionary-results]').getByRole('button',{name:'Show Shower',exact:true});await expect(shower.locator('img')).toHaveCount(0);await shower.click();await expect(page.locator('[data-show-page]')).toContainText('Shower');await page.keyboard.press('Escape');
  for(const width of [320,390,430,768]){await page.setViewportSize({width,height:844});await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('.dictionary-card button').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().width>=44&&e.getBoundingClientRect().height>=44))).toBe(true);}
});});
