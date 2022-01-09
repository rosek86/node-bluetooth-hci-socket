// SPDX-Licence-Indentifier: MIT
// By: Yusuf Can INCE <ycanince@gmail.com>

/// <reference types="node" />
import { EventEmitter } from 'events';

interface Device {
    devId: number | null;
    devUp: boolean | null;
    /** USB-IF vendor ID. */
    idVendor: number | null;
    /** USB-IF product ID. */
    idProduct: number | null;
    /** Integer USB device number */
    busNumber: number | null;
    /** Integer USB device address */
    deviceAddress: number | null;
}

interface BindParams {
    usb: {
        vid: number;
        pid: number;
        bus?: number;
        address?: number;
    }
}

declare namespace BluetoothHciSocket {
    function bluetoothHciSocketFactory(type: 'native' | 'usb'): typeof BluetoothHciSocket;
}

declare class BluetoothHciSocket extends EventEmitter {
    getDeviceList(): Device[];
    isDevUp(): boolean;

    start(): void;
    stop(): void;
    reset(): void;

    bindRaw(devId: number, params?: BindParams): number;
    bindUser(devId: number, params?: BindParams): number;
    bindControl(): number;

    setFilter(filter: Buffer): void;
    write(data: Buffer): void;

    on(event: "data", cb: (data: Buffer) => void): this;
    on(event: "error", cb: (error: NodeJS.ErrnoException) => void): this;
}

export = BluetoothHciSocket;
