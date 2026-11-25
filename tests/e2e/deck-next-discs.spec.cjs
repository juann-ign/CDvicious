const { test, expect, go, observeRequests } = require("./support/prototype-harness.cjs");
const { openRail } = require("./support/b2-harness.cjs");

test("Deck suggestions reuse saved discs and the shared album page and playback", async ({ page }) => {
  const requests = observeRequests(page);
  await openRail(page);
  await go(page, "Deck", 0);
  const toggle = page.getByRole("button", { name: "Siguiente disco", exact: true });
  const shelf = page.getByRole("region", { name: "Discos guardados para seguir escuchando" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(shelf).toHaveCount(0);
  await toggle.click();
  const album = shelf.getByRole("button").first();
  await expect(shelf.getByRole("button")).toHaveCount(3);
  const albumId = await album.getAttribute("data-batea-album-id");
  const geometry = await page.locator("[data-deck-next-discs]").evaluate((dock) => ({
    top: dock.getBoundingClientRect().top,
    reserved: document.querySelector("[data-global-player]").getBoundingClientRect().top,
  }));
  expect(geometry.top).toBeGreaterThan(geometry.reserved);

  await album.click();
  const detail = page.getByTestId("album-detail-page");
  await expect(detail).toHaveAttribute("data-album-id", albumId);
  await expect(shelf).toBeHidden();
  await detail.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(album).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(shelf).toHaveCount(0);
  await expect(toggle).toBeFocused();

  await go(page, "Split", 1);
  await expect(toggle).toHaveCount(0);
  await go(page, "Deck", 0);
  await toggle.click();
  await album.click();
  await detail.getByRole("button", { name: /^Reproducir / }).click();
  await expect(page.locator("[data-rail-overlay]")).toHaveAttribute("data-playback-phase", "confirmed");
  await expect(page.getByTestId("rail-flying-disc")).toHaveCount(0);
  expect(requests.play).toHaveLength(1);
  await expect(page.locator("html")).toHaveAttribute("data-chapter", "0");
});
