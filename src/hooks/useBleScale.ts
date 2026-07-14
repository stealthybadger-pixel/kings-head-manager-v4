import { useCallback, useEffect, useRef, useState } from 'react';

// Salter Smart Scale Pro (KG2362BT / Chipsea "Healthcare eLectronic" module).
// Service 0xFFE0, characteristic 0xFFE1 (notify) streams 7-byte frames:
//   [0]=0x08 [1]=0x07 [2]=0x03 [3]=stability(0=settling,1=stable)
//   [4..5]=weight grams (big-endian) [6]=0x00
// Full canonical 128-bit UUIDs — some Web Bluetooth implementations (e.g. Bluefy on iOS)
// don't reliably resolve the bare 16-bit shorthand (0xffe0) the way Chrome does.
const SCALE_SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb';
const SCALE_CHARACTERISTIC = '0000ffe1-0000-1000-8000-00805f9b34fb';

// How often (ms) we flush the latest scale reading into React state. The scale streams
// notifications several times a second — on a weak device, reacting to every single one
// causes visible lag/crashes. We keep the latest reading in a ref (cheap) and only push
// it into state on this cadence.
const FLUSH_INTERVAL_MS = 180;

// The Web Bluetooth device.id that was last paired via the chooser, remembered so we can
// silently reconnect to the same scale after a refresh via getDevices() (which returns
// every granted device — we can't tell the scale from the thermometer without this).
const SAVED_DEVICE_KEY = 'bleScaleDeviceId';

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

interface UseBleScaleOptions {
  onWeight: (grams: number, stable: boolean) => void;
}

export function useBleScale({ onWeight }: UseBleScaleOptions) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const latestReadingRef = useRef<{ grams: number; stable: boolean } | null>(null);
  const flushTimerRef = useRef<number>();
  const wantConnectedRef = useRef(false); // true between connect()/autoConnect() and disconnect()

  // Keep the latest onWeight callback in a ref so the flush loop always calls the
  // current version without needing to restart the interval when it changes identity.
  const onWeightRef = useRef(onWeight);
  useEffect(() => { onWeightRef.current = onWeight; }, [onWeight]);

  const handleNotification = useCallback((event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value || value.byteLength < 6 || value.getUint8(0) !== 0x08) return;
    const stable = value.getUint8(3) === 1;
    const grams = (value.getUint8(4) << 8) | value.getUint8(5);
    // Scale's max capacity is 10kg — anything above that is a corrupted/glitched BLE packet, not a real reading.
    if (grams > 10000) return;
    latestReadingRef.current = { grams, stable };
  }, []);

  const cleanupConnection = useCallback(() => {
    if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    characteristicRef.current?.removeEventListener('characteristicvaluechanged', handleNotification);
    characteristicRef.current = null;
  }, [handleNotification]);

  // Open the GATT session + subscribe to weight notifications. Shared by connect() and
  // autoConnect() so both go through identical setup.
  const openSession = useCallback(async (device: BluetoothDevice) => {
    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(SCALE_SERVICE);
    const characteristic = await service.getCharacteristic(SCALE_CHARACTERISTIC);
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', handleNotification);
    characteristicRef.current = characteristic;
    setConnected(true);
  }, [handleNotification]);

  const registerAndOpen = useCallback(async (device: BluetoothDevice) => {
    wantConnectedRef.current = true;
    deviceRef.current = device;
    try { if (device.id) localStorage.setItem(SAVED_DEVICE_KEY, device.id); } catch { /* ignore */ }
    device.addEventListener('gattserverdisconnected', () => {
      cleanupConnection();
      setConnected(false);
      // Silently reconnect while the user still wants the scale (e.g. it dropped mid-weigh),
      // rather than forcing a manual re-link.
      if (wantConnectedRef.current && deviceRef.current) {
        setTimeout(() => {
          if (wantConnectedRef.current && deviceRef.current) {
            openSession(deviceRef.current).catch((e) => setError(e?.message || 'Reconnect failed'));
          }
        }, 1000);
      }
    });
    await openSession(device);
  }, [cleanupConnection, openSession]);

  const disconnect = useCallback(() => {
    wantConnectedRef.current = false;
    deviceRef.current?.gatt?.disconnect();
    cleanupConnection();
    deviceRef.current = null;
    setConnected(false);
  }, [cleanupConnection]);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SCALE_SERVICE] }],
        optionalServices: [SCALE_SERVICE],
      });
      await registerAndOpen(device);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to scale');
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  }, [registerAndOpen]);

  // Silent reconnect to the previously-paired scale with no chooser popup — matches the
  // saved device.id against getDevices(). Returns false (without hard error) when the API
  // is unavailable or the scale hasn't been paired on this device yet, so the caller can
  // fall back to connect(). Waits for one advertisement if a direct connect fails (device
  // asleep / freshly out of range).
  const autoConnect = useCallback(async (): Promise<boolean> => {
    if (connected || connecting) return true;
    const bt = navigator.bluetooth as any;
    if (!bt || typeof bt.getDevices !== 'function') return false;
    let savedId: string | null = null;
    try { savedId = localStorage.getItem(SAVED_DEVICE_KEY); } catch { /* ignore */ }
    if (!savedId) return false;
    try {
      const devices: BluetoothDevice[] = await bt.getDevices();
      const known = devices.find((d) => d.id === savedId);
      if (!known) return false;
      setError(null);
      setConnecting(true);
      try {
        await registerAndOpen(known);
        return true;
      } catch {
        const anyKnown = known as any;
        if (typeof anyKnown.watchAdvertisements === 'function') {
          const abort = new AbortController();
          const appeared = await new Promise<boolean>((resolve) => {
            known.addEventListener('advertisementreceived', () => resolve(true), { once: true } as any);
            anyKnown.watchAdvertisements({ signal: abort.signal }).catch(() => resolve(false));
            setTimeout(() => resolve(false), 8000);
          });
          abort.abort();
          if (appeared) {
            await registerAndOpen(known);
            return true;
          }
        }
        return false;
      }
    } catch {
      return false;
    } finally {
      setConnecting(false);
    }
  }, [connected, connecting, registerAndOpen]);

  // Throttled flush loop: only runs while connected, pushes at most one update per interval.
  useEffect(() => {
    if (!connected) return;
    const tick = () => {
      if (latestReadingRef.current) {
        onWeightRef.current(latestReadingRef.current.grams, latestReadingRef.current.stable);
      }
      flushTimerRef.current = window.setTimeout(tick, FLUSH_INTERVAL_MS);
    };
    flushTimerRef.current = window.setTimeout(tick, FLUSH_INTERVAL_MS);
    return () => window.clearTimeout(flushTimerRef.current);
  }, [connected]);

  // Full teardown on unmount (e.g. navigating away, tablet sleeping mid-connection).
  useEffect(() => {
    return () => {
      wantConnectedRef.current = false;
      deviceRef.current?.gatt?.disconnect();
      cleanupConnection();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanly release the connection when the page is refreshed/closed so the scale frees its
  // slot and keeps advertising — otherwise it can need a power-cycle to be re-found (same
  // issue as the ThermoPro probe).
  useEffect(() => {
    const releaseOnUnload = () => {
      try { deviceRef.current?.gatt?.disconnect(); } catch { /* best-effort on unload */ }
    };
    window.addEventListener('pagehide', releaseOnUnload);
    window.addEventListener('beforeunload', releaseOnUnload);
    return () => {
      window.removeEventListener('pagehide', releaseOnUnload);
      window.removeEventListener('beforeunload', releaseOnUnload);
    };
  }, []);

  return { connect, autoConnect, disconnect, connected, connecting, error };
}
