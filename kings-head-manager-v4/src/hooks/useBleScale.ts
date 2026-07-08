import { useCallback, useRef, useState } from 'react';

// Salter Smart Scale Pro (KG2362BT / Chipsea "Healthcare eLectronic" module).
// Service 0xFFE0, characteristic 0xFFE1 (notify) streams 7-byte frames:
//   [0]=0x08 [1]=0x07 [2]=0x03 [3]=stability(0=settling,1=stable)
//   [4..5]=weight grams (big-endian) [6]=0x00
// Full canonical 128-bit UUIDs — some Web Bluetooth implementations (e.g. Bluefy on iOS)
// don't reliably resolve the bare 16-bit shorthand (0xffe0) the way Chrome does.
const SCALE_SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb';
const SCALE_CHARACTERISTIC = '0000ffe1-0000-1000-8000-00805f9b34fb';

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
  const [lastRawHex, setLastRawHex] = useState<string>('');
  const deviceRef = useRef<BluetoothDevice | null>(null);

  const handleNotification = useCallback((event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const bytes: string[] = [];
    for (let i = 0; i < value.byteLength; i++) bytes.push(value.getUint8(i).toString(16).padStart(2, '0'));
    setLastRawHex(bytes.join(' '));
    if (value.byteLength < 6 || value.getUint8(0) !== 0x08) return;
    const stable = value.getUint8(3) === 1;
    const grams = (value.getUint8(4) << 8) | value.getUint8(5);
    // Scale's max capacity is 10kg — anything above that is a corrupted/glitched BLE packet, not a real reading.
    if (grams > 10000) return;
    onWeight(grams, stable);
  }, [onWeight]);

  const disconnect = useCallback(() => {
    deviceRef.current?.gatt?.disconnect();
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SCALE_SERVICE] }],
        optionalServices: [SCALE_SERVICE],
      });
      device.addEventListener('gattserverdisconnected', () => setConnected(false));

      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(SCALE_SERVICE);
      const characteristic = await service.getCharacteristic(SCALE_CHARACTERISTIC);
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', handleNotification);

      deviceRef.current = device;
      setConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to scale');
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  }, [handleNotification]);

  return { connect, disconnect, connected, connecting, error, lastRawHex };
}
