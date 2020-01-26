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
	
	this.service.getCharacteristic(Characteristic.CurrentTemperature)
		.on('get', this.getTemperatureState.bind(this));
    }

CBusTemperatureAccessory.prototype.getTemperatureState = function (callback) {
	this.client.receiveData(this.netId, message => {
		this._log(FILE_ID, `getState`, message.data);
		callback(false, /* state: */ message.data);
	});
};

CBusTemperatureAccessory.prototype.processClientData = function (err, message) {
	if (!err) {
        this.service.getCharacteristic(Characteristic.CurrentTemperature)
            .setValue(message.data);
	}
};