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
    deviceRef.current = null;
  }, [handleNotification]);

  const disconnect = useCallback(() => {
    deviceRef.current?.gatt?.disconnect();
    cleanupConnection();
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
      device.addEventListener('gattserverdisconnected', () => {
        cleanupConnection();
        setConnected(false);
      });

      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(SCALE_SERVICE);
      const characteristic = await service.getCharacteristic(SCALE_CHARACTERISTIC);
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', handleNotification);

      deviceRef.current = device;
      characteristicRef.current = characteristic;
      setConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to scale');
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  }, [handleNotification, cleanupConnection]);

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
      deviceRef.current?.gatt?.disconnect();
      cleanupConnection();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connect, disconnect, connected, connecting, error };
}
