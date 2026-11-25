// Synthetic provider responses. These IDs are deliberately not Spotify IDs;
// each match comes from the response fixture, not an artist-to-genre label.
const latinArtists = [
  { id: "fixture-charly", name: "Charly García" },
  { id: "fixture-soda", name: "Soda Stereo" },
  { id: "fixture-patricio", name: "Patricio Rey y sus Redonditos de Ricota" },
  { id: "fixture-cafe", name: "Café Tacvba" },
];
const page = (ids, offset = 0, total = ids.length, next = null) => ({ artists: {
  items: ids.map((id) => ({ id })), offset, limit: 10, total, next,
} });
module.exports = { latinArtists, page };
