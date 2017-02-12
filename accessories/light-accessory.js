let Service, Characteristic, CBusAccessory, uuid;

module.exports = function (_service, _characteristic, _accessory, _uuid) {
  Service = _service;
  Characteristic = _characteristic;
  CBusAccessory = _accessory;
  uuid = _uuid;

  return CBusLightAccessory;
};

function CBusLightAccessory(platform, accessoryData) {
    //--------------------------------------------------
    //  Initialize the parent
    //--------------------------------------------------
    CBusAccessory.call(this, platform, accessoryData);

    //--------------------------------------------------
    //  Register the on-off service
    //--------------------------------------------------
    this.lightService = this.addService(new Service.Lightbulb(this.name));
    this.lightService.getCharacteristic(Characteristic.On)
        .on('get', this.getOn.bind(this))
        .on('set', this.setOn.bind(this));
}

CBusLightAccessory.prototype.getOn = function(callback, context) {
    setTimeout(function() {
        this.client.receiveLightStatus(this.netId, function(message) {
            this._log("CBusLightAccessory", `getState returned ${message.level}`);
            callback(false, /*state: */ message.level ? 1 : 0);
        }.bind(this));
    }.bind(this), 50);
};

CBusLightAccessory.prototype.setOn = function(message, callback, context) {
	console.assert(typeof message.value != `undefined`);
	
    // "context" is helping us avoid a never ending loop
    if (context != `event`){
        this._log("CBusLightAccessory", `setState to ${value}`);
        if (message.value) {
            this.client.turnOnLight(this.netId, function() {
                callback();
            });
        } else {
            this.client.turnOffLight(this.netId, function() {
                callback();
            });
        }
    } else {
        callback();
    }
};

CBusLightAccessory.prototype.processClientData = function(message) {
	console.assert(typeof message.value != `undefined`);
	const level = message.level;
	
	this.lightService.getCharacteristic(Characteristic.On)
		.setValue(level > 0, undefined, `event`);
};
