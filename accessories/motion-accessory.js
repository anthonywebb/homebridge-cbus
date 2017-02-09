let Service, Characteristic, CBusAccessory, uuid;

module.exports = function (_service, _characteristic, _accessory, _uuid) {
  Service = _service;
  Characteristic = _characteristic;
  CBusAccessory = _accessory;
  uuid = _uuid;

  return CBusMotionAccessory;
};

function CBusMotionAccessory(platform, accessoryData) {
    //--------------------------------------------------
    //  Initialize the parent
    //--------------------------------------------------
    CBusAccessory.call(this, platform, accessoryData);

    //--------------------------------------------------
    //  Register the on-off service
    //--------------------------------------------------
    this.motionService = this.addService(new Service.MotionSensor(this.name));
    this.motionService.getCharacteristic(Characteristic.MotionDetected)
        .on('get', this.getMotionState.bind(this));
}

CBusMotionAccessory.prototype.getMotionState = function(callback, context) {
    setTimeout(function() {
        this.client.receiveLightStatus(this.netId, function(message) {
            this._log("CBusMotionAccessory", "getState = " + message.level);
            callback(false, /*state: */ message.level ? 1 : 0);
        }.bind(this));
    }.bind(this), 50);
};

CBusMotionAccessory.prototype.processClientData = function(message) {
	const level = message.level;
	
	this.motionService.getCharacteristic(Characteristic.MotionDetected)
		.setValue(level > 0);
};
