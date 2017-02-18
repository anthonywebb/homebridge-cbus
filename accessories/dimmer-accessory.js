let Service, Characteristic, CBusLightAccessory, uuid;

const chalk = require('chalk');

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
    //--------------------------------------------------
    //  Initialize the parent
    //--------------------------------------------------
	CBusLightAccessory.call(this, platform, accessoryData);
	
	//--------------------------------------------------
	//  State variable
	//--------------------------------------------------
	this.currentLevel = 0;	// TODO how do we prime this?
	
    //--------------------------------------------------
    //  Register the brightness service
    //--------------------------------------------------
    this.lightService.addCharacteristic(Characteristic.Brightness)
        .on('get', this.getBrightness.bind(this))
        .on('set', this.setBrightness.bind(this));
}

CBusDimmerAccessory.prototype.getBrightness = function(callback, context) {
	setTimeout(function() {
		this.client.receiveLightStatus(this.netId, function(message) {
			this._log(FILE_ID, `getBrightness returned ${message.level}%`);
			callback(false, message.level);
		}.bind(this));
	}.bind(this), 50);
};

CBusDimmerAccessory.prototype.setBrightness = function(newLevel, callback, context) {
	// context helps us avoid a never-ending loop
	if (context != `event`) {
		if (this.currentLevel != newLevel) {
			const oldLevel = this.currentLevel;
			this.currentLevel = newLevel;
			this._log(FILE_ID, `setBrightness: change level to ${newLevel}% ` + chalk.dim(`from ${oldLevel}%`));
			this.client.setLightBrightness(this.netId, newLevel, function () {
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
	console.assert(typeof message.level != `undefined`, `CBusDimmerAccessory.processClientData must receive message.level`);
	const level = message.level;
	
	// pick up the special cases of 'on' and 'off'
	this.lightService.getCharacteristic(Characteristic.On).setValue(level > 0, undefined, `event`);

	// set the brightness characteristic
	this.lightService.getCharacteristic(Characteristic.Brightness).setValue(level, undefined, `event`);
	
	this.currentLevel = level;
};
