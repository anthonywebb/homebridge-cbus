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

	return CBusTemperatureAccessory;
};

function CBusTemperatureAccessory(platform, accessoryData) {
	//--------------------------------------------------
	// initialize parent
	CBusAccessory.call(this, platform, accessoryData);

	//--------------------------------------------------
	// register temperature service
    this.service = this.addService(new Service.TemperatureSensor(this.name));
};

CBusTemperatureAccessory.prototype.processClientData = function (err, message) {
	const currentTemp = message.remainder && message.remainder[1] && message.remainder[1] / 100;
	if (!err) {
		this._log(FILE_ID, `${message.application} event`, currentTemp);
        this.service.getCharacteristic(Characteristic.CurrentTemperature)
            .setValue(currentTemp);
	}
};