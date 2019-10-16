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

	return CBusContactAccessory;
};

function CBusContactAccessory(platform, accessoryData) {
	//--------------------------------------------------
	// initialize parent
	CBusAccessory.call(this, platform, accessoryData);

	//--------------------------------------------------
	// register on-off service
    this.service = this.addService(new Service.ContactSensor(this.name));
    this.service.getCharacteristic(Characteristic.ContactSensorState)
        .on('get', this.getMotionState.bind(this));


    }

CBusContactAccessory.prototype.getMotionState = function (callback) {
	this.client.receiveLevel(this.netId, message => {
        this._log(FILE_ID, `getState`, message.level);
        const level = message.level;
        console.log("Contact Sensor level is=", level);
		callback(false, /* state: */ message.level ? 1 : 0);
	});
};

CBusContactAccessory.prototype.processClientData = function (err, message) {
	if (!err) {
        const level = message.level;
        console.log("Contact Sensor level is=",level);
        this.service.getCharacteristic(Characteristic.ContactSensorState)
            .setValue((level > 0) ? 1 : 0);

	}
};
