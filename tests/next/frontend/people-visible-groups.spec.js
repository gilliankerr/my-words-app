const {test,expect}=require('@playwright/test');
test('People groups are visible without Find and preserve the selected group through reading and Back offline',async({page,context})=>{
  await page.route('**/api/workspaces/demo',async route=>{
    const response=await route.fetch(),workspace=await response.json();
    const people=[{id:'group-family',name:'Family fixture',groups:['Family'],text:'Family fixture\nMy cousin.'},{id:'group-club',name:'Club fixture',groups:['Book club'],text:'Club fixture\nReads books.'}];
    workspace.content.contacts=people;workspace.edition.content.contacts=people;workspace.editions[workspace.edition.id].content.contacts=people;
    await route.fulfill({response,json:workspace});
  });
  await page.setViewportSize({width:390,height:844});await page.goto('/#people');
  await page.getByLabel('Account',{exact:true}).fill('owner');await page.getByLabel('Password',{exact:true}).fill('owner-fictional-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  const groups=page.getByRole('navigation',{name:'People groups'});
  await expect(groups.getByRole('button',{name:'Family',exact:true})).toBeVisible();await expect(groups.getByRole('button',{name:'Book club',exact:true})).toBeVisible();const initial=await page.locator('[data-person]').count();
  await expect(page.getByLabel('Search People',{exact:true})).toBeHidden();await expect(page.getByText('Filter by group',{exact:true})).toHaveCount(0);
  await groups.getByRole('button',{name:'Book club',exact:true}).click();
  await expect(page.locator('[data-person]')).toHaveCount(1);await expect(page.locator('[data-person]')).toContainText('Club fixture');
  await expect(groups.getByRole('button',{name:'Book club',exact:true})).toBeFocused();
  await page.screenshot({path:'output/people-visible-groups-390.png',fullPage:true});
  await page.setViewportSize({width:768,height:1024});await page.screenshot({path:'output/people-visible-groups-768.png',fullPage:true});
  await context.setOffline(true);await page.locator('[data-person] .note-open').click();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Back',exact:true}).click();
  await expect(groups.getByRole('button',{name:'Book club',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-person]')).toHaveCount(1);
  await groups.getByRole('button',{name:'All people',exact:true}).click();await expect(page.locator('[data-person]')).toHaveCount(initial);
});
