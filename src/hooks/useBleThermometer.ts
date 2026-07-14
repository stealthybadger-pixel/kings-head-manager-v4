import { useCallback, useEffect, useRef, useState } from 'react';

// ThermoPro TP25H2 dual-probe BLE meat thermometer.
// Custom vendor service 1086FFF0..., command char FFF1 (write), notify char FFF2.
// Protocol confirmed against the device + the daniel-corbett/thermopro-cli source
// (which decompiled it from the official ThermoPro Android app):
//   - Subscribe to FFF2, wait ~0.5s, then write a fixed 12-byte handshake to FFF1.
//   - Device then streams 0x30 frames ~1/sec: [0]=0x30 [2]=battery%
//     probes at byte offsets 5-6, 7-8, 9-10, 11-12 (2-byte custom BCD each).
//   - ff ff in a probe slot = probe unplugged.
// The device drops the link on a ~15-20s idle timer, so we re-send the handshake as a
// keepalive and auto-reconnect if it disconnects mid-use.
const THERMO_SERVICE = '1086fff0-3343-4817-8bb2-b32206336ce8';
const THERMO_WRITE = '1086fff1-3343-4817-8bb2-b32206336ce8';
const THERMO_NOTIFY = '1086fff2-3343-4817-8bb2-b32206336ce8';

// Verbatim from thermopro-cli create_handshake_command() — captured from the official app.
const HANDSHAKE = new Uint8Array([0x01, 0x09, 0x8a, 0x7a, 0x13, 0xb7, 0x3e, 0xd6, 0x8b, 0x67, 0xc2, 0xa0]);

const KEEPALIVE_MS = 5000;

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

// A single probe temperature in Celsius, or null when that slot has no probe plugged in.
export type ProbeTemp = number | null;

// Decode a 2-byte custom-BCD probe reading (q/c.java:88-99 in the decompiled app).
function decodeTemp(b1: number, b2: number): ProbeTemp {
  if (b1 === 0xff && b2 === 0xff) return null;   // probe unplugged
  if (b1 === 0xdd && b2 === 0xdd) return null;   // sensor underflow
  if (b1 === 0xee && b2 === 0xee) return null;   // sensor overflow
  const negative = (b1 & 0x80) !== 0;
  const hundreds = ((b1 & 0x70) >> 4) * 100;
  const tens = (b1 & 0x0f) * 10;
  const ones = (b2 & 0xf0) >> 4;
  const tenths = (b2 & 0x0f) * 0.1;
  const t = hundreds + tens + ones + tenths;
  return negative ? -t : t;
}

interface ThermometerState {
  probes: ProbeTemp[]; // length 4, index 0-3 = probe slots 1-4
  battery: number | null;
}

export function useBleThermometer() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<ThermometerState>({ probes: [null, null, null, null], battery: null });

  const deviceRef = useRef<BluetoothDevice | null>(null);
  const writeCharRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const notifyCharRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const keepaliveRef = useRef<number>();
  const wantConnectedRef = useRef(false); // true between connect() and disconnect() — gates auto-reconnect

  const handleNotification = useCallback((event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value || value.byteLength < 6) return;
    if (value.getUint8(0) !== 0x30) return; // only 0x30 frames carry temperatures
    const battery = value.getUint8(2);
    const probes: ProbeTemp[] = [];
    for (let i = 0; i < 4; i++) {
      const off = 5 + i * 2;
      probes.push(off + 1 < value.byteLength ? decodeTemp(value.getUint8(off), value.getUint8(off + 1)) : null);
    }
    setState({ probes, battery });
  }, []);

  const sendHandshake = useCallback(async () => {
    try {
      await writeCharRef.current?.writeValue(HANDSHAKE);
    } catch {
      // If the write fails the link is probably gone; the disconnect handler will reconnect.
    }
  }, []);

  const cleanup = useCallback(() => {
    if (keepaliveRef.current) window.clearInterval(keepaliveRef.current);
    notifyCharRef.current?.removeEventListener('characteristicvaluechanged', handleNotification);
    notifyCharRef.current = null;
    writeCharRef.current = null;
  }, [handleNotification]);

  // Establish the GATT session + run the handshake sequence. Shared by connect() and the
  // auto-reconnect path so both go through the identical init.
  const openSession = useCallback(async (device: BluetoothDevice) => {
    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(THERMO_SERVICE);
    notifyCharRef.current = await service.getCharacteristic(THERMO_NOTIFY);
    writeCharRef.current = await service.getCharacteristic(THERMO_WRITE);

    await notifyCharRef.current.startNotifications();
    notifyCharRef.current.addEventListener('characteristicvaluechanged', handleNotification);

    await new Promise((r) => setTimeout(r, 500));
    await sendHandshake();
    setConnected(true);

    if (keepaliveRef.current) window.clearInterval(keepaliveRef.current);
    keepaliveRef.current = window.setInterval(sendHandshake, KEEPALIVE_MS);
  }, [handleNotification, sendHandshake]);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [THERMO_SERVICE] }],
        optionalServices: [THERMO_SERVICE],
      });
      wantConnectedRef.current = true;
      deviceRef.current = device;

      device.addEventListener('gattserverdisconnected', () => {
        cleanup();
        setConnected(false);
        // The device idle-drops every ~15-20s; silently reconnect while the user still
        // wants a live reading, rather than surfacing a disconnect they didn't ask for.
        if (wantConnectedRef.current && deviceRef.current) {
          setTimeout(() => {
            if (wantConnectedRef.current && deviceRef.current) {
              openSession(deviceRef.current).catch((e) => setError(e?.message || 'Reconnect failed'));
            }
          }, 1000);
        }
      });

      await openSession(device);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to thermometer');
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  }, [cleanup, openSession]);

  const disconnect = useCallback(() => {
    wantConnectedRef.current = false;
    deviceRef.current?.gatt?.disconnect();
    cleanup();
    setConnected(false);
    setState({ probes: [null, null, null, null], battery: null });
  }, [cleanup]);

  // Full teardown on unmount (navigating away from the temp-check screen).
  useEffect(() => {
    return () => {
      wantConnectedRef.current = false;
      deviceRef.current?.gatt?.disconnect();
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connect, disconnect, connected, connecting, error, probes: state.probes, battery: state.battery };
}
