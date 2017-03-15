'use strict';

let Service;
let Characteristic;
let CBusAccessory;
let uuid;

const chalk = require('chalk');

const cbusUtils = require('../lib/cbus-utils.js');

const FILE_ID = cbusUtils.extractIdentifierFromFileName(__filename);

module.exports = function (_service, _characteristic, _accessory, _uuid) {
	Service = _service;
	Characteristic = _characteristic;
	CBusAccessory = _accessory;
	uuid = _uuid;

	return CBusLightAccessory;
};

function CBusLightAccessory(platform, accessoryData) {
	//--------------------------------------------------
	// initialize  parent
	CBusAccessory.call(this, platform, accessoryData);

	//--------------------------------------------------
	// keep track of state
	// TODO do we need to prime this?
	this.isOn = false;
	this.brightness = 100;
	this.rampDuration = 0;		// duration in ms

	//--------------------------------------------------
	// register on-off service
	this.service = this.addService(new Service.Lightbulb(this.name));

	this.onC10tic = this.service.getCharacteristic(Characteristic.On);

	this.onC10tic
		.on('get', this.getOn.bind(this))
		.on('set', this.setOn.bind(this));
}

CBusLightAccessory.prototype.getOn = function (callback) {
	this.client.receiveLevel(this.netId, message => {
		this.isOn = (message.level > 0);
		this._log(FILE_ID, `getOn: receiveLevel returned ${message.level}`);
		callback(false, this.isOn ? 1 : 0);
	}, `getOn`);
};

CBusLightAccessory.prototype.setOn = function (turnOn, callback, context) {
	// delay by a fraction of a second to give any superclass (nb. there may not be one) a chance to work first
	setTimeout(() => {
		// it appears that Siri uses true/false but the Home app uses 1/0 -- odd!
		console.assert((turnOn === 1) || (turnOn === 0) || (turnOn === true) || (turnOn === false));
		const wasOn = this.isOn;
		this.isOn = (turnOn === 1) || (turnOn === true);

		if (context === `event`) {
			// context helps us avoid a never-ending loop
			callback();
		} else {
			if (this.isOn === wasOn) {
				this._log(FILE_ID, `setOn: no state change from ${wasOn}`);
				callback();
			} else {
				const newLevel = turnOn ? this.brightness : 0;
				const reasonExtension = turnOn ? ((this.brightness === 100) ? `on` : `restore`) : `off`;

				this._log(FILE_ID, `setOn: changing level to ${newLevel}%`);
				this.client.setLevel(this.netId, newLevel, () => {
					callback();
				}, this.rampDuration / 1000, `setOn (${reasonExtension})`);
			}
		}
	}, 50);
};

CBusLightAccessory.prototype.processClientData = function (err, message) {
	if (!err) {
		console.assert(typeof message.level !== `undefined`, `message.level must not be undefined`);
		const level = message.level;

		this.onC10tic.setValue((level > 0) ? 1 : 0, undefined, `event`);
	}
};
