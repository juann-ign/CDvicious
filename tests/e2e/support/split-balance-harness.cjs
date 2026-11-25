// Projected physical faces and actual paper sheets are measured separately
// from their transparent scene/container bounds. The two static direct leaves
// exclude both animated sheets and hidden pagination measurement clones.
async function measureSplit(page) {
  return page.evaluate(() => {
    const rect = (node) => node?.getBoundingClientRect().toJSON() ?? null;
    const union = (boxes) => ({ left: Math.min(...boxes.map((box) => box.left)), right: Math.max(...boxes.map((box) => box.right)),
      top: Math.min(...boxes.map((box) => box.top)), bottom: Math.max(...boxes.map((box) => box.bottom)) });
    const deck = document.querySelector("[data-physical-deck]");
    const faces = [...deck.querySelectorAll("[data-deck-surface]")].map(rect);
    const leaves = [...document.querySelectorAll('[data-testid="lyrics-paper"] > [data-booklet-page-half]')].map(rect);
    const focus = document.querySelector('[role="region"][aria-label="Booklet de letras"]');
    const footer = document.querySelector("[data-global-player]");
    const glass = deck.querySelector("[data-deck-display-mirror]");
    const hit = (node) => {
      const box = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    };
    return {
      viewport: { width: innerWidth, height: innerHeight }, chapter: document.documentElement.dataset.chapter,
      nav: rect(document.querySelector("[data-shell-header]")), region: rect(document.querySelector("[data-rail-overlay]")),
      equipment: union(faces), front: rect(deck.querySelector("[data-deck-front]")), glass: rect(glass),
      title: rect(glass.querySelector("strong")), artist: rect(glass.querySelector('[class*="artist"]')), times: rect(glass.querySelector('[class*="progressTimes"]')),
      target: rect(deck.querySelector("[data-deck-disc-target]")),
      scene: { clientWidth: deck.querySelector("[data-deck-design-frame]").clientWidth, clientHeight: deck.querySelector("[data-deck-design-frame]").clientHeight },
      booklet: rect(document.querySelector('[data-testid="lyrics-booklet"]')), paper: rect(document.querySelector('[data-testid="lyrics-paper"]')),
      leaves, bookletFocus: rect(focus), physicalBooklet: union([...leaves, rect(focus)]),
      focus: { active: document.activeElement === focus, visible: focus.matches(":focus-visible"), outlineWidth: getComputedStyle(focus).outlineWidth, outlineOffset: getComputedStyle(focus).outlineOffset },
      controls: [...deck.querySelectorAll('[aria-label="Controles del equipo"] button')].map((node) => ({ label: node.getAttribute("aria-label"), rect: rect(node), hit: hit(node) })),
      knob: { rect: rect(deck.querySelector('[aria-label="Volumen del equipo"]')), hit: hit(deck.querySelector('[aria-label="Volumen del equipo"]')) },
      footer: { rect: rect(footer), hidden: footer.getAttribute("aria-hidden"), inert: Boolean(footer.closest("[inert]")), visibility: getComputedStyle(footer).visibility },
    };
  });
}

module.exports = { measureSplit };
