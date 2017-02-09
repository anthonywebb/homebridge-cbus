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
        .on('get', this.getState.bind(this))
        .on('set', this.setState.bind(this));
}

CBusLightAccessory.prototype.getState = function(callback, context) {
    setTimeout(function() {
        this.client.receiveLightStatus(this.netId, function(message) {
            this._log("CBusLightAccessory", `getState returned ${message.level}`);
            callback(false, /*state: */ message.level ? 1 : 0);
        }.bind(this));
    }.bind(this), 50);
};

CBusLightAccessory.prototype.setState = function(value, callback, context) {
    // "context" is helping us avoid a never ending loop
    if (context != 'remoteData'){
        this._log("CBusLightAccessory", `setState to ${value}`);
        if (value) {
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
	const level = message.level;
	
	this.lightService.getCharacteristic(Characteristic.On)
		.setValue(level > 0, undefined, 'remoteData');
};
