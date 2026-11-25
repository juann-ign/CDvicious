const {test,expect,collection,cards,openRail,go}=require('./support/b2-harness.cjs');
const {makeAlbum,coverage}=require('../fixtures/collection-filters.cjs');
const genre=p=>collection(p).getByRole('combobox',{name:'Filtrar por género',exact:true});
const frame=p=>collection(p).locator('[data-page-size]');
const query=p=>collection(p).getByRole('searchbox',{name:'Buscar artista o álbum',exact:true});
async function open(p){await openRail(p);await go(p,'Colección',3);await expect(cards(p).first()).toBeVisible();}
async function fits(p){
 const result=await frame(p).evaluate(n=>{const r=n.getBoundingClientRect();const footer=document.querySelector('[data-global-player]').getBoundingClientRect();return{fits:[...n.querySelectorAll('button')].every(c=>{const b=c.getBoundingClientRect();return b.top>=r.top&&b.bottom<=r.bottom+1&&b.left>=r.left&&b.right<=r.right+1;}),footer:r.bottom<=footer.top,overflow:n.scrollWidth<=n.clientWidth};});
 expect(result).toEqual({fits:true,footer:true,overflow:true});
}
test('metal: resting controls meet contrast and keyboard focus stays visible; album page uses metal around acrylic',async({page})=>{
 await open(page);
 const contrasts=await page.locator('[aria-label="Navegación por capítulos"] button, [class*="profileTrigger"] [class*="username"]').evaluateAll(nodes=>{
   const luminance=rgb=>rgb.slice(0,3).map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
   return nodes.map(node=>{const style=getComputedStyle(node),surface=getComputedStyle(node.closest('button')||node);const colors=surface.backgroundImage.match(/rgba?\([^)]+\)/g)||[surface.backgroundColor];const ink=luminance(style.color.match(/[\d.]+/g).map(Number));return Math.min(...colors.map(c=>{const bg=luminance(c.match(/[\d.]+/g).map(Number));return(Math.max(bg,ink)+.05)/(Math.min(bg,ink)+.05);}));});
 });expect(contrasts.length).toBeGreaterThanOrEqual(6);for(const value of contrasts)expect(value).toBeGreaterThanOrEqual(4.5);
 const nav=page.getByRole('navigation',{name:'Navegación por capítulos',exact:true});await nav.getByRole('button').first().focus();await page.keyboard.press('Tab');await expect(nav.getByRole('button').nth(1)).toBeFocused();
 expect(await nav.getByRole('button').nth(1).evaluate(n=>getComputedStyle(n).outlineStyle)).toBe('solid');
 await cards(page).first().click();await expect(page.getByTestId('album-detail-page')).toBeVisible();
 const close=page.getByTestId('album-detail-page').locator('header').getByRole('button',{name:'Volver',exact:true});
 expect(await close.locator('[aria-hidden]').evaluate(n=>getComputedStyle(n).color)).toBe('rgb(32, 52, 42)');
 const releaseText=await page.getByTestId('album-detail-page').locator('aside[aria-hidden="false"] small, aside[aria-hidden="false"] strong').evaluateAll(nodes=>nodes.map(n=>({color:getComputedStyle(n).color,size:parseFloat(getComputedStyle(n).fontSize)})));
 expect(releaseText).toHaveLength(8);for(const label of releaseText){expect(['rgb(32, 52, 42)','rgb(53, 76, 60)']).toContain(label.color);expect(label.size).toBeGreaterThanOrEqual(14);}
 await page.screenshot({path:'.qa/metal/album-page-final.png'});await close.click();
 for(const [name,index] of [['Batea',2],['Mixtape Lab',4]]){
   await go(page,name,index);
   expect(await page.locator('[data-rail-wrapper] > div > section').nth(index).locator('h2').first().evaluate(n=>getComputedStyle(n).color)).toBe('rgb(32, 52, 42)');
   await expect(page.getByTestId('deck-now-playing-track')).toBeVisible();
   await page.screenshot({path:`.qa/metal/chapter-${index}-final.png`});
 }
});
test('metal: normal mock auto-enriches once, paginates and combines accent-insensitive filters',async({page})=>{
 const requests=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/api/collection')requests.push(r.url());});
 await open(page);await expect(genre(page).locator('option[value="electronic"]')).toHaveCount(1);
 await expect(collection(page).getByRole('button',{name:'Cargar géneros'})).toHaveCount(0);
 await expect(frame(page)).toHaveAttribute('data-page-size','14');await expect(cards(page)).toHaveCount(14);await fits(page);
 await collection(page).getByRole('button',{name:'Siguiente',exact:true}).click();await expect(cards(page)).toHaveCount(7);await fits(page);
 await go(page,'Split',1);await go(page,'Colección',3);await expect(cards(page)).toHaveCount(7);
 expect(requests.filter(u=>u.includes('includeGenres=0'))).toHaveLength(1);expect(requests.filter(u=>u.includes('includeGenres=1'))).toHaveLength(1);
 await genre(page).selectOption('electronic');await collection(page).getByRole('combobox',{name:'Filtrar por década',exact:true}).selectOption('1990s');
 await collection(page).getByRole('combobox',{name:'Filtrar por año de edición',exact:true}).selectOption('1994');await query(page).fill('vertice');
 await expect(cards(page)).toHaveCount(1);await expect(cards(page)).toHaveAttribute('data-collection-album-id','demo-vertice-album-0');await expect(cards(page)).toContainText('(artista)');
 await query(page).fill('VÉRTICE');await expect(cards(page)).toHaveCount(1);await query(page).fill('inexistente');await expect(collection(page)).toContainText('Sin resultados para estos filtros');
});
test('metal: large catalog preserves focused identity on resize and album page return, clamps the partial last page',async({page})=>{
 const albums=Array.from({length:101},(_,i)=>makeAlbum(`metal-${i}`,'1994',['rock'],{name:`Disco ${i}`,images:[]}));
 await page.route('**/api/collection?*',r=>{const enriched=r.request().url().includes('includeGenres=1');return r.fulfill({json:albums.map(a=>({...a,genres:enriched?a.genres:[],genreMetadata:enriched?coverage('complete',1,1):undefined})),headers:{'X-CDV-Genres-State':enriched?'complete':'not-requested'}});});
 await open(page);await expect(genre(page).locator('option[value="rock"]')).toHaveCount(1);
 await collection(page).getByRole('button',{name:'Siguiente',exact:true}).click();
 const chosen=cards(page).nth(4);const id=await chosen.getAttribute('data-collection-album-id');await chosen.focus();
 await page.setViewportSize({width:1440,height:900});await expect(frame(page)).toHaveAttribute('data-page-size','16');await expect(frame(page).locator(`[data-collection-album-id="${id}"]`)).toBeFocused();await fits(page);
 await frame(page).locator(`[data-collection-album-id="${id}"]`).click();await expect(page.getByTestId('album-detail-page')).toBeVisible();await page.getByTestId('album-detail-page').locator('header').getByRole('button',{name:'Volver',exact:true}).click();await expect(frame(page).locator(`[data-collection-album-id="${id}"]`)).toBeFocused();
 for(let i=0;i<5;i++)await collection(page).getByRole('button',{name:'Siguiente',exact:true}).click();await expect(cards(page)).toHaveCount(5);await expect(collection(page).getByRole('button',{name:'Siguiente',exact:true})).toBeDisabled();await fits(page);
 await query(page).fill('Disco 100');await expect(cards(page)).toHaveCount(1);await expect(collection(page).getByRole('button',{name:'Anterior',exact:true})).toHaveCount(0);
});
test('metal: slow enrichment renders albums, preserves active filters and ignores older catalog membership',async({page})=>{
 const albums=[makeAlbum('a','1994',[],{name:'Álbum A'}),makeAlbum('b','2024',[],{name:'Álbum B'})];let release;let entered;
 const started=new Promise(r=>entered=r);const gate=new Promise(r=>release=r);
 await page.route('**/api/collection?*',async r=>{if(r.request().url().includes('includeGenres=0'))return r.fulfill({json:albums,headers:{'X-CDV-Genres-State':'not-requested'}});entered();await gate;return r.fulfill({json:[{...albums[0],release_date:'1970',genres:['rock'],genreMetadata:coverage('complete',1,1)},makeAlbum('old','1970',['ambient'])],headers:{'X-CDV-Genres-State':'complete'}});});
 await open(page);await started;await expect(cards(page)).toHaveCount(2);await expect(collection(page)).toContainText('Consultando géneros');await query(page).fill('album a');await collection(page).getByRole('combobox',{name:'Filtrar por década',exact:true}).selectOption('1990s');release();
 await expect(genre(page).locator('option[value="rock"]')).toHaveCount(1);await expect(cards(page)).toHaveCount(1);await expect(cards(page)).toHaveAttribute('data-collection-album-id','a');await expect(cards(page)).toContainText('1994');await expect(collection(page)).toContainText('Géneros parciales');await expect(query(page)).toHaveValue('album a');
 await expect(genre(page).locator('option[value="ambient"]')).toHaveCount(0);
});
