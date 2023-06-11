const events = require('events');

const debug = require('debug')('hci-usb');
const usb = require('usb');

const HCI_COMMAND_PKT = 0x01;
const HCI_ACLDATA_PKT = 0x02;
const HCI_EVENT_PKT = 0x04;

const OGF_HOST_CTL = 0x03;
const OCF_RESET = 0x0003;

const VENDOR_DEVICE_LIST = [
  {vid: 0x0CF3, pid: 0xE300 }, // Qualcomm Atheros QCA61x4
  {vid: 0x0a5c, pid: 0x21e8 }, // Broadcom BCM20702A0
  {vid: 0x0a5c, pid: 0x21f1 }, // Broadcom BCM20702A0
  {vid: 0x19ff, pid: 0x0239 }, // Broadcom BCM20702A0
  {vid: 0x413c, pid: 0x8143 }, // Broadcom BCM20702A0
  {vid: 0x0a12, pid: 0x0001 }, // CSR
  {vid: 0x0b05, pid: 0x17cb }, // ASUS BT400
  {vid: 0x8087, pid: 0x07da }, // Intel 6235
  {vid: 0x8087, pid: 0x07dc }, // Intel 7260
  {vid: 0x8087, pid: 0x0a2a }, // Intel 7265
  {vid: 0x8087, pid: 0x0a2b }, // Intel 8265
  {vid: 0x0489, pid: 0xe07a }, // Broadcom BCM20702A1
  {vid: 0x0a5c, pid: 0x6412 }, // Broadcom BCM2045A0
  {vid: 0x050D, pid: 0x065A }, // Belkin BCM20702A0
  {vid: 0x1286, pid: 0x204C }, // Marvell AVASTAR
  {vid: 0x8087, pid: 0x0025 }, // Dell Precision 5530
];

class BluetoothHciSocket extends events.EventEmitter {
  constructor() {
    super();

    this._isUp = false;

    this._hciEventEndpointBuffer = Buffer.alloc(0);
    this._aclDataInEndpointBuffer = Buffer.alloc(0);
  }

  setFilter(filter) {
    // no-op
  }

  async bindRaw(devId, params) {
    await this.bindUser(devId, params);

    this._mode = 'raw';

    this.reset();
  }

  async bindUser(devId, params) {
    this._mode = 'user';

    const usbParams = this._getUsbParams(params);

    if (Number.isInteger(usbParams.usb.vid) && Number.isInteger(usbParams.usb.pid)) {

      debug('using USB VID = ' + usbParams.usb.vid + ', PID = ' + usbParams.usb.pid);

      if (Number.isInteger(usbParams.usb.bus) && Number.isInteger(usbParams.usb.address)) {

        debug('using USB BUS = ' + usbParams.usb.bus + ', Address = ' + usbParams.usb.address);

        this._usbDevice = this._findUsbDevice(0, usbParams);
      } else {
        this._usbDevice = this._findUsbDevice(devId, usbParams);
      }
    } else {
      this._usbDevice = VENDOR_DEVICE_LIST
        .map(d => usb.findByIds(d.vid, d.pid))
        .find(d => d != null);
    }

    if (!this._usbDevice) {
      throw new Error('No compatible USB Bluetooth 4.0 device found!');
    }

    this._usbDevice.open();

    await new Promise((resolve, reject) => {
      this._usbDevice.setConfiguration(1, (err) => {
        err ? reject(err) : resolve();
      });
    });

    this._usbDeviceInterface = this._usbDevice.interfaces[0];

    try {
      this._aclDataOutEndpoint = this._usbDeviceInterface.endpoint(0x02);
    } catch (err) {
      // NOTE: Zephyr HCI Controller uses endpoint 0x01
      this._aclDataOutEndpoint = this._usbDeviceInterface.endpoint(0x01);
    }

    this._hciEventEndpoint = this._usbDeviceInterface.endpoint(0x81);
    this._aclDataInEndpoint = this._usbDeviceInterface.endpoint(0x82);

    this._usbDeviceInterface.claim();
  }

  _getUsbParams(params) {
    const usbParams = {
      usb: {
        vid: undefined, pid: undefined,
        bus: undefined, address: undefined,
      },
    };

    if (process.env.BLUETOOTH_HCI_SOCKET_USB_VID) {
      usbParams.usb.vid = parseInt(process.env.BLUETOOTH_HCI_SOCKET_USB_VID, 10);
    }
    if (process.env.BLUETOOTH_HCI_SOCKET_USB_PID) {
      usbParams.usb.pid = parseInt(process.env.BLUETOOTH_HCI_SOCKET_USB_PID, 10);
    }
    if (process.env.BLUETOOTH_HCI_SOCKET_USB_BUS) {
      usbParams.usb.bus = parseInt(process.env.BLUETOOTH_HCI_SOCKET_USB_BUS, 10);
    }
    if (process.env.BLUETOOTH_HCI_SOCKET_USB_ADDRESS) {
      usbParams.usb.address = parseInt(process.env.BLUETOOTH_HCI_SOCKET_USB_ADDRESS, 10);
    }

    if (params && params.usb) {
      if (Number.isInteger(params.usb.vid)) {
        usbParams.usb.vid = params.usb.vid;
      }
      if (Number.isInteger(params.usb.pid)) {
        usbParams.usb.pid = params.usb.pid;
      }
      if (Number.isInteger(params.usb.bus)) {
        usbParams.usb.bus = params.usb.bus;
      }
      if (Number.isInteger(params.usb.address)) {
        usbParams.usb.address = params.usb.address;
      }
    }

    return usbParams;
  }

  _findUsbDevice(devId, usbParams) {
    const usbDevices = usb.getDeviceList();

    for (const usbDevice of usbDevices) {
      const usbDeviceDesc = usbDevice.deviceDescriptor;

      if (Number.isInteger(usbParams.usb.vid) && usbDeviceDesc.idVendor !== usbParams.usb.vid) {
        continue;
      }
      if (Number.isInteger(usbParams.usb.pid) && usbDeviceDesc.idProduct !== usbParams.usb.pid) {
        continue;
      }
      if (Number.isInteger(usbParams.usb.bus) && usbDevice.bus !== usbParams.usb.bus) {
        continue;
      }
      if (Number.isInteger(usbParams.usb.address) && usbDevice.address !== usbParams.usb.address) {
        continue;
      }
      if (--devId > 0) {
        continue;
      }

      return usbDevice;
    }
  }

  getDeviceList() {
    return usb.getDeviceList()
      .filter(dev => {
        return VENDOR_DEVICE_LIST.findIndex(d => {
          return dev.deviceDescriptor.idVendor == d.vid && dev.deviceDescriptor.idProduct == d.pid;
        }) !== -1;
      })
      .map(dev => ({
        "devId": null,
        "devUp": null,
        "idVendor": dev.deviceDescriptor.idVendor,
        "idProduct": dev.deviceDescriptor.idProduct,
        "busNumber": dev.busNumber,
        "deviceAddress": dev.deviceAddress,
      }));
  }

  bindControl() {
    this._mode = 'control';
  }

  isDevUp() {
    return this._isUp;
  }

  start() {
    if (this._mode === 'raw' || this._mode === 'user') {
      this._hciEventEndpoint.on('data', this.onHciEventEndpointData);
      this._hciEventEndpoint.startPoll();

      this._aclDataInEndpoint.on('data', this.onAclDataInEndpointData);
      this._aclDataInEndpoint.startPoll();
    }
  }

  stop() {
    if (this._mode === 'raw' || this._mode === 'user') {
      this._hciEventEndpoint.stopPoll();
      this._hciEventEndpoint.removeAllListeners();

      this._aclDataInEndpoint.stopPoll();
      this._aclDataInEndpoint.removeAllListeners();
    }
  }

  write(data) {
    debug('write: ' + data.toString('hex'));

    if (this._mode === 'raw' || this._mode === 'user') {
      const type = data.readUInt8(0);

      if (HCI_COMMAND_PKT === type) {
        const requestType = usb.usb.LIBUSB_REQUEST_TYPE_CLASS | usb.usb.LIBUSB_RECIPIENT_INTERFACE;
        this._usbDevice.controlTransfer(requestType, 0, 0, 0, data.slice(1), function() {});
      } else if(HCI_ACLDATA_PKT === type) {
        this._aclDataOutEndpoint.transfer(data.slice(1));
      }
    }
  }

  onHciEventEndpointData = (data) => {
    debug('HCI event: ' + data.toString('hex'));

    if (data.length === 0) {
      return;
    }

    // add to buffer
    this._hciEventEndpointBuffer = Buffer.concat([
      this._hciEventEndpointBuffer,
      data
    ]);

    if (this._hciEventEndpointBuffer.length < 2) {
      return;
    }

    // check if desired length
    const pktLen = this._hciEventEndpointBuffer.readUInt8(1);
    if (pktLen <= (this._hciEventEndpointBuffer.length - 2)) {

      const buf = this._hciEventEndpointBuffer.slice(0, pktLen + 2);

      if (this._mode === 'raw' && buf.length === 6 && ('0e0401030c00' === buf.toString('hex') || '0e0402030c00' === buf.toString('hex'))) {
        debug('reset complete');
        this._isUp = true;
      }

      // fire event
      this.emit('data', Buffer.concat([
        Buffer.from([HCI_EVENT_PKT]),
        buf
      ]));

      // reset buffer
      this._hciEventEndpointBuffer = this._hciEventEndpointBuffer.slice(pktLen + 2);
    }
  };

  onAclDataInEndpointData = (data) => {
    debug('ACL Data In: ' + data.toString('hex'));

    if (data.length === 0) {
      return;
    }

    // add to buffer
    this._aclDataInEndpointBuffer = Buffer.concat([
      this._aclDataInEndpointBuffer,
      data
    ]);

    if (this._aclDataInEndpointBuffer.length < 4) {
      return;
    }

    // check if desired length
    const pktLen = this._aclDataInEndpointBuffer.readUInt16LE(2);
    if (pktLen <= (this._aclDataInEndpointBuffer.length - 4)) {

      const buf = this._aclDataInEndpointBuffer.slice(0, pktLen + 4);

      // fire event
      this.emit('data', Buffer.concat([
        Buffer.from([HCI_ACLDATA_PKT]),
        buf
      ]));

      // reset buffer
      this._aclDataInEndpointBuffer = this._aclDataInEndpointBuffer.slice(pktLen + 4);
    }
  };

  reset() {
    const cmd = Buffer.alloc(4);

    // header
    cmd.writeUInt8(HCI_COMMAND_PKT, 0);
    cmd.writeUInt16LE(OCF_RESET | OGF_HOST_CTL << 10, 1);

    // length
    cmd.writeUInt8(0x00, 3);

    debug('reset');
    this.write(cmd);
  }
}

module.exports = BluetoothHciSocket;
