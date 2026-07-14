# ThermoPro TP25H2 BLE Protocol Decode Guide

This guide details the reverse-engineered Bluetooth Low Energy (BLE) protocol for the **ThermoPro TP25H2** dual-probe wireless meat thermometer. It provides the exact byte layout, the custom Binary-Coded Decimal (BCD) temperature formula, and a TypeScript reference implementation for your React hook.

---

## 1. BLE GATT Configuration

*   **Custom GATT Service UUID**: `1086fff0-3343-4817-8bb2-b32206336ce8`
*   **Write/Command Characteristic (FFF1)**: `1086fff1-3343-4817-8bb2-b32206336ce8` (Properties: `read, write`)
*   **Read/Notify Characteristic (FFF2)**: `1086fff2-3343-4817-8bb2-b32206336ce8` (Properties: `read, notify`)

---

## 2. The Handshake & Activation Sequence

Because the thermometer enters a low-power idle state when not connected, it will **not update its temperatures** and will **automatically disconnect after 15–20 seconds** unless activated.

To start live streaming:
1.  **Connect** to the thermometer via BLE.
2.  **Subscribe/Start Notifications** on Characteristic `FFF2`.
3.  **Write the 12-byte Handshake Payload** to Characteristic `FFF1`:
    `01 09 8a 7a 13 b7 3e d6 8b 67 c2 a0` (in hex)
4.  The device will respond with an acknowledgment notification on `FFF2` (beginning with `01`), and then immediately begin streaming live temperature updates (command `0x30`) approximately **once per second**.

---

## 3. Telemetry Notification Frame Layout (Command `0x30`)

When live streaming, notifications received on `FFF2` start with the header byte `0x30`. The frame is typically 20 bytes long and has the following byte offsets:

| Byte Offset | Field Description | Format |
| :--- | :--- | :--- |
| `0` | Command ID (`0x30`) | Static Hex |
| `1` | Payload length | Hex |
| `2` | Battery level (%) | Unsigned Int (`0`–`100`) |
| `3` | Device Mode / Unit settings | Bitmask |
| `4` | Active probe count (defaults to `4` if `0x00`) | Unsigned Int |
| `5` - `6` | **Probe 1 Temperature** | 2-byte Custom BCD |
| `7` - `8` | **Probe 2 Temperature** | 2-byte Custom BCD |
| `9` - `10` | **Probe 3 Temperature** | 2-byte Custom BCD |
| `11` - `12` | **Probe 4 Temperature** | 2-byte Custom BCD |

*Note: For the 2-probe model (TP25H2), the readings will be populated in the slots corresponding to the physical ports plugged in (for example, Probe 2 at bytes 7-8 and Probe 4 at bytes 11-12).*

---

## 4. Temperature BCD Decoding Formula

Each probe reading is represented by 2 bytes: `byte1` (most significant) and `byte2` (least significant). The temperature is Celsius-native.

### A. Sentinel States
Before decoding, check for "no reading" or sensor error sentinels:
*   `0xFF, 0xFF`: Probe is **disconnected / not plugged in** (should map to `null` or `undefined`).
*   `0xDD, 0xDD`: Underflow / Sensor Error.
*   `0xEE, 0xEE`: Overflow / Sensor Error.

### B. Bitmask Decoding Math
If the bytes are not sentinels, perform the following decoding:
1.  **Sign Flag**: Check the most significant bit of `byte1`:
    $$\text{isNegative} = (\text{byte1} \ \& \ \text{0x80}) \neq 0$$
2.  **Hundreds Digit**: Extract bits 4–6 from `byte1` and multiply by 100:
    $$\text{hundreds} = \left(\frac{\text{byte1} \ \& \ \text{0x70}}{16}\right) \times 100$$
3.  **Tens Digit**: Extract the lower 4 bits (nibble) of `byte1` and multiply by 10:
    $$\text{tens} = (\text{byte1} \ \& \ \text{0x0F}) \times 10$$
4.  **Ones Digit**: Extract the upper 4 bits (nibble) of `byte2` and multiply by 1:
    $$\text{ones} = \frac{\text{byte2} \ \& \ \text{0xF0}}{16}$$
5.  **Tenths Digit**: Extract the lower 4 bits (nibble) of `byte2` and multiply by 0.1:
    $$\text{tenths} = (\text{byte2} \ \& \ \text{0x0F}) \times 0.1$$
6.  **Calculate Total**:
    $$\text{temp} = \text{hundreds} + \text{tens} + \text{ones} + \text{tenths}$$
    If $\text{isNegative}$ is true, negate the temperature.

### Celsius to Fahrenheit conversion (optional display logic):
$$\text{temp}_F = (\text{temp}_C \times 1.8) + 32$$

---

## 5. TypeScript Reference Implementation

Here is the clean decoder logic ready for your React Hook:

```typescript
export interface ProbeReadings {
  probe1: number | null;
  probe2: number | null;
  probe3: number | null;
  probe4: number | null;
  battery: number;
}

/**
 * Decodes 2 bytes of BCD temperature data into a Celsius float.
 */
export function decodeBcdTemperature(byte1: number, byte2: number): number | null {
  // Disconnected / sentinel states
  if (byte1 === 0xFF && byte2 === 0xFF) return null; // Disconnected
  if (byte1 === 0xDD && byte2 === 0xDD) return null; // Underflow
  if (byte1 === 0xEE && byte2 === 0xEE) return null; // Overflow

  const isNegative = (byte1 & 0x80) !== 0;
  
  const hundreds = ((byte1 & 0x70) >> 4) * 100;
  const tens = (byte1 & 0x0F) * 10;
  const ones = (byte2 & 0xF0) >> 4;
  const tenths = (byte2 & 0x0F) * 0.1;

  let temp = hundreds + tens + ones + tenths;
  if (isNegative) {
    temp = -temp;
  }
  return temp;
}

/**
 * Parses the raw 20-byte telemetry notification from FFF2.
 */
export function parseTelemetryFrame(dataView: DataView): ProbeReadings | null {
  if (dataView.byteLength < 6) return null;
  
  const cmd = dataView.getUint8(0);
  if (cmd !== 0x30) return null; // Not a telemetry frame

  const battery = dataView.getUint8(2);
  const probeCount = dataView.getUint8(4) || 4;

  const readings: ProbeReadings = {
    probe1: null,
    probe2: null,
    probe3: null,
    probe4: null,
    battery
  };

  // Decode up to 4 probes
  if (dataView.byteLength >= 7) {
    readings.probe1 = decodeBcdTemperature(dataView.getUint8(5), dataView.getUint8(6));
  }
  if (dataView.byteLength >= 9) {
    readings.probe2 = decodeBcdTemperature(dataView.getUint8(7), dataView.getUint8(8));
  }
  if (dataView.byteLength >= 11) {
    readings.probe3 = decodeBcdTemperature(dataView.getUint8(9), dataView.getUint8(10));
  }
  if (dataView.byteLength >= 13) {
    readings.probe4 = decodeBcdTemperature(dataView.getUint8(11), dataView.getUint8(12));
  }

  return readings;
}
```
