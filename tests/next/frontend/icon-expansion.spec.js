const { openPreparation } = require('../saved-shortcuts');
const {test,expect}=require('@playwright/test');
const manifest=require('../../../app-next/assets/dictionary/manifest.json');
test('Settings opens all picture rows and searches the full catalogue',async({page},testInfo)=>{
  await page.goto('/editor.html');await page.getByLabel('Account',{exact:true}).fill('owner');await page.getByLabel('Password',{exact:true}).fill('owner-fictional-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await openPreparation(page);await page.getByRole('button',{name:'Change picture labels and favourites',exact:true}).click();await expect(page.locator('.dictionary-editor-row')).toHaveCount(manifest.symbols.length);
  await expect(page.getByRole('button',{name:'Show more pictures',exact:true})).toHaveCount(0);
  await page.getByLabel('Find a picture to change').fill('elephant');await page.getByRole('button',{name:'Find pictures',exact:true}).click();
  await expect(page.getByRole('button',{name:'Change Elephant',exact:true})).toBeVisible();await expect(page.locator('.dictionary-editor-row')).toHaveCount(1);
});
test('large categories show all pictures and preserve the revealed picture on browser return',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#icons');await page.getByLabel('Account',{exact:true}).fill('reader');await page.getByLabel('Password',{exact:true}).fill('reader-fictional-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  for(const [name,id] of [['Nature and animals',2256],['Music',2521],['Tools and gardening',2922]])await expect(page.getByRole('button',{name,exact:true}).locator('img')).toHaveAttribute('src',`/assets/dictionary/arasaac/${id}_500.png`);
  await page.screenshot({path:testInfo.outputPath('icons-phone.png'),fullPage:true});
  await page.getByRole('button',{name:'Personal care',exact:true}).click();
  await expect(page.locator('[data-dictionary-results] [data-symbol]')).toHaveCount(manifest.symbols.filter(s=>s.group==='Personal care').length);
  await expect(page.getByRole('button',{name:'Show more pictures',exact:true})).toHaveCount(0);
  const choice=page.locator('[data-dictionary-results] .dictionary-word').nth(30),label=await choice.getAttribute('aria-label');
  await choice.click();await expect(page.locator('[data-show-page]')).toBeVisible();await page.goBack();
  await expect(page.getByRole('button',{name:label,exact:true})).toBeFocused();await expect(page.locator('[data-dictionary-results] [data-symbol]')).toHaveCount(manifest.symbols.filter(s=>s.group==='Personal care').length);
  await page.getByLabel('Search pictures',{exact:true}).fill('elephant');await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByRole('button',{name:'Show Elephant',exact:true}).click();await expect(page.locator('[data-show-page] img')).toHaveJSProperty('naturalWidth',500);
});
