'use strict';

let Service;
let Characteristic;
let CBusAccessory;
let uuid;

let cbusUtils = require('../lib/cbus-utils.js');

const chalk = require('chalk'); // does not alter string prototype

const FILE_ID = cbusUtils.extractIdentifierFromFileName(__filename);

const SPIN_TIME = 3000;

module.exports = function (_service, _characteristic, _accessory, _uuid) {
	Service = _service;
	Characteristic = _characteristic;
	CBusAccessory = _accessory;
	uuid = _uuid;

	return CBusFanAccessory;
};

function CBusFanAccessory(platform, accessoryData) {
	//--------------------------------------------------
	// initialize the parent
	CBusAccessory.call(this, platform, accessoryData);

	//--------------------------------------------------
	// register the service
	this.service = this.addService(new Service.Fan(this.name));

	this.onC10tic = this.service.getCharacteristic(Characteristic.On);
	this.speedC10tic = this.service.getCharacteristic(Characteristic.RotationSpeed);

	this.onC10tic
		.on('get', this.getOn.bind(this))
		.on('set', this.setOn.bind(this));

	// the current fan speed (0-100%)
	// https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L1557
	this.speedC10tic
		.on('get', this.getSpeed.bind(this))
		.on('set', this.setSpeed.bind(this));

	//--------------------------------------------------
	// prime the fan state
	this.isOn = false;
	this.speed = 0;

	// TODO work out whether we really do need to prime
	// it seems that the Home app kicks off an update only when activating the app,
	// but not automatically if homekit is restarted.
	setTimeout(() => {
		this._log(FILE_ID, `construct`, `prime state`);
		this.getSpeed((err, speed) => {
			if (!err) {
				this.isOn = (speed > 0);
				this.speed = speed;

				this.onC10tic.setValue(this.isOn ? 1 : 0, undefined, `event`);
				this.speedC10tic.setValue(this.speed, undefined, `event`);
			}
		});
	}, 3000);
}

CBusFanAccessory.prototype.getOn = function (callback) {
	this.client.receiveLevel(this.netId, message => {
		this._log(FILE_ID, `getOn receiveLevel returned ${message.level}%`);
		this.isOn = (message.level > 0);
		if (this.isOn) {
			this.speed = message.level;
		}

		callback(false, this.isOn ? 1 : 0);
	}, `getOn`);
};

CBusFanAccessory.prototype.setOn = function (turnOn, callback, context) {
	// delay by a fraction of a second to give setSpeed a chance to work first
	setTimeout(() => {
		const wasOn = this.isOn;
		this.isOn = (turnOn === 1) || (turnOn === true);

		if (context === `event`) {
			// context helps us avoid a never-ending loop
			callback();
		} else {
			if (wasOn === this.isOn) {
				this._log(FILE_ID, `setOn`, `no state change from ${wasOn}`);
				callback();
			} else {
				const speed = turnOn ? this.speed : 0;

				if (this.isOn && speed === 0) {
					this._log(FILE_ID, `setOn`, chalk.green.bold(`SWALLOW! *** not sure why if this is still needed -- remove? ***`));
					callback();
				} else {
					this._log(FILE_ID, `setOn`, `changing level to ${speed}%`);
					this.client.setLevel(this.netId, speed, function () {
						callback();
					}, 0, `setOn`);
				}
			}
		}
	}, 50);
};

CBusFanAccessory.prototype.getSpeed = function (callback) {
	this.client.receiveLevel(this.netId, message => {
		const speed = message.level;
		this._log(FILE_ID, `getSpeed`, `receiveLevel returned ${speed}%`);
		this.isOn = (speed > 0);
		
		if (speed > 0) {
			// update speed if the speed is non-zero
			this.speed = speed;
		}

		if (callback) {
			callback(/* error */ false, /* newValue */ this.speed);
		}
	}, `getSpeed`);
};

CBusFanAccessory.prototype.setSpeed = function (newSpeed, callback, context) {
	this.speed = newSpeed;
	const wasOn = this.isOn;
	this.isOn = (newSpeed > 0);

	if (context === `event`) {
		// context helps us avoid a never-ending loop
		callback();
	} else {
		if (!wasOn && (newSpeed === 0)) {
			this._log(FILE_ID, `setSpeed`, chalk.green(`swallowing 0%`));
			callback();
		} else {
			this._log(FILE_ID, `setSpeed`, `changing speed to ${newSpeed}%`);
			this.client.setLevel(this.netId, newSpeed, function () {
				callback();
			}, 0, `setSpeed`);
		}
	}
};

// received an event over the network
// could have been in response to one of our commands, or someone else
CBusFanAccessory.prototype.processClientData = function (err, message) {
	if (!err) {
		console.assert(typeof message.level !== `undefined`, `CBusFanAccessory.processClientData must receive message.level`);
		const speed = message.level;

		// update isOn
		this.onC10tic.setValue((speed > 0) ? 1 : 0, undefined, `event`);

		// update speed
		if (speed === 0) {
			this._log(FILE_ID, `processClientData`, `speed 0%; interpreting as 'off'`);
		} else {
			this.speedC10tic.setValue(speed, undefined, `event`);
		}
	}
};
