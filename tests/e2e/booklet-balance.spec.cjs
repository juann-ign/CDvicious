const { test, expect, go, saveRecord } = require("./support/prototype-harness.cjs");
const { openRail } = require("./support/b2-harness.cjs");

test.use({ viewport: { width: 1920, height: 1080 }, launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });
const previous = {
  1920: { width: 741.17, height: 478.23, playerWidth: 897.35 },
  1440: { width: 547.86, height: 348.02, playerWidth: 664.85 },
  1280: { width: 539.71, height: 318.85, playerWidth: 550.1 },
};
async function geometry(page) {
  return page.evaluate(() => {
    const rect = node => node?.getBoundingClientRect().toJSON() ?? null;
    const paper = document.querySelector('[data-testid="lyrics-paper"]');
    const hardware = [...document.querySelectorAll('[data-deck-surface]')].map(rect);
    const faces = [...paper.querySelectorAll('[data-booklet-page-half]')].map(rect);
    const text = [...paper.querySelectorAll('[data-testid="lyrics-content"]')].map(node => ({
      visible: node.innerText, overflow: node.scrollHeight - node.clientHeight,
      font: getComputedStyle(node).fontSize, lineHeight: getComputedStyle(node).lineHeight,
      family: getComputedStyle(node).fontFamily, whiteSpace: getComputedStyle(node).whiteSpace,
    }));
    return { paper: rect(paper), faces, hardware: { left: Math.min(...hardware.map(r => r.left)), right: Math.max(...hardware.map(r=>r.right)),
      top: Math.min(...hardware.map(r=>r.top)), bottom: Math.max(...hardware.map(r=>r.bottom)) },
      rightSpeaker: rect(document.querySelector('[data-speaker-side="right"]')),
      disc: rect(document.querySelector('[data-prototype-disc="true"]')),
      header: rect(document.querySelector('[data-shell-header]')), footer: rect(document.querySelector('[data-global-player]')),
      next: rect(document.querySelector('[data-deck-next-discs] button')),
      heading: paper.querySelector('h4')?.textContent,
      artistSize: getComputedStyle(paper.querySelector('[class*="bookletHeader"] span')).fontSize, text };
  });
}
function assertFits(m, width, height, raised = false) {
  expect(m.paper.width).toBeGreaterThan(previous[width].width * 1.01);
  expect(m.paper.width).toBeLessThan(previous[width].width * 1.11);
  expect(m.paper.height).toBeGreaterThan(previous[width].height * 1.005);
  expect(m.paper.height).toBeLessThan(previous[width].height * 1.12);
  expect(Math.max(...m.faces.map(f=>f.right))).toBeLessThan(width - 7);
  expect(Math.min(...m.faces.map(f=>f.top))).toBeGreaterThan(m.header.bottom + 12);
  expect(Math.max(...m.faces.map(f=>f.bottom))).toBeLessThanOrEqual(m.footer.top + 1);
  expect(m.rightSpeaker.right).toBeLessThan(m.paper.left - 12);
  expect(m.hardware.right).toBeLessThan(m.paper.left - 12);
  expect(m.text.every(t => t.overflow <= 2)).toBe(true);
  expect(m.text.every(t => !/^\s*\n/.test(t.visible))).toBe(true);
  expect(m.text.every(t => /Krinkes/.test(t.family) && parseFloat(t.font) >= 19 && parseFloat(t.font) <= 21)).toBe(true);
  expect(m.artistSize).toBe('16px');
  if (raised) {
    expect(m.disc).not.toBeNull();
    expect(m.disc.right).toBeLessThan(m.paper.left - 12);
    expect(m.disc.bottom).toBeLessThanOrEqual(m.footer.top + 1);
  } else {
    expect(m.hardware.right - m.hardware.left).toBeGreaterThan(previous[width].playerWidth * .91);
    const bookY = m.paper.top + m.paper.height / 2;
    const playerY = (m.hardware.top + m.hardware.bottom) / 2;
    expect(Math.abs(bookY - playerY)).toBeLessThan(height * .12);
  }
}

test("Split balances a moderately larger booklet with playing equipment and raised CD", async ({ page }, testInfo) => {
  await openRail(page);
  await go(page, "Split", 1);
  await page.getByRole("button", { name: "Track listing", exact: true }).click();
  await page.getByRole("region", { name: "Pistas del álbum", exact: true }).getByRole("button", { name: /Mapa de azoteas/ }).click();
  const root = page.getByTestId("lyrics-booklet");
  await expect(page.getByTestId("deck-now-playing-track")).toHaveText("Mapa de azoteas");
  await expect(root).toHaveAttribute("data-pagination-state", "ready");
  await expect(root.getByRole("heading", {name:"Mapa de azoteas",exact:true})).toBeVisible();
  const records = [];
  for (const [width,height] of [[1920,1080],[1440,900],[1280,720]]) {
    await page.setViewportSize({width,height});
    await expect.poll(async () => (await geometry(page)).text.every(t=>t.overflow<=2)).toBe(true);
    const m = await geometry(page);
    assertFits(m, width, height);
    await page.screenshot({path:testInfo.outputPath(`Split-${width}x${height}.png`), animations:"disabled"});
    records.push({width,height,raised:false,m});
    if (width === 1280) continue;
    await page.getByRole("button", {name:"Elevar CD del equipo",exact:true}).click();
    await expect(page.locator('[data-physical-deck]')).toHaveAttribute('data-disc-state','free');
    const free = await geometry(page);
    assertFits(free,width,height,true);
    await page.screenshot({path:testInfo.outputPath(`Split-elevado-${width}x${height}.png`),animations:"disabled"});
    records.push({width,height,raised:true,m:free});
    await page.getByRole("button", {name:"Acoplar CD al equipo",exact:true}).click();
    await expect(page.locator('[data-physical-deck]')).toHaveAttribute('data-disc-state','docked');
  }
  await saveRecord(testInfo,"booklet-moderate-geometry",records);
});
