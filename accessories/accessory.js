'use strict';

let Service;
let Characteristic;
let Accessory;
let uuid;

require('../hot-debug.js');
const log = require('debug')('cbus:accessory');

const chalk = require('chalk'); // does not alter string prototype

const cbusUtils = require('../lib/cbus-utils.js');
const CBusNetId = require('../lib/cbus-netid.js');

module.exports = function (_service, _characteristic, _accessory, _uuid) {
	Service = _service;
	Characteristic = _characteristic;
	Accessory = _accessory;
	uuid = _uuid;

	return CBusAccessory;
};

function CBusAccessory(platform, accessoryData) {
	// type is absolutely required
	console.assert(typeof accessoryData.type !== `undefined`, `accessoryData.type must not be undefined`);

	this.client = platform.client;
	this.accessoryData = accessoryData;
	this.type = accessoryData.type;

	// ensure we have a name
	if (typeof accessoryData.name !== `string`) {
		throw new Error(`missing required 'name' field`);
	}
	this.name = accessoryData.name;

	// ensure we have a valid group address
	if (typeof accessoryData.id === `undefined`) {
		throw new Error(`accessory '${this.name} missing required 'id' (group address) field`);
	}

	let groupAddress;
	try {
		groupAddress = cbusUtils.integerise(accessoryData.id);
	} catch (err) {
		throw new Error(`id '${accessoryData.id}' for accessory '${this.name} is not an integer`);
	}

	if (typeof accessoryData.action !== `undefined`) {
		let actionValue;
		try {
			actionValue = cbusUtils.integerise(accessoryData.action);
		} catch (err) {
			throw new Error(`action value '${accessoryData.action}' for accessory '${this.name} is not an integer`);
		}
	}

	// build netId
	this.netId = new CBusNetId(
		platform.project,
		accessoryData.network || platform.client.network,
		accessoryData.application || platform.client.application,
		groupAddress
	);

	// fire our parent
	const ourUUID = uuid.generate(this.netId.getHash());
	Accessory.call(this, this.name, ourUUID);

	// setup service
	const service = this.getService(Service.AccessoryInformation);

	// configure service
	service.setCharacteristic(Characteristic.Manufacturer, `Clipsal C-Bus`);
	service.setCharacteristic(Characteristic.SerialNumber, this.netId.toString());
	service.setCharacteristic(Characteristic.Model, this.type);
}

CBusAccessory.prototype.getServices = function () {
	return this.services;
};

CBusAccessory.prototype._log = function (file, action, message) {
	const fileName = file.split(`-`)[0];
	const accessoryLabel = cbusUtils.formatTag(this.name, this.netId);
	log(`${chalk.gray.bold(fileName)} ${accessoryLabel} ${chalk.red(action)} ${message}`);
};
