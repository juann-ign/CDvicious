const {test,expect,collection,cards,openRail,go}=require('./support/b2-harness.cjs');
const {makeAlbum,coverage}=require('../fixtures/collection-filters.cjs');
const genre=p=>collection(p).getByRole('combobox',{name:'Filtrar por género',exact:true});
const frame=p=>collection(p).locator('[data-page-size]');
const query=p=>p.getByRole('combobox',{name:'Buscar discos o artistas',exact:true});
const capacity=async p=>Number(await frame(p).getAttribute('data-page-size'));
async function open(p){await openRail(p);await go(p,'Colección',3);await expect(cards(p).first()).toBeVisible();}
async function fits(p){
 const result=await frame(p).evaluate(n=>{
   const r=n.getBoundingClientRect();const footer=document.querySelector('[data-global-player]').getBoundingClientRect();
   const pagination=n.closest('[aria-label="La Colección"]').querySelector('footer').getBoundingClientRect();
   const controls=[...n.querySelectorAll('[data-collection-album-id]')];
   const boxes=controls.map(c=>c.getBoundingClientRect());
   const rows=[];
   for(const box of [...boxes].sort((a,b)=>a.top-b.top||a.left-b.left)){
     let row=rows.find(items=>Math.abs(items[0].top-box.top)<=4);
     if(!row){row=[];rows.push(row);}row.push(box);
   }
   const horizontalGaps=rows.flatMap(row=>row.sort((a,b)=>a.left-b.left).slice(1).map((box,index)=>box.left-row[index].right));
   const verticalGaps=rows.slice(1).map((row,index)=>Math.min(...row.map(box=>box.top))-Math.max(...rows[index].map(box=>box.bottom)));
   const left=Math.min(...boxes.map(box=>box.left)),right=Math.max(...boxes.map(box=>box.right));
   const bottom=Math.max(...boxes.map(box=>box.bottom));
   return{fits:boxes.every(b=>b.left>=r.left-1&&b.right<=r.right+1&&b.top>=r.top-1&&b.bottom<=r.bottom+1&&b.width>=100&&b.width<=118.1),
     facesFit:controls.every((card,index)=>{const face=card.querySelector('[class*="caseFace"]').getBoundingClientRect(),box=boxes[index];return face.width>=100&&face.width<=118.1&&face.left>=box.left-1&&face.right<=box.right+1&&face.top>=box.top-1&&face.bottom<=box.bottom+1;}),
     yearsVisible:controls.every((card,index)=>{const year=card.querySelector('[class*="year"]'),box=boxes[index],y=year.getBoundingClientRect(),style=getComputedStyle(year);return Boolean(year.textContent.trim())&&style.visibility==='visible'&&Number(style.opacity)>0&&y.width>0&&y.height>0&&y.left>=box.left-1&&y.right<=box.right+1&&y.top>=box.top-1&&y.bottom<=box.bottom+1&&y.bottom<=pagination.top;}),
     footer:r.bottom<=footer.top&&bottom<=pagination.top&&bottom<=footer.top,noOverflow:n.scrollWidth<=n.clientWidth+1&&n.scrollHeight<=n.clientHeight+1,
     clip:['clip','hidden'].includes(getComputedStyle(n).overflowY),
     columns:Math.max(...rows.map(row=>row.length)),rows:rows.length,
     leftInset:left,rightInset:document.documentElement.clientWidth-right,
     horizontalGap:horizontalGaps.length?Math.min(...horizontalGaps):null,
     verticalGap:verticalGaps.length?Math.min(...verticalGaps):null,
     justifyContent:getComputedStyle(n.firstElementChild).justifyContent,
     widths:boxes.map(box=>box.width),lastRowBottom:bottom,paginationTop:pagination.top,globalPlayerTop:footer.top};
 });
 expect(result).toMatchObject({fits:true,facesFit:true,yearsVisible:true,footer:true,noOverflow:true,clip:true});
 return result;
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
   const chapter=page.locator('[data-rail-wrapper] > div > section').nth(index);
   if(index===2){
     await expect(chapter).toHaveAttribute('aria-label','La Batea');
     await expect(chapter.locator('h2')).toHaveCount(0);
   }else{
     expect(await chapter.locator('h2').first().evaluate(n=>getComputedStyle(n).color)).toBe('rgb(32, 52, 42)');
   }
   await expect(page.getByTestId('deck-now-playing-track')).toBeVisible();
   await page.screenshot({path:`.qa/metal/chapter-${index}-final.png`});
 }
});
test('metal: normal mock auto-enriches once, paginates and combines accent-insensitive filters',async({page},testInfo)=>{
 const requests=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/api/collection')requests.push(r.url());});
 await open(page);await expect(genre(page).locator('option[value="electronic"]')).toHaveCount(1);
 await expect(collection(page).getByRole('button',{name:'Cargar géneros'})).toHaveCount(0);
 await expect.poll(()=>capacity(page)).toBe(30);
 await expect(cards(page)).toHaveCount(21);
 expect(await fits(page)).toMatchObject({columns:10,rows:3});
 await page.screenshot({path:testInfo.outputPath('Tu-Coleccion-grilla-1280x800.png')});
 await page.setViewportSize({width:1280,height:720});
 await expect.poll(()=>capacity(page)).toBe(20);
 const shorter=await capacity(page);
 await expect(cards(page)).toHaveCount(shorter);
 expect(await fits(page)).toMatchObject({columns:10,rows:2});
 await expect(cards(page).last()).toBeInViewport({ratio:1});
 await collection(page).getByRole('button',{name:'Siguiente',exact:true}).click();await expect(cards(page)).toHaveCount(21-shorter);await fits(page);
 await go(page,'Split',1);await go(page,'Colección',3);await expect(cards(page)).toHaveCount(21-shorter);
 expect(requests.filter(u=>u.includes('includeGenres=0'))).toHaveLength(1);expect(requests.filter(u=>u.includes('includeGenres=1'))).toHaveLength(1);
 await genre(page).selectOption('electronic');await collection(page).getByRole('combobox',{name:'Filtrar por década',exact:true}).selectOption('1990s');
 await collection(page).getByRole('combobox',{name:'Filtrar por año de edición',exact:true}).selectOption('1994');await query(page).fill('vertice');
 await expect(cards(page)).toHaveCount(1);await expect(cards(page)).toHaveAttribute('data-collection-album-id','demo-vertice-album-0');await expect(cards(page)).toContainText('(artista)');
 await query(page).fill('VÉRTICE');await expect(cards(page)).toHaveCount(1);await query(page).fill('inexistente');await expect(collection(page)).toContainText('Sin resultados para estos filtros');
});
test('metal: large catalog preserves focused identity on resize and album page return, clamps the partial last page',async({page},testInfo)=>{
 const longArtist='Patricio Rey y sus Redonditos de Ricota';
 const albums=Array.from({length:101},(_,i)=>makeAlbum(`metal-${i}`,'1994',['rock'],{name:`Disco ${i}`,images:[],artists:[{id:'artist-long',name:longArtist}]}));
 await page.route('**/api/collection?*',r=>{const enriched=r.request().url().includes('includeGenres=1');return r.fulfill({json:albums.map(a=>({...a,genres:enriched?a.genres:[],genreMetadata:enriched?coverage('complete',1,1):undefined})),headers:{'X-CDV-Genres-State':enriched?'complete':'not-requested'}});});
 await page.setViewportSize({width:820,height:820});
 await open(page);await expect(genre(page).locator('option[value="rock"]')).toHaveCount(1);
 expect((await fits(page)).columns).toBeGreaterThanOrEqual(3);
 const compactCapacity=await capacity(page);
 await collection(page).getByRole('button',{name:'Siguiente',exact:true}).click();
 const chosen=cards(page).nth(4);const id=await chosen.getAttribute('data-collection-album-id');await chosen.focus();
 await page.setViewportSize({width:1440,height:900});
 await expect.poll(()=>capacity(page)).toBeGreaterThan(compactCapacity);
 const expandedCapacity=await capacity(page);
 await expect(frame(page).locator(`[data-collection-album-id="${id}"]`)).toBeFocused();
 expect(expandedCapacity).toBe(33);
 expect(await fits(page)).toMatchObject({columns:11,rows:3});
 expect(await cards(page).first().evaluate((card, name) => {
   const artist=[...card.querySelectorAll('span')].find(node=>node.childElementCount===0&&node.textContent===name);
   const year=[...artist.parentElement.children].find(node=>node.textContent==='1994');
   const a=artist.getBoundingClientRect(),y=year.getBoundingClientRect(),b=card.getBoundingClientRect();
   return {elided:artist.scrollWidth>artist.clientWidth,sameLine:Math.abs(a.bottom-y.bottom)<=2,yearFits:y.right<=b.right};
 },longArtist)).toEqual({elided:true,sameLine:true,yearFits:true});
 await page.screenshot({path:testInfo.outputPath('Tu-Coleccion-catalogo-1440x900.png')});
 await frame(page).locator(`[data-collection-album-id="${id}"]`).click();await expect(page.getByTestId('album-detail-page')).toBeVisible();await page.getByTestId('album-detail-page').locator('header').getByRole('button',{name:'Volver',exact:true}).click();await expect(frame(page).locator(`[data-collection-album-id="${id}"]`)).toBeFocused();
 const next=collection(page).getByRole('button',{name:'Siguiente',exact:true});
 const afterResize=Math.floor((compactCapacity+4)/expandedCapacity);
 const pageCount=Math.ceil(albums.length/expandedCapacity);
 for(let i=afterResize;i<pageCount-1;i++)await next.click();
 await expect(cards(page)).toHaveCount(albums.length-(pageCount-1)*expandedCapacity);
 await expect(next).toBeDisabled();await fits(page);
 await query(page).fill('Disco 100');await expect(cards(page)).toHaveCount(1);await expect(collection(page).getByRole('button',{name:'Anterior',exact:true})).toHaveCount(0);
});

test('metal: full collection pages keep 24px edges, spaced acrylic and an unclipped last row at every desktop size',async({page},testInfo)=>{
 const artwork=Array.from({length:27},(_,index)=>index).filter(index=>index!==8);
 const albums=Array.from({length:121},(_,i)=>makeAlbum(`grid-${i}`,'1994',['rock'],{name:`Disco ${i}`,artists:[{id:'artist-grid',name:'Artista de catálogo extenso'}],images:[{url:`/images/discography/releases/album-${artwork[i%artwork.length]}.webp`,width:480,height:480}]}));
 await page.route('**/api/collection?*',route=>{const enriched=route.request().url().includes('includeGenres=1');return route.fulfill({json:albums.map(album=>({...album,genres:enriched?album.genres:[],genreMetadata:enriched?coverage('complete',1,1):undefined})),headers:{'X-CDV-Genres-State':enriched?'complete':'not-requested'}});});
 await open(page);await expect(genre(page).locator('option[value="rock"]')).toHaveCount(1);
 const evidence=[];
 for(const size of [{width:1280,height:800,columns:10,rows:3,capacity:30},{width:1440,height:900,columns:11,rows:3,capacity:33},{width:1920,height:1080,columns:15,rows:4,capacity:60},{width:1280,height:720,columns:10,rows:2,capacity:20}]){
   await page.setViewportSize({width:size.width,height:size.height});
   await expect.poll(()=>capacity(page)).toBe(size.capacity);
   const previous=collection(page).getByRole('button',{name:'Anterior',exact:true});
   while(await previous.isEnabled())await previous.click();
   await expect(cards(page)).toHaveCount(size.capacity);
   await expect(cards(page).first()).toHaveAttribute('data-collection-album-id','grid-0');
   await page.getByRole('button',{name:'Ir al capítulo Colección',exact:true}).focus();await page.mouse.move(2,2);
   const first=await fits(page);
   expect(first).toMatchObject({columns:size.columns,rows:size.rows,justifyContent:'space-between'});
   expect(Math.abs(first.leftInset-24)).toBeLessThanOrEqual(1);
   expect(Math.abs(first.rightInset-24)).toBeLessThanOrEqual(1);
   expect(first.horizontalGap).toBeGreaterThanOrEqual(20);
   expect(first.verticalGap).toBeGreaterThanOrEqual(18);
   await expect(cards(page).last()).toBeInViewport({ratio:1});
   await page.screenshot({path:testInfo.outputPath(`Tu-Coleccion-${size.width}x${size.height}.png`)});
   await collection(page).getByRole('button',{name:'Siguiente',exact:true}).click();
   await expect(cards(page)).toHaveCount(size.capacity);
   await expect(cards(page).first()).toHaveAttribute('data-collection-album-id',`grid-${size.capacity}`);
   await page.getByRole('button',{name:'Ir al capítulo Colección',exact:true}).focus();await page.mouse.move(2,2);
   const second=await fits(page);
   expect(second).toMatchObject({columns:size.columns,rows:size.rows,justifyContent:'space-between'});
   expect(Math.abs(second.leftInset-24)).toBeLessThanOrEqual(1);
   expect(Math.abs(second.rightInset-24)).toBeLessThanOrEqual(1);
   expect(second.horizontalGap).toBeGreaterThanOrEqual(20);
   expect(second.verticalGap).toBeGreaterThanOrEqual(18);
   await expect(cards(page).last()).toBeInViewport({ratio:1});
   evidence.push({size,first,second});
 }
 await testInfo.attach('full-grid-pixel-geometry',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
});
test('metal: slow enrichment renders albums, preserves active filters and ignores older catalog membership',async({page})=>{
 const albums=[makeAlbum('a','1994',[],{name:'Álbum A'}),makeAlbum('b','2024',[],{name:'Álbum B'})];let release;let entered;
 const started=new Promise(r=>entered=r);const gate=new Promise(r=>release=r);
 await page.route('**/api/collection?*',async r=>{if(r.request().url().includes('includeGenres=0'))return r.fulfill({json:albums,headers:{'X-CDV-Genres-State':'not-requested'}});entered();await gate;return r.fulfill({json:[{...albums[0],release_date:'1970',genres:['rock'],genreMetadata:coverage('complete',1,1)},makeAlbum('old','1970',['ambient'])],headers:{'X-CDV-Genres-State':'complete'}});});
 await open(page);await started;await expect(cards(page)).toHaveCount(2);
 const genreOptions=()=>collection(page).getByRole("button",{name:"Buscar género en Spotify",exact:true});
 await genreOptions().click();await expect(collection(page)).toContainText('Consultando géneros');
 await query(page).fill('album a');await query(page).press('Escape');await collection(page).getByRole('combobox',{name:'Filtrar por década',exact:true}).selectOption('1990s');release();
 await expect(genre(page).locator('option[value="rock"]')).toHaveCount(1);await expect(cards(page)).toHaveCount(1);await expect(cards(page)).toHaveAttribute('data-collection-album-id','a');await expect(cards(page)).toContainText('1994');await expect(query(page)).toHaveValue('album a');
 await genreOptions().click();await expect(collection(page)).toContainText('Géneros parciales');
 await expect(genre(page).locator('option[value="ambient"]')).toHaveCount(0);
});
