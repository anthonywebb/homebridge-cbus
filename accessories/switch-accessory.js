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
	// initialize the parent
	CBusAccessory.call(this, platform, accessoryData);

	// if we have an activeDuration specified, stash it away
	if (typeof accessoryData.activeDuration !== `undefined`) {
		this.activeDuration = ms(accessoryData.activeDuration);
		this._log(FILE_ID, `construct`, `automatically turn off ${this.activeDuration}ms when activated via homebridge`);
	}

	// TODO do we need to prime this?
	this.isOn = false;

	// register the on-off service
	this.service = this.addService(new Service.Switch(this.name));
	this.service.getCharacteristic(Characteristic.On)
		.on('get', this.getOn.bind(this))
		.on('set', this.setOn.bind(this));
}

CBusSwitchAccessory.prototype.getOn = function (callback) {
	this.client.receiveLevel(this.netId, message => {
		this.isOn = message.level > 0;
		this._log(FILE_ID, `getOn`, `status = '${this.isOn ? `on` : `off`}'`);
		callback(false, this.isOn ? 1 : 0);
	}, `getOn`);
};

CBusSwitchAccessory.prototype.setOn = function (turnOn, callback, context) {
	if (context === `event`) {
		// context helps us avoid a never-ending loop
		callback();
	} else {
		console.assert((turnOn === 1) || (turnOn === 0) || (turnOn === true) || (turnOn === false));
		const wasOn = this.isOn;
		this.isOn = (turnOn === 1) || (turnOn === true);

		if (wasOn === this.isOn) {
			this._log(FILE_ID, `setOn`, `no state change from ${turnOn}`);
			callback();
		} else if (turnOn) {
			this._log(FILE_ID, `setOn(true)`, `changing to 'on'`);
			this.client.turnOn(this.netId, () => {
				if (this.activeDuration) {
					this.timeout = setTimeout(() => {
						this._log(FILE_ID, `activity timer expired`, `turning off`);
						this.isOn = false;
						this.client.turnOff(this.netId);
					}, this.activeDuration);
					this._log(FILE_ID, `activity timer activated`, `will turn off in ${ms(this.activeDuration)} (${this.activeDuration}ms)`);
				}
				callback();
			});
		} else {
			// turnOn === false, ie. turn off
			this._log(FILE_ID, `setOn(false)`, `changing to 'off'`);
			this.client.turnOff(this.netId, () => {
				callback();
			});
		}
	}

	// if we turn off (regardless of whether by homebridge or cbus), clear out any timeout
	if (!turnOn && this.timeout) {
		this._log(FILE_ID, `turned off`, `clearing activity timer`);
		clearTimeout(this.timeout);
	}
};

CBusSwitchAccessory.prototype.processClientData = function (err, message) {
	if (!err) {
		console.assert(typeof message.level !== `undefined`, `message.level must be defined`);
		const level = message.level;

		this.service.getCharacteristic(Characteristic.On).setValue((level > 0) ? 1 : 0, undefined, `event`);
	}
};
