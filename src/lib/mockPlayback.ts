// The store is synchronous for React subscriptions. The build-time branch keeps
// its catalogue and lyrics out of the browser bundle shipped to Spotify users.
export const mockPlayback: typeof import("./mockSpotifyStore") | null =
  process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1"
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ? require("./mockSpotifyStore")
    : null;
