'use strict';

let Service;
let Characteristic;
let CBusAccessory;
let uuid;

const cbusUtils = require('../lib/cbus-utils.js');

const FILE_ID = cbusUtils.extractIdentifierFromFileName(__filename);

module.exports = function (_service, _characteristic, _accessory, _uuid) {
	Service = _service;
	Characteristic = _characteristic;
	CBusAccessory = _accessory;
	uuid = _uuid;

	return CBusSecurityAccessory;
};

function CBusSecurityAccessory(platform, accessoryData) {
	//--------------------------------------------------
	// initialize the parent
	CBusAccessory.call(this, platform, accessoryData);

	//--------------------------------------------------
	// register the on-off service
	this.service = this.addService(new Service.MotionSensor(this.name));

	this.service.getCharacteristic(Characteristic.MotionDetected).on('get', this.getMotionState.bind(this));
}

CBusSecurityAccessory.prototype.getMotionState = function (callback) {
	this.client.receiveSecurityStatus(this.id, message => {
		let detected;
		if (['zone_unsealed', 'zone_open', 'zone_short'].includes(message.zonestate)) {
			detected = 1;
		} else if (message.zonestate === 'zone_sealed') {
			detected = 0;
		}

		this._log(FILE_ID, `getMotionState`, `${message.zonestate} => ${detected}`);
		callback(false, detected);
	}, `getMotionState`);
};

CBusSecurityAccessory.prototype.processClientData = function (err, message) {
	if (!err) {
		this.service.getCharacteristic(Characteristic.MotionDetected)
			.setValue((message.level > 0) ? 1 : 0);
	}
};
