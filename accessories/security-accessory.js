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
	//  Initialize the parent
	//--------------------------------------------------
	CBusAccessory.call(this, platform, accessoryData);

	//--------------------------------------------------
	//  Register the on-off service
	//--------------------------------------------------
	this.motionService = this.addService(new Service.MotionSensor(this.name));
	this.motionService.getCharacteristic(Characteristic.MotionDetected).on('get', this.getMotionState.bind(this));
}

CBusSecurityAccessory.prototype.getMotionState = function (callback /* , context */) {
	setTimeout(function () {
		this.client.receiveSecurityStatus(this.id, function (message) {
			let detected;
			if (['zone_unsealed', 'zone_open', 'zone_short'].includes(message.zonestate)) {
				detected = 1;
			} else if (message.zonestate === 'zone_sealed') {
				detected = 0;
			}

			this._log(FILE_ID, `zonestate = ${message.zonestate} => ${detected}`);
			callback(false, detected);
		}.bind(this));
	}.bind(this), 50);
};

CBusSecurityAccessory.prototype.processClientData = function (message) {
	const level = message.level;

	this.motionService.getCharacteristic(Characteristic.MotionDetected)
	.setValue(level > 0);
};
