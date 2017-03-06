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

	setTimeout(() => {
		this._log(FILE_ID, 'prime fan state');
		this.getSpeed((err, speed) => {
			if (!err) {
				this.isOn = (speed > 0) ? 1 : 0;
				this.speed = speed;

				this.onC10tic.setValue(this.isOn, undefined, `event`);
				this.speedC10tic.setValue(this.speed, undefined, `event`);
			}
		});
	}, 3000);
}

CBusFanAccessory.prototype.getOn = function (callback) {
	this._showInternals(`enter-getOn`);
	this.client.receiveLevel(this.netId, function (message) {
		this._log(FILE_ID, `receiveLevel returned ${message.level}`);
		this.isOn = (message.level > 0) ? 1 : 0;
		if (this.isOn) {
			this.speed = message.level;
		}

		callback(false, this.isOn);
		this._showInternals(`exit-getOn`);
	}.bind(this));
};

CBusFanAccessory.prototype.setOn = function (turnOn, callback, context) {
	// context helps us avoid a never-ending loop
	if (context === `event`) {
		this._showInternals(`enter-setOn/event`);
		this.isOn = turnOn;
		callback();
		this._showInternals(`exit-setOn/event`);
	} else {
		const oldIsOn = this.isOn;
		const newIsOn = turnOn;
		this.isOn = turnOn;

		const speed = turnOn ? this.speed : 0;
		this._log(FILE_ID, `setOn changing level to ${speed}%`);
		this._showInternals(`enter-setOn/change`);

		if (oldIsOn && turnOn) {
			this._log(FILE_ID, chalk.green(`setOn SWALLOW! already on`));
			callback();
		} else if (turnOn && speed === 0) {
			this._log(FILE_ID, chalk.green(`SWALLOW! not sure why!?!?!?`));
			callback();
		} else {
			this.client.setBrightness(this.netId, speed, function () {
				callback();
				this._showInternals(`exit-setOn/change`);
			}, 0, `setOn`);
		}
	}
};

var counter = 10;

CBusFanAccessory.prototype.getSpeed = function (callback) {
	var myCount = counter++;
	this._showInternals(`enter-getSpeed${myCount}`);
	this.client.receiveLevel(this.netId, function (message) {
		this._log(FILE_ID, `receiveLevel returned ${message.level}`);
		this.isOn = (message.level > 0) ? 1 : 0;
		
		if (this.isOn) {
			// only update level if the level is non-zero
			this.speed = message.level;
		}

		if (callback) {
			callback(/* error */ false, /* newValue */ this.speed);
		}
		this._showInternals(`exit-getSpeed${myCount}`);
	}.bind(this));
};

CBusFanAccessory.prototype.setSpeed = function (newSpeed, callback, context) {
	// context helps us avoid a never-ending loop
	if (context === `event`) {
		this._showInternals(`enter-setSpeed/event`);
		this.speed = newSpeed;
		callback();
		this._showInternals(`exit-setSpeed/event`);
	} else {
		const oldSpeed = this.speed;
		this.isOn = (newSpeed > 0) ? 1 : 0;
		this.speed = newSpeed;

		this._log(FILE_ID, `setSpeed changing speed to ${newSpeed}%`);
		this._showInternals(`enter-setSpeed/change`);

		if (newSpeed === 100) {
			this._log(FILE_ID, `--> 100%`);
		}

		if (oldSpeed === newSpeed) {
			this._log(FILE_ID, chalk.green(`setSpeed SWALLOW! no change`));
			callback();
		} if (!this.isOn && (newSpeed === 0)) {
			this._log(FILE_ID, chalk.green(`setSpeed SWALLOW! special case`));
			callback();
		} else {
			this.client.setBrightness(this.netId, newSpeed, function () {
				callback();
				this._showInternals(`exit-setSpeed/change`);
			}, 0, `setSpeed`);
		}
	}
};

// received an event over the network
// could have been in response to one of our commands, or someone else
CBusFanAccessory.prototype.processClientData = function (message) {
	const speed = message.level;

	this._log(FILE_ID, `client: received ${speed}%`);

	if (typeof speed !== `undefined`) {
		const wasOn = this.isOn;
		const isOn = speed > 0 ? 1 : 0;

		const oldSpeed = this.speed;
		const newSpeed = isOn ? message.level : oldSpeed;

		this._log(FILE_ID, `from client: on ${wasOn} -> ${isOn}, speed ${oldSpeed} -> ${newSpeed}`);

		if (speed === 0) {
			// it was probably just a turn off command
			this._log(FILE_ID, chalk.green(`client`) + ` speed 0; interpreting as 'off'`);
			this.onC10tic.setValue(isOn, undefined, `event`);
		} else {
			if (wasOn !== isOn) {
				this.onC10tic.setValue(isOn, undefined, `event`);
			}

			if (oldSpeed !== newSpeed) {
				this.speedC10tic.setValue(newSpeed, undefined, `event`);
			}
		}

		// if (!wasOn && isOn) {
		// 	// we were off, restore
		// 	this._log(FILE_ID, chalk.green(`client`) + ` was off; restoring`);
		// 	this.onC10tic.setValue(isOn, undefined, `event`);
		// 	this.speedC10tic.setValue(newSpeed, undefined, `event`);
		// }
	}
};

require('../hot-debug.js');
const fanLog = require('debug')('cbus:fan');

CBusFanAccessory.prototype._showInternals = function (marker) {
	const isOn = this.isOn;
	const speed = this.speed;
	fanLog(chalk.red.bold(`<<<${marker}>>> `) + `isOn: ${chalk.red(isOn)}, speed: ${chalk.red(speed + `%`)}`);
};
