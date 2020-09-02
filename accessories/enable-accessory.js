'use strict';

let Service;
let Characteristic;
let CBusAccessory;
let uuid;

const chalk = require('chalk');

const ms = require('ms');

const cbusUtils = require('../lib/cbus-utils.js');

const FILE_ID = cbusUtils.extractIdentifierFromFileName(__filename);

module.exports = function (_service, _characteristic, _accessory, _uuid) {
	Service = _service;
	Characteristic = _characteristic;
	CBusAccessory = _accessory;
	uuid = _uuid;

	return CBusEnableAccessory;
};

function CBusEnableAccessory(platform, accessoryData) {
	// initialize the parent
	CBusAccessory.call(this, platform, accessoryData);

	try {
		this.action = cbusUtils.integerise(accessoryData.action);
	} catch (err) {
		throw new Error(`action value '${accessoryData.action}' for accessory '${this.name} is not an integer`);
	}

	// register the on-off service
	this.service = this.addService(new Service.Switch(this.name));
	this.service.getCharacteristic(Characteristic.On)
		.on('set', this.setEnable.bind(this));
}

CBusEnableAccessory.prototype.setEnable = function (enable, callback, context) {
	if (context === `event`) {
		// context helps us avoid a never-ending loop
		callback();
	} else {
		console.assert((enable === 1) || (enable === 0) || (enable === true) || (enable === false));
		if (enable) {
			this.client.enableAction(this.netId, this.action, () => {
				this.timeout = setTimeout(() => {
					this.service.getCharacteristic(Characteristic.On).setValue(0);
				}, 500);
			});		
		}
		callback();
	}
};

CBusEnableAccessory.prototype.processClientData = function (err, message) {
	if (!err) {
		console.assert(typeof message.level !== `undefined`, `message.level must be defined`);
	}
};
