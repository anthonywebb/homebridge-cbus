var Service, Characteristic, CBusLightAccessory, uuid;
var cbusUtils = require('../cbus-utils.js');

module.exports = function (_service, _characteristic, _accessory, _uuid) {
  Service = _service;
  Characteristic = _characteristic;
  CBusLightAccessory = _accessory;
  uuid = _uuid;

  return CBusDimmerAccessory;
};

function CBusDimmerAccessory(platform, accessoryData)
{
    //--------------------------------------------------
    //  Initialize the parent
    //--------------------------------------------------
    CBusLightAccessory.call(this, platform, accessoryData);

    //--------------------------------------------------
    //  Register the brightness service
    //--------------------------------------------------
    this.lightService.addCharacteristic(Characteristic.Brightness)
        .on('get', this.getBrightness.bind(this))
        .on('set', this.setBrightness.bind(this));
};

CBusDimmerAccessory.prototype.getBrightness = function(callback, context) {
    setTimeout(function() {
        this.client.receiveLightStatus(this.id, function(value) {
            this._log("CBusDimmerAccessory", "getBrightness = " + value.level);
                callback(false, /* value: */ value.level);
            }.bind(this));
    }.bind(this), 50);
};

CBusDimmerAccessory.prototype.setBrightness = function(level, callback, context) {
    // "context" is helping us avoid a never ending loop
    if(context != 'remoteData'){
        this._log("CBusDimmerAccessory", "setBrightness = " + level);
        this.client.setLightBrightness(this.id, level, function() {
            callback();
        });
    } else {
        callback();
    }
};

CBusDimmerAccessory.prototype.processClientData = function(level) {
	// set the brightness characteristic
	this.lightService.getCharacteristic(Characteristic.Brightness)
		.setValue(level, undefined, 'remoteData');
		
	// pick up the special cases of 'on' and 'off'
	if (level == 100) {
		this.lightService.getCharacteristic(Characteristic.On)
			.setValue(true, undefined, 'remoteData');    
	} else if (level == 0) { 
		this.lightService.getCharacteristic(Characteristic.On)
			.setValue(false, undefined, 'remoteData');   
	}
};
