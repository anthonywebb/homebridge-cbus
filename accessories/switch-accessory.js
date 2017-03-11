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

	return CBusSwitchAccessory;
};

function CBusSwitchAccessory(platform, accessoryData) {
	//--------------------------------------------------
	//  Initialize the parent
	//--------------------------------------------------
	CBusAccessory.call(this, platform, accessoryData);

	// if we have an activeDuration specified, stash it away
	if (typeof accessoryData.activeDuration !== `undefined`) {
		this.activeDuration = ms(accessoryData.activeDuration);
		this._log(FILE_ID, `configured to automatically turn off ${this.activeDuration}ms after being switched on by homebridge`);
	}

	//--------------------------------------------------
	//  State variable
	//--------------------------------------------------
	this.currentState = false;	// TODO how do we prime this?

	//--------------------------------------------------
	//  Register the on-off service
	//--------------------------------------------------
	this.service = this.addService(new Service.Switch(this.name));
	this.service.getCharacteristic(Characteristic.On)
		.on('get', this.getOn.bind(this))
		.on('set', this.setOn.bind(this));
}

CBusSwitchAccessory.prototype.getOn = function (callback /* , context */) {
	setTimeout(function () {
		this.client.receiveLevel(this.netId, function (message) {
			this.currentState = message.level > 0;
			this._log(FILE_ID, `getOn: status = '${this.currentState ? `on` : `off`}'`);
			callback(false, this.currentState > 0);
		}.bind(this));
	}.bind(this), 50);
};

CBusSwitchAccessory.prototype.setOn = function (turnOn, callback, context) {
	// context helps us avoid a never-ending loop
	if (context === `event`) {
		// this._log(SCRIPT_NAME, `ignoring setOn 'event'`);
		callback();
	} else {
		const isOn = this.currentState > 0;

		if (isOn === turnOn) {
			this._log(FILE_ID, `setOn: no state change from ${isOn}`);
			callback();
		} if (turnOn) {
			this.currentState = turnOn;
			this._log(FILE_ID, `setOn(true): changing to 'on'`);
			this.client.turnOn(this.netId, function () {
				if (this.activeDuration) {
					this.timeout = setTimeout(function () {
						this._log(FILE_ID, `activity timer expired. turning off`);
						this.client.turnOff(this.netId);
					}.bind(this), this.activeDuration);
					this._log(FILE_ID, `turned on. setting activity timer for ${this.activeDuration}ms`);
				}
				callback();
			}.bind(this));
		} else {
			// turnOn == false, ie. turn off
			this.currentState = turnOn;
			this._log(FILE_ID, `setOn(false): changing to 'off'`);
			this.client.turnOff(this.netId, function () {
				callback();
			});
		}
	}

	// if we turn off (regardless of whether by homebridge or switch), clear out any timeout
	if (!turnOn && this.timeout) {
		this._log(FILE_ID, `turned off. clearing activity timer`);
		clearTimeout(this.timeout);
	}
};

CBusSwitchAccessory.prototype.processClientData = function (message) {
	console.assert(typeof message.level !== `undefined`, `message.level must be defined`);
	const level = message.level;

	this.service.getCharacteristic(Characteristic.On).setValue(level > 0, undefined, `event`);
};
