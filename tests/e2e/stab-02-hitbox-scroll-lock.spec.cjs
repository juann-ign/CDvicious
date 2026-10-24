const { test, expect } = require("@playwright/test");

const RAIL_ENABLED = process.env.RAIL_FLAG === "1";
const NAV_LABEL = "Navegación por capítulos";
const CHAPTERS = ["Deck", "Split", "Batea", "Colección", "Mixtape Lab"];

const navButton = (page, chapter) =>
  page.getByRole("button", { name: "Ir al capítulo " + chapter });
const panels = (page) => page.locator("[data-rail-wrapper] > div > section");
const activePanel = (page) =>
  page.locator('[data-rail-wrapper] > div > section[data-chapter-active="true"]');
const dialog = (page) => page.getByRole("dialog");

async function openRail(page, viewport = { width: 1280, height: 800 }) {
  await page.setViewportSize(viewport);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  if (RAIL_ENABLED) {
    // HorizontalRail is loaded by a client-only dynamic import. CI can spend
    // several seconds hydrating the 3D scene before its navigation mounts.
    await expect(page.getByRole("navigation", { name: NAV_LABEL })).toBeVisible({ timeout: 45_000 });
    await expect(panels(page)).toHaveCount(5, { timeout: 45_000 });
    // Avoid clicks and wheel input before the client effect has initialized Lenis.
    await expect(page.locator('[data-rail-ready="true"]')).toBeVisible({ timeout: 45_000 });
  } else {
    await expect(page.locator("main")).toBeVisible();
  }
}

async function goToChapter(page, chapter, index) {
  await navButton(page, chapter).click();
  await expect(navButton(page, chapter)).toHaveAttribute("aria-current", "location");
  await expect(activePanel(page)).toHaveCount(1);
  await expect(panels(page).nth(index)).toHaveAttribute("data-chapter-active", "true");
  await expect(page.locator("html")).toHaveAttribute("data-chapter", String(index));

  // data-chapter changes at the activation threshold, before Lenis finishes the
  // 900 ms scrollToChapter animation. Wait for actual panel alignment so tests
  // don't open/close a modal while the rail is still moving.
  await expect
    .poll(
      () =>
        panels(page)
          .nth(index)
          .evaluate((panel) => Math.abs(panel.getBoundingClientRect().left)),
      { timeout: 8_000 },
    )
    .toBeLessThan(2);
}

// The mock collection is loaded lazily when its chapter becomes active. Prime
// the shared client cache before exercising Batea, which consumes that cache too.
async function primeCollection(page) {
  await goToChapter(page, "Colección", 3);
  const collection = panels(page).nth(3);
  await expect(collection.locator('button[aria-label*=" — "]').first()).toBeVisible();
}

async function firstSpine(page) {
  const spines = panels(page).nth(2).locator('button[aria-label*=" — "]');
  const index = await spines.evaluateAll((nodes) => {
    const stage = nodes[0]?.closest('[class*="stage"]');
    if (!stage) return -1;
    const bounds = stage.getBoundingClientRect();
    return nodes.findIndex((node) => {
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return rect.width > 0 && x >= bounds.left + 75 && x <= bounds.right - 75 &&
        y >= bounds.top && y <= bounds.bottom;
    });
  });
  expect(index, "No hay un lomo con centro dentro de la zona visible de Batea").toBeGreaterThanOrEqual(0);
  const spine = spines.nth(index);
  await expect(spine).toBeVisible();
  return spine;
}

test("flag apagado conserva el fallback y no monta hit targets del rail", async ({ page }) => {
  test.skip(RAIL_ENABLED, "Este chequeo se ejecuta solo con el rail apagado.");
  await openRail(page);
  await expect(page.getByRole("navigation", { name: NAV_LABEL })).toHaveCount(0);
  await expect(page.locator("[data-rail-wrapper]")).toHaveCount(0);
  await expect(page.locator("[data-rail-overlay]")).toHaveCount(0);
});

test("capítulo activo, inert y gating del Deck permanecen sincronizados", async ({ page }) => {
  test.skip(!RAIL_ENABLED, "Requiere rail desktop habilitado.");
  await openRail(page);

  for (let index = 0; index < CHAPTERS.length; index += 1) {
    await goToChapter(page, CHAPTERS[index], index);
    const states = await panels(page).evaluateAll((nodes) =>
      nodes.map((node) => ({
        active: node.getAttribute("data-chapter-active"),
        inert: node.hasAttribute("inert"),
      })),
    );
    expect(states.filter((state) => state.active === "true")).toHaveLength(1);
    states.forEach((state, panelIndex) => {
      expect(state.inert, "panel " + panelIndex + " inert state").toBe(panelIndex !== index);
    });

    const overlay = page.locator("[data-rail-overlay]");
    await expect(overlay).toHaveAttribute("data-deck-interactive", index >= 2 ? "false" : "true");
    expect(await overlay.evaluate((node) => node.hasAttribute("inert"))).toBe(index >= 2);
  }
});

test("drag de Batea mayor a 6px no abre modal y libera wheel después de pointerup", async ({ page }) => {
  test.skip(!RAIL_ENABLED, "Requiere Batea en el rail desktop.");
  await openRail(page);
  await primeCollection(page);
  await goToChapter(page, "Batea", 2);

  // Pause the marquee over its static stage before measuring a spine. Otherwise
  // the belt may translate between hit-testing and pointerdown, making this
  // gesture flaky and potentially selecting a different copy.
  const crate = panels(page).nth(2);
  const stage = crate.locator('[class*="stage"]').first();
  const shelfViewport = crate.locator('[class*="viewport"]').first();
  await stage.hover();
  await page.waitForTimeout(150);

  const spine = await firstSpine(page);
  const box = await spine.boundingBox();
  expect(box, "El lomo debe tener un hitbox visible después de pausar la batea").not.toBeNull();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 45, y, { steps: 5 });
  // Prove the gesture crossed the drag threshold and acquired the drag lock.
  await expect(shelfViewport).toHaveClass(/dragging/);
  await page.mouse.up();

  // Pointerup must release both pointer capture and the rail lock.
  await expect(shelfViewport).not.toHaveClass(/dragging/);
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-modal-open", "true");
  await expect(crate).toHaveAttribute("data-chapter-active", "true");

  // Send the wheel over the static chapter heading, not the viewport that just
  // handled the drag. This isolates rail-lock recovery from marquee hit-testing.
  const heading = crate.locator("h2").first();
  await heading.hover();
  await page.waitForTimeout(120);
  await page.mouse.wheel(0, 700);
  await expect
    .poll(() => page.locator("html").getAttribute("data-chapter"), {
      timeout: 12_000,
      message: "El wheel debe volver a navegar después de finalizar el drag",
    })
    .toBe("3");
});

test("pointercancel en un drag capturado libera el bloqueo del rail", async ({ page }) => {
  test.skip(!RAIL_ENABLED, "Requiere Batea en el rail desktop.");
  await openRail(page);
  await primeCollection(page);
  await goToChapter(page, "Batea", 2);

  const viewport = panels(page).nth(2).locator('[class*="viewport"]').first();
  await expect(viewport).toBeVisible();
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  const x = box.x + Math.min(120, box.width / 3);
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y, { steps: 4 });
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointercancel", {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    }));
  });
  await page.mouse.up();

  await expect(dialog(page)).toHaveCount(0);
  const shelfViewport = panels(page).nth(2).locator('[class*="viewport"]').first();
  await shelfViewport.hover();
  await page.mouse.wheel(0, 700);
  await expect.poll(() => page.locator("html").getAttribute("data-chapter"), { timeout: 8_000 }).toBe("3");
});

test("hit-testing en Batea y Colección entrega el pointer al panel activo", async ({ page }) => {
  test.skip(!RAIL_ENABLED, "Requiere rail desktop habilitado.");
  await openRail(page);
  await primeCollection(page);

  for (const item of [
    { chapter: "Batea", index: 2 },
    { chapter: "Colección", index: 3 },
  ]) {
    await goToChapter(page, item.chapter, item.index);
    const target = panels(page).nth(item.index).locator('button[aria-label*=" — "]').first();
    await expect(target).toBeVisible();
    const box = await target.boundingBox();
    expect(box).not.toBeNull();

    const hit = await target.evaluate((element, point) => {
      const stack = document.elementsFromPoint(point.x, point.y);
      const targetIndex = stack.findIndex((node) => node === element || element.contains(node));
      const deckIndex = stack.findIndex((node) =>
        Boolean(node.closest("[data-rail-overlay]")) &&
        getComputedStyle(node).pointerEvents !== "none",
      );
      return {
        targetIndex,
        deckIndex,
        stack: stack.slice(0, 8).map((node) => ({
          tag: node.tagName,
          label: node.getAttribute("aria-label"),
          pointerEvents: getComputedStyle(node).pointerEvents,
          deckOverlay: Boolean(node.closest("[data-rail-overlay]")),
        })),
      };
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });

    expect(hit.targetIndex, JSON.stringify(hit.stack)).toBeGreaterThanOrEqual(0);
    expect(
      hit.deckIndex === -1 || hit.deckIndex > hit.targetIndex,
      JSON.stringify(hit.stack),
    ).toBe(true);
  }
});

test("búsqueda y filtros de Colección siguen accesibles con ventana baja y escala CSS 125%", async ({ page }) => {
  test.skip(!RAIL_ENABLED, "Requiere Colección en el rail desktop.");
  // Mount and initialize the desktop rail at the standard viewport first.
  // Then reduce only the height: this test targets short-window layout, not
  // the unrelated dynamic-import/hydration timing of a cold page load.
  await openRail(page);
  await page.setViewportSize({ width: 1280, height: 600 });
  await expect(page.getByRole("navigation", { name: NAV_LABEL })).toBeVisible({ timeout: 45_000 });
  await expect(panels(page)).toHaveCount(5, { timeout: 45_000 });
  await expect(page.locator('[data-rail-ready="true"]')).toBeVisible();
  await goToChapter(page, "Colección", 3);

  const collection = panels(page).nth(3);
  const search = collection.getByRole("searchbox", { name: "Buscar artista o álbum" });
  const neonRooms = collection.getByRole("button", { name: /— Neon Rooms$/ });
  await expect(search).toBeVisible();
  await search.fill("Neon Rooms");
  await expect(neonRooms.first()).toBeVisible();

  await collection.getByRole("button", { name: "2010s", exact: true }).click();
  await expect(neonRooms).toHaveCount(0);
  await collection.getByRole("button", { name: "TODAS", exact: true }).click();
  await search.fill("");

  // CSS zoom scales layout but does not operate the browser chrome zoom control.
  await page.evaluate(() => { document.documentElement.style.zoom = "125%"; });
  await expect(search).toBeVisible();
  const nextPage = page.getByRole("button", { name: "SIGUIENTE ►" });
  await expect(nextPage).toBeVisible();
  await expect(nextPage).toBeDisabled();

  const filter = collection.getByRole("button", { name: "TODAS", exact: true });
  const box = await filter.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(filter).toBeVisible();
});
