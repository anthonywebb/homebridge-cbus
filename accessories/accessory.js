'use strict';

var Service, Characteristic, Accessory, uuid;
var cbusUtils = require('../cbus-utils.js');

module.exports = function (_service, _characteristic, _accessory, _uuid) {
  Service = _service;
  Characteristic = _characteristic;
  Accessory = _accessory;
  uuid = _uuid;

  return CBusAccessory;
};

function CBusAccessory(platform, accessoryData)
{
    //--------------------------------------------------
    //  Accessory data validation
    //--------------------------------------------------

    /* We got a name? */
    if (typeof(accessoryData.name) != "string") {
        this.log.error("One of your accessories is missing the \"name\" field, which is required. ABORTING.");
        process.exit(0);
    }

    /* We got an id? */
    if (typeof(accessoryData.id) != "string") {
        this.log.error("One of your accessories is missing the \"id\" field, which is required. ABORTING.");
        process.exit(0);
        
    } else if (!cbusUtils.verifyModuleId(accessoryData.id)) {
        this.log.error("The specified id (" + accessoryData.id + ") is invalid. ABORTING.");
        process.exit(0);
    }

    //--------------------------------------------------
    //  Define our iVars
    //--------------------------------------------------

    this.platform       =   platform;
    this.client         =   this.platform.client;
    this.accessoryData  =   accessoryData;
    this.log            =   platform.log;

    this.id             =   this.accessoryData.id;
    this.uuid_base      =   this.accessoryData.uuid_base;
    this.name           =   this.accessoryData.name;
    this.type           =   typeof(this.accessoryData.type) != "undefined" ? this.accessoryData.type : undefined;

    //--------------------------------------------------
    //  Fire our parent
    //--------------------------------------------------
    Accessory.call(this, this.name, uuid.generate(String(this.id)));

    //--------------------------------------------------
    //  Setup the service
    //--------------------------------------------------
    var s = this.getService(Service.AccessoryInformation);
    
    s.setCharacteristic(Characteristic.Manufacturer, "CBus")
        .setCharacteristic(Characteristic.SerialNumber, String(this.id));
    
    if (this.type) {
        s.setCharacteristic(Characteristic.Model, this.type);
    }
};

CBusAccessory.prototype.getServices = function() {
    return this.services;
};

CBusAccessory.prototype._log = function(tag, message) {
    this.log.info("[" + tag + "] [" + this.accessoryData.id + ", " + this.accessoryData.name + "]: " + message);
}