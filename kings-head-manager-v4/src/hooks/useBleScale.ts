import { useCallback, useRef, useState } from 'react';

// Salter Smart Scale Pro (KG2362BT / Chipsea "Healthcare eLectronic" module).
// Service 0xFFE0, characteristic 0xFFE1 (notify) streams 7-byte frames:
//   [0]=0x08 [1]=0x07 [2]=0x03 [3]=stability(0=settling,1=stable)
//   [4..5]=weight grams (big-endian) [6]=0x00
const SCALE_SERVICE = 0xffe0;
const SCALE_CHARACTERISTIC = 0xffe1;

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

interface UseBleScaleOptions {
  onWeight: (grams: number, stable: boolean) => void;
}

export function useBleScale({ onWeight }: UseBleScaleOptions) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deviceRef = useRef<BluetoothDevice | null>(null);

  const handleNotification = useCallback((event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value || value.byteLength < 6 || value.getUint8(0) !== 0x08) return;
    const stable = value.getUint8(3) === 1;
    const grams = (value.getUint8(4) << 8) | value.getUint8(5);
    onWeight(grams, stable);
  }, [onWeight]);

  const disconnect = useCallback(() => {
    deviceRef.current?.gatt?.disconnect();
  }, []);

  const connect = useCallback(async () => {
    setError(null);
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
    }
  }, [handleNotification]);

  return { connect, disconnect, connected, error };
}
