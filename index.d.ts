// SPDX-Licence-Indentifier: MIT
// By: Yusuf Can INCE <ycanince@gmail.com>

/// <reference types="node" />
import { EventEmitter } from 'events';

declare class BluetoothHciSocket extends EventEmitter {
    getDeviceList(): BluetoothHciSocket.Device[];
    isDevUp(): boolean;

    start(): void;
    stop(): void;
    reset(): void;

    bindRaw(devId: number, params?: BluetoothHciSocket.BindParams): number;
    bindUser(devId: number, params?: BluetoothHciSocket.BindParams): number;
    bindControl(): number;

    setFilter(filter: Buffer): void;
    write(data: Buffer): void;

    on(event: "data", cb: (data: Buffer) => void): this;
    on(event: "error", cb: (error: NodeJS.ErrnoException) => void): this;
}

declare namespace BluetoothHciSocket {
    export interface Device {
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

    export interface BindParams {
        usb: {
            vid: number;
            pid: number;
            bus?: number;
            address?: number;
        }
    }

    export function bluetoothHciSocketFactory(type: 'native' | 'usb'): BluetoothHciSocket;

    export class BluetoothHciSocket extends EventEmitter {
        getDeviceList(): BluetoothHciSocket.Device[];
        isDevUp(): boolean;

        start(): void;
        stop(): void;
        reset(): void;

        bindRaw(devId: number, params?: BluetoothHciSocket.BindParams): number;
        bindUser(devId: number, params?: BluetoothHciSocket.BindParams): number;
        bindControl(): number;

        setFilter(filter: Buffer): void;
        write(data: Buffer): void;

        on(event: "data", cb: (data: Buffer) => void): this;
        on(event: "error", cb: (error: NodeJS.ErrnoException) => void): this;
    }
}

export as namespace BluetoothHciSocket;
export = BluetoothHciSocket;
