const {test,expect}=require('@playwright/test');
async function open(page){await page.goto('/#icons');await page.getByLabel('Account',{exact:true}).fill('owner');await page.getByLabel('Password',{exact:true}).fill('owner-fictional-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Personal care',exact:true}).click();}
test('rapid stars update immediately with favourites visible before a delayed cloud save and survive offline reload',async({page,context})=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  const initial=await page.locator('[data-dictionary-favourites] [data-symbol]').count();let release,held=false;const barrier=new Promise(resolve=>release=resolve);
  await page.route('**/api/workspaces/demo/operations',async route=>{if(!held){held=true;await barrier;}await route.continue();});
  const area=page.locator('[data-dictionary-results]');const shower=area.getByRole('button',{name:'Favourite Toothpaste',exact:true}),bath=area.getByRole('button',{name:'Favourite Toothbrush',exact:true});
  await shower.click();await expect(shower).toHaveAttribute('aria-pressed','true',{timeout:500});
  await expect(page.locator('[data-dictionary-favourites]').getByRole('button',{name:'Show Toothpaste',exact:true})).toBeVisible({timeout:500});
  await bath.click();await expect(bath).toHaveAttribute('aria-pressed','true',{timeout:500});
  await shower.click();await expect(shower).toHaveAttribute('aria-pressed','false',{timeout:500});
  await shower.click();await expect(shower).toHaveAttribute('aria-pressed','true',{timeout:500});
  await expect(page.locator('[data-dictionary-favourites] [data-symbol]')).toHaveCount(initial+2);
  await page.waitForFunction(async()=>{const identity=await new NextLocalStore().open().then(s=>s.identity());const s=await new NextLocalStore().open();const data=await s.read(identity.actor,identity.workspace);return Object.values(data.drafts).some(d=>d.payload.dictionary?.favourites.length>=2);});
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'output/picture-stars-immediate-390.png',fullPage:false});
  await page.setViewportSize({width:768,height:1024});await page.screenshot({path:'output/picture-stars-immediate-768.png',fullPage:false});
  release();await page.unrouteAll({behavior:'wait'});
  await page.getByRole('button',{name:'Categories',exact:true}).click();
  await expect(page.locator('[data-dictionary-favourites] [data-symbol]')).toHaveCount(initial+2);
  await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await page.reload();
  await expect(page.locator('[data-dictionary-favourites] [data-symbol]')).toHaveCount(initial+2);
});
test('a failed local star save rolls back its visible selection and explains recovery',async({page})=>{
  await open(page);await page.evaluate(()=>{NextLocalStore.prototype.update=async()=>{throw new Error('Storage unavailable. Tap the star again to retry.');};});
  const star=page.locator('[data-dictionary-results]').getByRole('button',{name:'Favourite Cotton swabs',exact:true});
  await star.click();await expect(page.locator('#status')).toContainText('Storage unavailable');
  await expect(star).toHaveAttribute('aria-pressed','false');await expect(star).toBeEnabled();
});
