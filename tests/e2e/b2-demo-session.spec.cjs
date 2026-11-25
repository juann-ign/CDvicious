const fs = require("node:fs");
const { test, expect, collection, findArtistEdition, cards, booklet, lyricFaces, functionalFixture, openRail, go, visibleLyrics } = require("./support/b2-harness.cjs");

// This suite uses the ordinary demo routes and player. No response interceptors,
// test URL parameters, injected track snapshots or provider credentials.
const NEON = { id: "mock-album-01", name: "Neon Rooms", artist: "Vértice Magnético" };
const NOCTURNAL = { id: "mock-album-02", name: "Nocturnal FM", artist: "Satélite Sur" };
const CAMPO = { id: "demo-vertice-album-0", name: "Campo magnético", artist: "Vértice Magnético" };
const tracks = {
  ventana: { id: "mock-track-mock-album-01-1", name: "Ventana de neón", duration: 203, first: "Ventana de neón: la tarde guarda un tren." },
  ascensor: { id: "mock-track-mock-album-01-2", name: "Ascensor azul", duration: 187, first: "Ascensor azul: subimos sin contar los pisos." },
  mapa: { id: "mock-track-mock-album-01-3", name: "Mapa de azoteas", duration: 321, first: "Mapa de azoteas: dibujo la ciudad que todavía no existe." },
  instrumental: { id: "mock-track-mock-album-01-4", name: "Interludio de vidrio", duration: 164, status: "instrumental" },
  unavailable: { id: "mock-track-mock-album-01-5", name: "Postal sin remitente", duration: 218, status: "unavailable" },
  antena: { id: "mock-track-mock-album-02-1", name: "Antena del sur", duration: 214, first: "Antena del sur: la lluvia cambia de estación." },
  orbita: { id: "mock-track-demo-vertice-album-0-1", name: "Órbita de papel", duration: 228, first: "Órbita de papel: tu carta rodea la mesa." },
  campo: { id: "mock-track-demo-vertice-album-0-2", name: "Campo abierto", duration: 241, first: "Campo abierto: el horizonte aprende nuestros nombres." },
};
let http;
let providerRequests;

test.beforeEach(async ({ page }) => {
  await functionalFixture(page);
  http = [];
  providerRequests = [];
  page.on("request", (request) => {
    if (/lrclib\.net|api\.spotify\.com/.test(request.url())) providerRequests.push(request.url());
  });
  page.on("response", async (response) => {
    if (!/\/api\/(lyrics|collection|album\/[^/]+\/tracks|play)(\?|$)/.test(response.url())) return;
    const row = { url: response.url(), status: response.status() };
    http.push(row);
    row.body = await response.json().catch(() => null);
  });
  await page.addInitScript(() => {
    window.__demoPlaybackConfirmations = [];
    window.addEventListener("cdvicious:disc-flight-playback-started", (event) => {
      window.__demoPlaybackConfirmations.push(event.detail.snapshot);
    });
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const state = await page.evaluate(() => ({
    confirmations: window.__demoPlaybackConfirmations,
    vfd: document.querySelector('[data-testid="deck-now-playing"]')?.textContent,
    trackId: document.querySelector('[data-testid="lyrics-booklet"]')?.getAttribute("data-track-id"),
    status: document.querySelector('[data-testid="lyrics-booklet"]')?.getAttribute("data-status"),
    text: [...document.querySelectorAll('[data-rail-booklet] [data-testid="lyrics-content"]')].map((node) => node.textContent).join(""),
    collection: document.querySelector('[aria-label="La Colección"]')?.textContent,
  })).catch((error) => ({ error: error.message }));
  const record = { title: testInfo.title, status: testInfo.status, http, providerRequests, state };
  fs.writeFileSync(testInfo.outputPath("demo-session.json"), JSON.stringify(record, null, 2));
  await testInfo.attach("normal-demo-session", { body: JSON.stringify(record, null, 2), contentType: "application/json" });
  if (!page.isClosed()) await page.screenshot({ path: testInfo.outputPath("demo-session.png"), animations: "disabled" });
});

const nextTrack = (page) => page.getByRole("button", { name: "Pista siguiente del equipo", exact: true });
const previousTrack = (page) => page.getByRole("button", { name: "Pista anterior del equipo", exact: true });
const duration = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const responseFor = (name) => http.findLast((row) => new URL(row.url).pathname === "/api/lyrics" && new URL(row.url).searchParams.get("title") === name && row.body);

async function expectTrack(page, album, track) {
  await expect(page.getByTestId("deck-now-playing-track")).toHaveText(track.name);
  await expect(page.getByTestId("deck-now-playing-artist")).toHaveText(album.artist);
  await expect(page.getByTestId("deck-now-playing")).toContainText(duration(track.duration));
  await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-track-id", track.id);
  await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-status", track.status || "available");
  await expect(booklet(page).getByRole("heading")).toHaveText(track.name);
  await expect.poll(() => responseFor(track.name)?.body.status).toBe(track.status || "available");
  const row = responseFor(track.name);
  const params = new URL(row.url).searchParams;
  expect(row.status).toBe(200);
  expect(params.get("artist")).toBe(album.artist);
  expect(params.get("album")).toBe(album.name);
  expect(params.get("duration")).toBe(String(track.duration));
  expect(row.body.provenance.provider).toBe("demo");
  if (track.first) {
    expect(row.body.lyrics.split("\n")[0]).toBe(track.first);
    await expect(lyricFaces(page).first()).toContainText(track.first);
    expect(await visibleLyrics(page)).not.toContain("La ciudad se enciende detrás del cristal");
  } else {
    expect(row.body.lyrics).toBeNull();
    await expect(page.getByTestId("lyrics-status")).toContainText(track.status === "instrumental" ? "PISTA INSTRUMENTAL" : "LETRA NO DISPONIBLE");
    expect(await visibleLyrics(page)).toBe("");
  }
}

async function expectConfirmedAlbum(page, album) {
  await expect.poll(() => page.evaluate(() => window.__demoPlaybackConfirmations.at(-1)?.track?.album?.id), { timeout: 40000 }).toBe(album.id);
  const snapshot = await page.evaluate(() => window.__demoPlaybackConfirmations.at(-1));
  expect(snapshot.isPlaying).toBe(true);
  expect(snapshot.track.album.name).toBe(album.name);
  expect(snapshot.track.artists.map((artist) => artist.name)).toEqual([album.artist]);
  expect(snapshot.durationMs).toBe(snapshot.track.duration_ms);
  await expect(page.locator("[data-rail-wrapper]").locator("..")).toHaveAttribute("data-rail-moving", "false");
}

async function playCollectionAlbum(page, album, firstTrack) {
  await go(page, "Colección", 3);
  await collection(page).getByRole("button", { name: `${album.artist} — ${album.name}`, exact: true }).click();
  const dialog = page.getByTestId("album-detail-page");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(firstTrack.name);
  await expect.poll(() => http.findLast((row) => new URL(row.url).pathname === `/api/album/${album.id}/tracks`)?.body?.tracks?.length).toBe(10);
  const list = http.findLast((row) => new URL(row.url).pathname === `/api/album/${album.id}/tracks`).body.tracks;
  expect(list[0]).toMatchObject({ id: firstTrack.id, name: firstTrack.name, track_number: 1, duration_ms: firstTrack.duration * 1000 });
  await dialog.getByRole("button", { name: `Reproducir ${album.name}`, exact: true }).click();
  await expectConfirmedAlbum(page, album);
  await go(page, "Split", 1);
}

test("mock normal: álbum, pista siguiente, cambio rápido, letra larga y estados explícitos coinciden con el VFD", async ({ page }) => {
  await openRail(page);
  await playCollectionAlbum(page, NEON, tracks.ventana);
  await expectTrack(page, NEON, tracks.ventana);
  await nextTrack(page).click();
  await expectTrack(page, NEON, tracks.ascensor);
  expect(responseFor(tracks.ventana.name).body.lyrics).not.toBe(responseFor(tracks.ascensor.name).body.lyrics);
  // Real rapid controls: the intermediate track may finish or be cancelled.
  await nextTrack(page).click();
  await nextTrack(page).click();
  await nextTrack(page).click();
  await expectTrack(page, NEON, tracks.unavailable);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expectTrack(page, NEON, tracks.unavailable);
  await previousTrack(page).click();
  await expectTrack(page, NEON, tracks.instrumental);
  await previousTrack(page).click();
  await expectTrack(page, NEON, tracks.mapa);
  await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-pagination-state", "ready");
  expect(Number(await page.getByTestId("lyrics-booklet").getAttribute("data-pagination-count"))).toBeGreaterThan(2);
  const text = [];
  for (let index = 0; index < 100; index++) {
    const spread = await visibleLyrics(page);
    text.push(spread);
    const next = booklet(page).getByRole("button", { name: "Páginas siguientes", exact: true });
    if (await next.count() === 0 || await next.isDisabled()) break;
    await next.click();
    await expect.poll(() => visibleLyrics(page)).not.toBe(spread);
    if (index === 99) throw new Error("La letra demo no terminó en 100 spreads");
  }
  expect(text.join("")).toBe(responseFor(tracks.mapa.name).body.lyrics);
  await playCollectionAlbum(page, NOCTURNAL, tracks.antena);
  await expectTrack(page, NOCTURNAL, tracks.antena);
  expect(await visibleLyrics(page)).not.toContain(tracks.mapa.first);
  expect(providerRequests).toEqual([]);
});

test("mock normal: Explorar artista reproduce y avanza dentro del álbum elegido", async ({ page }) => {
  await openRail(page);
  await go(page, "Colección", 3);
  const source = await findArtistEdition(page, CAMPO.artist, CAMPO.id);
  await source.click();
  const detail = page.getByTestId("album-detail-page");
  await expect(detail).toHaveAttribute("data-album-id", CAMPO.id);
  await expect(detail.getByTestId("jewel-case-presentation")).toHaveAttribute("data-presentation", "closed");
  await detail.getByRole("button", { name: `Reproducir ${CAMPO.name}`, exact: true }).click();
  await expectConfirmedAlbum(page, CAMPO);
  await go(page, "Split", 1);
  await expectTrack(page, CAMPO, tracks.orbita);
  await nextTrack(page).click();
  await expectTrack(page, CAMPO, tracks.campo);
  expect(responseFor(tracks.campo.name).body.lyrics).not.toBe(responseFor(tracks.orbita.name).body.lyrics);
  expect(providerRequests).toEqual([]);
});

test("mock normal: búsqueda, género compartido y década combinan el catálogo de sesión", async ({ page }) => {
  await openRail(page);
  await go(page, "Colección", 3);
  const finder = page.getByRole("combobox", { name: "Buscar discos o artistas", exact: true });
  const genres = collection(page).locator('[aria-label="Filtrar por género"]');
  const decades = collection(page).locator('[aria-label="Filtrar por década"]');
  await expect(cards(page).first()).toBeVisible();
  const initialIds = await cards(page).evaluateAll((nodes) => nodes.map((node) => node.dataset.collectionAlbumId));
  await expect(genres.locator('option[value="electronic"]')).toBeAttached();
  await genres.selectOption("electronic");
  await decades.selectOption("1990s");
  await expect(cards(page)).toHaveCount(2); // Vértice and Satélite share this genre.
  await expect(cards(page).filter({ hasText: "Satélite Sur" })).toHaveCount(1);
  await finder.fill("Vertice Campo magnetico");
  await finder.press("Enter");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toHaveAccessibleName(`${CAMPO.artist} — ${CAMPO.name}`);
  await genres.selectOption("all");
  await expect(cards(page)).toHaveCount(1);
  await decades.selectOption("2020s");
  await expect(cards(page)).toHaveCount(0);
  await expect(collection(page).getByText("Sin resultados para estos filtros")).toBeVisible();
  await finder.fill("Vertice Neon Rooms");
  await finder.press("Enter");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toHaveAccessibleName(`${NEON.artist} — ${NEON.name}`);
  await collection(page).getByRole("button", { name: "Limpiar filtros", exact: true }).click();
  await expect(finder).toHaveValue("");
  await expect.poll(() => cards(page).evaluateAll((nodes) => nodes.map((node) => node.dataset.collectionAlbumId))).toEqual(initialIds);
  expect(providerRequests).toEqual([]);
});
