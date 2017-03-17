'use strict';

let Service;
let Characteristic;
let CBusLightAccessory;
let uuid;

const chalk = require('chalk');

const ms = require('ms');

const cbusUtils = require('../lib/cbus-utils.js');

const FILE_ID = cbusUtils.extractIdentifierFromFileName(__filename);

module.exports = function (_service, _characteristic, _accessory, _uuid) {
	Service = _service;
	Characteristic = _characteristic;
	CBusLightAccessory = _accessory;
	uuid = _uuid;

	return CBusDimmerAccessory;
};

function CBusDimmerAccessory(platform, accessoryData) {
	// initialize parent
	CBusLightAccessory.call(this, platform, accessoryData);

	// if we have an activeDuration specified, stash it away
	if (typeof accessoryData.rampDuration !== `undefined`) {
		this.rampDuration = ms(accessoryData.rampDuration);
		if (this.rampDuration > ms(`17m`)) {
			throw new Error(`accessory '${this.name} rampDuration (${ms(this.rampDuration)}) is greater than maximum (17m)`);
		}
		this._log(FILE_ID, `configured to ramp up/down over ${this.rampDuration}ms when activated via homebridge`);
	}

	// register brightness service
	this.brightnessC10tic = this.service.getCharacteristic(Characteristic.Brightness);

	this.brightnessC10tic
		.on('get', this.getBrightness.bind(this))
		.on('set', this.setBrightness.bind(this));
}

CBusDimmerAccessory.prototype.getBrightness = function (callback) {
	this.client.receiveLevel(this.netId, message => {
		this._log(FILE_ID, `getBrightness returned ${message.level}%`);

		if (message.level) {
			// update level if the level is non-zero
			this.brightness = message.level;
		}

		callback(/* error */ false, /* newValue */ message.level);
	}, `getBrightness`);
};

CBusDimmerAccessory.prototype.setBrightness = function (newLevel, callback, context) {
	this.brightness = newLevel;
	const wasOn = this.isOn;
	this.isOn = (this.brightness > 0);

	if (context === `event`) {
		// context helps us avoid a never-ending loop
		callback();
	} else {
		if (!wasOn && (newLevel === 0)) {
			this._log(FILE_ID, chalk.green(`setBrightness swallowing 0%`));
			callback();
		} else {
			this._log(FILE_ID, `setBrightness changing level to ${newLevel}%`);
			this.client.setLevel(this.netId, newLevel, function () {
				callback();
			}, this.rampDuration / 1000, `setBrightness`);
		}
	}
};

CBusDimmerAccessory.prototype.processClientData = function (err, message) {
	if (!err) {
		console.assert(typeof message.level !== `undefined`, `CBusDimmerAccessory.processClientData must receive message.level`);
		const level = message.level;

		// pick up the special cases of 'on' and 'off'
		this.onC10tic.setValue((level > 0) ? 1 : 0, undefined, `event`);

		// update brightness
		if (level === 0) {
			this._log(FILE_ID, `level 0%; interpreting as 'off'`);
		} else {
			this.brightnessC10tic.setValue(level, undefined, `event`);
		}
	}
};
