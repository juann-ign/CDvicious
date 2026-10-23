const { test, expect } = require("@playwright/test");
const mockCollection = require("../../src/mocks/collection.json");

const RAIL_ENABLED = process.env.RAIL_FLAG === "1";
const NAV_LABEL = "Navegación por capítulos";
const CHAPTERS = [
  { name: "Deck", index: 0 },
  { name: "Split", index: 1 },
  { name: "Batea", index: 2 },
  { name: "Colección", index: 3 },
  { name: "Mixtape Lab", index: 4 },
];

function makeCollectionFixture(count) {
  return Array.from({ length: count }, (_, index) => {
    const original = mockCollection[index % mockCollection.length];
    if (index < mockCollection.length) {
      return {
        ...original,
        genres: original.genres && original.genres.length
          ? original.genres
          : ["rock", "electronic"],
      };
    }

    const id = String(original.id) + "-stab02-" + String(index + 1);
    return {
      ...original,
      id,
      uri: "spotify:album:" + id,
      name: String(original.name) + " QA " + String(index + 1),
      genres: original.genres && original.genres.length
        ? original.genres
        : ["rock", "electronic"],
    };
  });
}

async function installCollectionFixture(page, count = 18) {
  const albums = makeCollectionFixture(count);

  await page.route(/\/api\/collection(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const includeGenres = url.searchParams.get("includeGenres") === "1";
    const response = includeGenres
      ? albums.map((album, index) => ({
          ...album,
          genres: index % 2 === 0 ? ["rock"] : ["electronic"],
        }))
      : albums;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

const navigation = (page) =>
  page.getByRole("navigation", { name: NAV_LABEL });

const chapterButton = (page, name) =>
  page.getByRole("button", { name: "Ir al capítulo " + name });

const panels = (page) =>
  page.locator("[data-rail-wrapper] > div > section");

const currentChapter = (page) =>
  page.locator("[data-rail-wrapper]").evaluate((wrapper) =>
    wrapper.parentElement?.getAttribute("data-chapter"),
  );

async function openRail(page, options = {}) {
  const width = options.width ?? 1280;
  const height = options.height ?? 800;
  const albumCount = options.albumCount ?? 18;

  await installCollectionFixture(page, albumCount);
  await page.setViewportSize({ width, height });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(navigation(page)).toBeVisible();
  await expect(panels(page)).toHaveCount(5);

  // The mock collection cache is lazy-loaded when Colección becomes active.
  // Populate it once so Batea also has deterministic album hit targets.
  await goToChapter(page, "Colección", 3);
  await expect(
    page.locator('section[aria-label="La Colección"] button[aria-label*="—"]').first(),
  ).toBeVisible();
}

async function waitForChapterSettled(page, index) {
  await expect
    .poll(
      () =>
        page.locator("[data-rail-wrapper]").evaluate((wrapper, targetIndex) => {
          const content = wrapper.firstElementChild;
          const target = content?.children.item(targetIndex);
          if (!(target instanceof HTMLElement)) return Number.POSITIVE_INFINITY;
          return Math.abs(wrapper.scrollLeft - target.offsetLeft);
        }, index),
      { timeout: 8_000 },
    )
    .toBeLessThan(3);
}

async function goToChapter(page, name, index) {
  await chapterButton(page, name).click();
  await expect.poll(() => currentChapter(page), { timeout: 8_000 }).toBe(
    String(index),
  );
  await expect(panels(page).nth(index)).toHaveAttribute(
    "data-chapter-active",
    "true",
  );
  await waitForChapterSettled(page, index);
}

function spineButtons(page) {
  return page.locator(
    'section[aria-label="La Batea"] button[style*="--tilt"]',
  );
}

function viewportInCrate(page) {
  return page.locator(
    'section[aria-label="La Batea"] [class*="_viewport"]',
  ).first();
}

test("STAB-02: click corto en Batea abre modal; Escape restaura foco y scroll", async ({
  page,
}) => {
  test.skip(!RAIL_ENABLED, "STAB-02 requiere el rail habilitado.");

  await openRail(page);
  await goToChapter(page, "Batea", 2);

  // The shelf belt moves continuously by default. Pause its decorative
  // drift so Playwright can exercise a stationary short click, not time out
  // waiting for an animated hit target to become stable.
  await page.getByRole("button", { name: "BELT ON" }).click();
  await expect(page.getByRole("button", { name: "BELT PAUSED" })).toBeVisible();

  const spine = spineButtons(page).first();
  const box = await spine.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-modal-open", "true");

  const closeButton = dialog.getByRole("button", { name: "Cerrar" }).last();
  await expect(closeButton).toBeFocused();

  // The modal owns a rail-lock token: wheel input must not change chapters.
  await page.mouse.move(1100, 700);
  await page.mouse.wheel(0, 1000);
  await expect.poll(() => currentChapter(page)).toBe("2");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-modal-open", "true");
  await expect(spine).toBeFocused();

  // Once the modal unmounts, its token must be released and Lenis must resume.
  await page.mouse.wheel(0, 1000);
  await expect.poll(() => currentChapter(page), { timeout: 8_000 }).toBe("3");
});

test("STAB-02: drag superior a 6px en Batea no selecciona un disco y pointerup libera Lenis", async ({
  page,
}) => {
  test.skip(!RAIL_ENABLED, "STAB-02 requiere el rail habilitado.");

  await openRail(page);
  await goToChapter(page, "Batea", 2);

  const spine = spineButtons(page).first();
  const box = await spine.boundingBox();
  expect(box).not.toBeNull();

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const viewport = viewportInCrate(page);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 70, y, { steps: 7 });

  await expect.poll(async () =>
    viewport.evaluate((element) =>
      Array.from(element.classList).some((name) => name.includes("dragging")),
    ),
  ).toBe(true);

  await page.mouse.up();
  await expect.poll(async () =>
    viewport.evaluate((element) =>
      Array.from(element.classList).some((name) => name.includes("dragging")),
    ),
  ).toBe(false);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.mouse.wheel(0, 1000);
  await expect.poll(() => currentChapter(page), { timeout: 8_000 }).toBe("3");
});

test("STAB-02: pointercancel durante drag libera o lock e permite wheel", async ({
  page,
}) => {
  test.skip(!RAIL_ENABLED, "STAB-02 requiere el rail habilitado.");

  await openRail(page);
  await goToChapter(page, "Batea", 2);
  await page.evaluate(() => {
    window.__stab02PointerId = null;
    document.addEventListener(
      "pointerdown",
      (event) => {
        window.__stab02PointerId = event.pointerId;
      },
      true,
    );
  });

  const spine = spineButtons(page).first();
  const box = await spine.boundingBox();
  expect(box).not.toBeNull();

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const viewport = viewportInCrate(page);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 70, y, { steps: 7 });
  await expect.poll(async () =>
    viewport.evaluate((element) =>
      Array.from(element.classList).some((name) => name.includes("dragging")),
    ),
  ).toBe(true);

  await page.evaluate(() => {
    const pointerId = window.__stab02PointerId;
    window.dispatchEvent(
      new PointerEvent("pointercancel", {
        bubbles: true,
        cancelable: true,
        pointerId: typeof pointerId === "number" ? pointerId : 1,
        pointerType: "mouse",
        clientX: 500,
        clientY: 500,
      }),
    );
  });
  await page.mouse.move(x - 180, y);
  await page.mouse.up();

  await expect.poll(async () =>
    viewport.evaluate((element) =>
      Array.from(element.classList).some((name) => name.includes("dragging")),
    ),
  ).toBe(false);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.mouse.wheel(0, 1000);
  await expect.poll(() => currentChapter(page), { timeout: 8_000 }).toBe("3");
});

test("STAB-02: hit-testing del Deck pinned queda bloqueado en Batea y Colección", async ({
  page,
}) => {
  test.skip(!RAIL_ENABLED, "STAB-02 requiere el rail habilitado.");

  await openRail(page);

  for (const target of [
    { name: "Batea", index: 2, section: "La Batea" },
    { name: "Colección", index: 3, section: "La Colección" },
  ]) {
    await goToChapter(page, target.name, target.index);

    const diagnostics = await page.evaluate((sectionName) => {
      const wrapper = document.querySelector("[data-rail-wrapper]");
      const root = wrapper?.parentElement;
      const panel = document.querySelector(
        'section[aria-label="' + sectionName + '"]',
      );
      const overlay = root?.querySelector("[data-rail-overlay]");
      if (!root || !panel || !overlay) {
        return { missing: true, sectionName };
      }

      const panelRect = panel.getBoundingClientRect();
      const probes = Array.from(
        overlay.querySelectorAll(
          'button, a[href], [role="button"], canvas, [data-rail-booklet], [class*="interactive"], [class*="discHitArea"]',
        ),
      )
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const left = Math.max(rect.left, panelRect.left, 0);
          const right = Math.min(rect.right, panelRect.right, window.innerWidth);
          const top = Math.max(rect.top, panelRect.top, 0);
          const bottom = Math.min(rect.bottom, panelRect.bottom, window.innerHeight);
          if (
            !element.getClientRects().length ||
            right <= left ||
            bottom <= top ||
            rect.width < 3 ||
            rect.height < 3
          ) {
            return null;
          }

          const x = left + (right - left) / 2;
          const y = top + (bottom - top) / 2;
          const winner = document.elementsFromPoint(x, y)[0];
          const winnerOverlay = Boolean(winner?.closest("[data-rail-overlay]"));

          return {
            tag: element.tagName.toLowerCase(),
            role: element.getAttribute("role"),
            label:
              element.getAttribute("aria-label") ||
              element.textContent?.trim().slice(0, 50) ||
              "",
            pointerEvents: getComputedStyle(element).pointerEvents,
            probe: { x, y },
            winner: winner
              ? winner.tagName.toLowerCase() +
                (winner.getAttribute("aria-label")
                  ? "[" + winner.getAttribute("aria-label") + "]"
                  : "")
              : null,
            winnerOverlay,
          };
        })
        .filter(Boolean)
        .slice(0, 30);

      return {
        missing: false,
        sectionName,
        chapter: root.getAttribute("data-chapter"),
        deckInteractive: root.getAttribute("data-deck-interactive"),
        overlayInert: overlay.hasAttribute("inert"),
        panelInert: panel.hasAttribute("inert"),
        panelActive: panel.getAttribute("data-chapter-active"),
        probes,
      };
    }, target.section);

    console.log("[STAB-02 hit-test] " + JSON.stringify(diagnostics));
    expect(diagnostics.missing, JSON.stringify(diagnostics)).toBe(false);
    expect(diagnostics.chapter).toBe(String(target.index));
    expect(diagnostics.deckInteractive).toBe("false");
    expect(diagnostics.overlayInert).toBe(true);
    expect(diagnostics.panelInert).toBe(false);
    expect(diagnostics.panelActive).toBe("true");
    expect(
      diagnostics.probes.length,
      "La sonda no encontró ningún hit target visible del Deck superpuesto a " +
        target.section +
        ": " +
        JSON.stringify(diagnostics),
    ).toBeGreaterThan(0);

    const blockedTargets = diagnostics.probes.filter(
      (probe) => probe.winnerOverlay,
    );
    expect(
      blockedTargets,
      "El hit-test real debe excluir el Deck pinned en " +
        target.section +
        ": " +
        JSON.stringify(diagnostics),
    ).toHaveLength(0);
  }
});

test("STAB-02: modal de Colección devuelve foco y libera scroll lock", async ({
  page,
}) => {
  test.skip(!RAIL_ENABLED, "STAB-02 requiere el rail habilitado.");

  await openRail(page);
  await goToChapter(page, "Colección", 3);

  const card = page.locator(
    'section[aria-label="La Colección"] button[aria-label*="—"]',
  ).first();
  await expect(card).toBeVisible();
  await card.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-modal-open", "true");
  const closeButton = dialog.getByRole("button", { name: "Cerrar" }).last();
  await expect(closeButton).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-modal-open", "true");
  await expect(card).toBeFocused();

  await page.mouse.move(1100, 700);
  await page.mouse.wheel(0, 1000);
  await expect.poll(() => currentChapter(page), { timeout: 8_000 }).toBe("4");
});

test("STAB-02: búsqueda, filtros y paginación siguen accesibles en ventanas bajas y anchas", async ({
  page,
}) => {
  test.skip(!RAIL_ENABLED, "STAB-02 requiere el rail habilitado.");

  await openRail(page, { width: 1920, height: 1080, albumCount: 36 });
  await goToChapter(page, "Colección", 3);

  const collection = page.locator('section[aria-label="La Colección"]');
  const search = page.getByRole("searchbox", {
    name: "Buscar artista o álbum",
  });
  await expect(search).toBeVisible();

  await search.fill("Neon Rooms");
  await expect(collection).toContainText("2 / 36 DISCOS");

  await search.fill("");
  await expect(collection).toContainText("36 / 36 DISCOS");

  const next = collection.getByRole("button", { name: /SIGUIENTE/ });
  const previous = collection.getByRole("button", { name: /ANTERIOR/ });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(collection).toContainText("PÁGINA 2/2");
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect(collection).toContainText("PÁGINA 1/2");

  await collection.getByRole("button", { name: "2020s", exact: true }).click();
  await expect(collection).toContainText("PÁGINA 1/1");
  await collection.getByRole("button", { name: "ARCHIVO", exact: true }).click();
  await expect(collection).toContainText("PÁGINA 1/1");

  for (const size of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1280, height: 540 },
    // Effective CSS viewport approximation for a 1366×768 display at 125% UI zoom.
    // This is not a substitute for checking native browser zoom manually.
    { width: 1092, height: 614 },
    { width: 761, height: 540 },
  ]) {
    await page.setViewportSize(size);
    await goToChapter(page, "Colección", 3);

    const controls = [
      search,
      collection.getByRole("button", { name: "TODAS", exact: true }),
      collection.getByRole("button", { name: "ARCHIVO", exact: true }),
      previous,
    ];

    for (const control of controls) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box, "Falta bounding box para un control en " + JSON.stringify(size)).not.toBeNull();
      expect(box.x, "Control fuera del borde izquierdo: " + JSON.stringify(size)).toBeGreaterThanOrEqual(0);
      expect(box.y, "Control fuera del borde superior: " + JSON.stringify(size)).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, "Control fuera del borde derecho: " + JSON.stringify(size)).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height, "Control fuera del borde inferior: " + JSON.stringify(size)).toBeLessThanOrEqual(size.height);
    }
  }
});
