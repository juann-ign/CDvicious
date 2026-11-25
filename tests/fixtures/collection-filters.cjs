const makeAlbum = (id, release_date, genres = [], extra = {}) => ({
  id, name: `Álbum ${id}`, uri: `spotify:album:${id}`, release_date,
  artists: [{ id: `artist-${id}`, name: `Artista ${id}` }], images: [], genres,
  ...extra,
});
const coverage = (state, resolvedArtists, totalArtists, source = "spotify-artist") => ({ state, resolvedArtists, totalArtists, source });
const complete = [
  makeAlbum("present", "2024-03-01", [" Rock ", "rock", "", "  "], { genreMetadata: coverage("complete", 1, 1) }),
  makeAlbum("eighties", "1986", ["Synth Pop"], { genreMetadata: coverage("complete", 1, 1) }),
  makeAlbum("seventies", "1971-06", ["folk"], { genreMetadata: coverage("complete", 1, 1) }),
  makeAlbum("unknown", undefined, [], { genreMetadata: coverage("complete", 1, 1) }),
  makeAlbum("invalid", "2023-02-29", [], { genreMetadata: coverage("complete", 1, 1) }),
];
const empty = complete.map((album) => ({ ...album, genres: [] }));
const partial = complete.map((album, index) => index === 0 ? album : ({ ...album, genres: [], genreMetadata: coverage("unavailable", 0, 1) }));
module.exports = { makeAlbum, coverage, complete, empty, partial };
