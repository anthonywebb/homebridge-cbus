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

	return CBusSwitchAccessory;
};

function CBusSwitchAccessory(platform, accessoryData) {
	//--------------------------------------------------
	//  Initialize the parent
	//--------------------------------------------------
	CBusAccessory.call(this, platform, accessoryData);

	//--------------------------------------------------
	//  State variable
	//--------------------------------------------------
	this.currentState = false;	// TODO how do we prime this?

	//--------------------------------------------------
	//  Register the on-off service
	//--------------------------------------------------
	this.switchService = this.addService(new Service.Switch(this.name));
	this.switchService.getCharacteristic(Characteristic.On)
		.on('get', this.getOn.bind(this))
		.on('set', this.setOn.bind(this));
}

CBusSwitchAccessory.prototype.getOn = function (callback /* , context */) {
	setTimeout(function () {
		this.client.receiveLevel(this.netId, function (message) {
			this.currentState = message.level > 0;
			this._log(FILE_ID, `status reported as '${this.currentState ? `on` : `off`}'`);
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
			this._log(FILE_ID, `setOn changing to 'on' ` + chalk.dim(`from 'off'`));
			this.client.turnOn(this.netId, function () {
				callback();
			});
		} else {
			this.currentState = turnOn;
			this._log(FILE_ID, `setOn changing to 'off' ` + chalk.dim(`from 'on'`));
			this.client.turnOff(this.netId, function () {
				callback();
			});
		}
	}
};

CBusSwitchAccessory.prototype.processClientData = function (message) {
	console.assert(typeof message.level !== `undefined`, `message.level must be defined`);
	const level = message.level;

	this.switchService.getCharacteristic(Characteristic.On).setValue(level > 0, undefined, `event`);
};
