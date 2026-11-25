export interface ControlPlayer {
  getVolume(): Promise<number>;
  setVolume(value: number): Promise<void>;
  previousTrack(): Promise<void>;
  nextTrack(): Promise<void>;
  togglePlay(): Promise<void>;
}
export interface ControlTarget { player: ControlPlayer; sdkDeviceId: string; deviceId: string }
export interface PlayerCapabilities { volumeSupported: boolean; transportSupported: boolean; volume: number | null }
export interface CanonicalControlState {
  deviceId: string | null;
  volume: number | null;
  volumeAvailable: boolean;
  volumeLoading: boolean;
  volumePending: boolean;
  volumeError: string | null;
  canControl: boolean;
  transportPending: boolean;
  transportError: string | null;
  blocked: boolean;
}
export const EMPTY_CONTROL_STATE: CanonicalControlState = Object.freeze({ deviceId: null, volume: null, volumeAvailable: false, volumeLoading: false, volumePending: false, volumeError: null, canControl: false, transportPending: false, transportError: null, blocked: false });
const clamp = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
const valid = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0 && value <= 1;

/** Pure state machine: only the current target/revision can publish an answer. */
export function createCanonicalPlayerControls(readCapabilities: (target: ControlTarget, signal: AbortSignal) => Promise<PlayerCapabilities>) {
  let state = EMPTY_CONTROL_STATE;
  let target: ControlTarget | null = null;
  let generation = 0, revision = 0, readSequence = 0;
  let reading: AbortController | null = null;
  let queued: { target: ControlTarget; generation: number; revision: number; value: number } | null = null;
  let writing = false;
  let confirmedVolume: number | null = null;
  let previousVolume: number | null = null;
  const listeners = new Set<() => void>();
  const publish = (changes: Partial<CanonicalControlState>) => { state = Object.freeze({ ...state, ...changes }); listeners.forEach(listener => listener()); };
  const refreshVolume = async () => {
    if (!target || state.blocked) return;
    reading?.abort();
    const controller = reading = new AbortController();
    const owner = target, epoch = generation, version = revision, sequence = ++readSequence;
    // Background capability reads must not disable a slider mid-gesture.
    // Initial/device/recovery reads remain explicitly unavailable/loading.
    publish({ volumeLoading: state.volume === null || !state.volumeAvailable, volumeError: null });
    try {
      const capabilities = await readCapabilities(owner, controller.signal);
      if (epoch !== generation || controller.signal.aborted || sequence !== readSequence || state.blocked) return;
      const local = owner.deviceId === owner.sdkDeviceId;
      if (version !== revision) { publish({ volumeLoading: false, volumeAvailable: local && capabilities.volumeSupported && state.volume !== null, canControl: local && capabilities.transportSupported }); return; }
      confirmedVolume = valid(capabilities.volume) ? capabilities.volume : null;
      if (confirmedVolume && confirmedVolume > 0) previousVolume = confirmedVolume;
      publish({ volume: confirmedVolume, volumeLoading: false,
        volumeAvailable: local && capabilities.volumeSupported && confirmedVolume !== null,
        canControl: local && capabilities.transportSupported,
        volumeError: !local ? "El dispositivo activo es otro. Activá este reproductor para controlarlo." : !capabilities.volumeSupported ? "Este dispositivo no permite controlar el volumen." : confirmedVolume === null ? "El dispositivo no informó su volumen." : null });
    } catch {
      if (epoch !== generation || controller.signal.aborted || sequence !== readSequence || state.blocked) return;
      // A capability/volume read failure does not remove the transport API
      // already supplied by a ready local SDK player. External devices remain
      // unavailable through that SDK and write volume stays disabled.
      publish({ volumeLoading: false, volumeAvailable: false, canControl: owner.deviceId === owner.sdkDeviceId, volumeError: "No se pudieron consultar las capacidades del dispositivo. Reintentá." });
    }
  };
  async function pump() {
    if (writing) return;
    writing = true;
    try {
      while (queued) {
        const operation = queued; queued = null;
        if (operation.generation !== generation || state.blocked) continue;
        try {
          await operation.target.player.setVolume(operation.value);
          if (operation.generation !== generation || state.blocked) continue;
          confirmedVolume = operation.value;
          if (operation.value > 0) previousVolume = operation.value;
          if (operation.revision === revision) publish({ volume: operation.value, volumePending: false, volumeError: null });
        } catch {
          if (operation.generation === generation && operation.revision === revision && !state.blocked) publish({ volume: confirmedVolume, volumePending: false, volumeError: "No se pudo cambiar el volumen. Reintentá." });
        }
      }
    } finally { writing = false; }
  }
  const setVolume = (value: number) => {
    if (!target || !state.volumeAvailable || state.blocked || !Number.isFinite(value)) return;
    const volume = clamp(value);
    queued = { target, generation, revision: ++revision, value: volume };
    publish({ volume, volumePending: true, volumeError: null });
    // Collapse a burst before the first SDK call and retain only the last
    // desired value while a previous write is actually in flight.
    void Promise.resolve().then(pump);
  };
  const configure = (next: ControlTarget | null) => {
    if (target?.player === next?.player && target?.deviceId === next?.deviceId && target?.sdkDeviceId === next?.sdkDeviceId) return;
    reading?.abort(); ++generation; ++revision; queued = null; target = next;
    confirmedVolume = null; previousVolume = null;
    publish({ ...EMPTY_CONTROL_STATE, deviceId: next?.deviceId ?? null, blocked: state.blocked });
    if (next) void refreshVolume();
  };
  const setBlocked = (blocked: boolean) => {
    if (state.blocked === blocked) return;
    if (blocked) { ++revision; reading?.abort(); queued = null; publish({ blocked, volumePending: false, volumeLoading: false }); }
    else { publish({ blocked }); void refreshVolume(); }
  };
  const transport = async (action: "previousTrack" | "nextTrack" | "togglePlay") => {
    if (!target || !state.canControl || state.blocked || state.transportPending) return;
    const owner = target, epoch = generation;
    publish({ transportPending: true, transportError: null });
    try { await owner.player[action](); }
    catch { if (epoch === generation) publish({ transportError: "El dispositivo no aceptó el control. Reintentá." }); }
    finally { if (epoch === generation) publish({ transportPending: false }); }
  };
  return { getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    configure, setBlocked, refreshVolume, setVolume,
    toggleMute: () => setVolume(state.volume === 0 ? previousVolume ?? 0.5 : 0),
    previous: () => transport("previousTrack"), next: () => transport("nextTrack"), toggle: () => transport("togglePlay") };
}
