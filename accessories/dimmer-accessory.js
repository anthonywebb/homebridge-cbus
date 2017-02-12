let Service, Characteristic, CBusAccessory, uuid;

var path = require('path');
// var SCRIPT_NAME = path.basename(__filename);
const SCRIPT_NAME = module.filename.slice(__filename.lastIndexOf(path.sep)+1, module.filename.length -3);

const cbusUtils = require('../cbus-utils.js');

module.exports = function (_service, _characteristic, _accessory, _uuid) {
  Service = _service;
  Characteristic = _characteristic;
  CBusAccessory = _accessory;
  uuid = _uuid;

  return CBusDimmerAccessory;
};

function CBusDimmerAccessory(platform, accessoryData) {
    //--------------------------------------------------
    //  Initialize the parent
    //--------------------------------------------------
	CBusAccessory.call(this, platform, accessoryData);
	
	//--------------------------------------------------
	//  State variable
	//--------------------------------------------------
	this.lastLevel = 0;	// TODO how do we prime this?
	
	//--------------------------------------------------
	//  Register the on-off service
	//--------------------------------------------------
	this.lightService = this.addService(new Service.Lightbulb(this.name));
	this.lightService.getCharacteristic(Characteristic.On)
	.on('get', this.getOn.bind(this))
	.on('set', this.setOn.bind(this));
	
    //--------------------------------------------------
    //  Register the brightness service
    //--------------------------------------------------
    this.lightService.addCharacteristic(Characteristic.Brightness)
        .on('get', this.getBrightness.bind(this))
        .on('set', this.setBrightness.bind(this));
}

CBusDimmerAccessory.prototype.getOn = function(callback, context) {
	setTimeout(function() {
		this.client.receiveLightStatus(this.netId, function(message) {
			this._log("CBusLightAccessory", `getState returned ${message.level}`);
			callback(false, message.level > 0);
		}.bind(this));
	}.bind(this), 50);
};

CBusDimmerAccessory.prototype.setOn = function(turnOn, callback, context) {
	// "context" is helping us avoid a never ending loop
	if (context != `event`) {
		const isOn = this.lastLevel > 0;
		
		if (isOn && turnOn) {
			this._log(SCRIPT_NAME, `already on (${this.lastLevel}%) -- ignoring setOn (${turnOn})`);
			callback();
		} else if (!isOn && !turnOn) {
			this._log(SCRIPT_NAME, `already off (${this.lastLevel}%) -- ignoring setOff (${turnOn})`);
			callback();
		} else if (isOn && !turnOn) {
			this.lastLevel = 0;   // TEMP
			this._log(SCRIPT_NAME, `setOn ${turnOn} => turnOffLight`);
			this.client.setLightBrightness(this.netId, 0, function() {
				callback();
			});
		} else if (!isOn && turnOn) {
			this.lastLevel = 100;   // TEMP
			this._log(SCRIPT_NAME, `setOn ${turnOn} => turnOnLight`);
			this.client.setLightBrightness(this.netId, 100, function() {
				callback();
			});
		}
	} else {
		// this._log(SCRIPT_NAME, `ignoring setOn 'event'`);
		callback();
	}
};

CBusDimmerAccessory.prototype.getBrightness = function(callback, context) {
	setTimeout(function() {
		this.client.receiveLightStatus(this.netId, function(message) {
			this._log(SCRIPT_NAME, `getBrightness returned ${message.level}%`);
			callback(false, message.level);
		}.bind(this));
	}.bind(this), 50);
};

CBusDimmerAccessory.prototype.setBrightness = function(level, callback, context) {
	// "context" is helping us avoid a never ending loop
	if (context != `event`) {
		if (this.lastLevel != level) {
			this._log(SCRIPT_NAME, `setBrightness to ${level}%`);
			this.lastLevel = level;
			this.client.setLightBrightness(this.netId, level, function () {
				callback();
			});
		} else {
			callback();
		}
	} else {
		// this._log(SCRIPT_NAME, `ignoring setBrightness 'event' ${level}%`);
		callback();
	}
};

CBusDimmerAccessory.prototype.processClientData = function(message) {
	console.assert(typeof message.level != `undefined`, `CBusDimmerAccessory.prototype.processClientData`);
	const level = message.level;
	
	// pick up the special cases of 'on' and 'off'
	this.lightService.getCharacteristic(Characteristic.On).setValue(level > 0, undefined, `event`);

	// set the brightness characteristic
	this.lightService.getCharacteristic(Characteristic.Brightness).setValue(level, undefined, `event`);
	
	this.lastLevel = level;
};
