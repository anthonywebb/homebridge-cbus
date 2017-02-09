'use strict';

let Service, Characteristic, CBusAccessory, uuid;
let cbusUtils = require('../cbus-utils.js');

const SHUTTER_OPEN = 100;
const SHUTTER_TOGGLE = 98;
const SHUTTER_OPEN_TOGGLE = 99;
const SHUTTER_DOWN = 0;
const SHUTTER_CLOSE_TOGGLE = 1;
const SHUTTER_STOP = 2;

const SPIN_TIME = 3000;

module.exports = function (_service, _characteristic, _accessory, _uuid) {
  Service = _service;
  Characteristic = _characteristic;
  CBusAccessory = _accessory;
  uuid = _uuid;

  return CBusShutterAccessory;
};

function CBusShutterAccessory(platform, accessoryData) {
    //--------------------------------------------------
    //  Initialize the parent
    //--------------------------------------------------
    CBusAccessory.call(this, platform, accessoryData);
    
    //--------------------------------------------------
    //  Initialize state variables
    //--------------------------------------------------
    
    // handle inversion
    this.invert = accessoryData.invert || 'false';
    
    // prime the last known position of the blinds
    // assume the blinds were closed, but as soon as we can issue a receiveLightStatus to see
    // if we can infer the position from the shutter state
    this.cachedTargetPosition = 0;
    
    setTimeout(function() {
		this._log('CBusShutterAccessory', 'prime shutter level');
		this.client.receiveLightStatus(this.netId, function(message) {
			let translated = this.translateShutterToProportional(message.level);
	
			if (typeof translated != 'undefined') {
				this._log("CBusShutterAccessory", `prime cachedTargetPosition = ${translated}%`);
				this.cachedTargetPosition = translated;
			} else {
				// TODO be smarter here
				this._log("CBusShutterAccessory", `prime position indeterminate (${message.level}%); defaulting to 0%`);
				this.cachedTargetPosition = 0;
			}
		}.bind(this));
		
    }.bind(this), 5000);

    //--------------------------------------------------
    //  Register the Window Covering service
    //--------------------------------------------------
    this.shutterService = this.addService(new Service.WindowCovering(this.name));
        
    // the current position (0-100%)
    // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L3211
    this.shutterService.getCharacteristic(Characteristic.CurrentPosition)
        .on('get', this.getCurrentPosition.bind(this));

    // the target position (0-100%)
    // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L3212
    this.shutterService.getCharacteristic(Characteristic.TargetPosition)
        .on('get', this.getTargetPosition.bind(this))
        .on('set', this.setTargetPosition.bind(this));
            // the position state
            
    // 0 = DECREASING; 1 = INCREASING; 2 = STOPPED;
    // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L3213
    this.shutterService.getCharacteristic(Characteristic.PositionState)
        .on('get', this.getPositionState.bind(this));
}

CBusShutterAccessory.prototype.translateProportionalToShutter = function(level) {
	if ((level > 100) || (level < 0)) {
		this._log("CBusShutterAccessory", `illegal level: ${level}`);
		return 0;
	}
	
	// invert if required
	if (this.invert == 'true') {
		const invertedLevel = 100 - level;
		this._log("CBusShutterAccessory", `${level} inverted to ${invertedLevel}%`);
		level = invertedLevel;
	}
	
	// in level translation mode, the levels 1, 2, 98, 99 have special meanings and should
	// therefore be mapped out to the vales for open (100%) and closed (0%)
	let translated;

	switch (level) {
		case 0:
		case 1:
		case 2:
			translated = 0;
			break;
			
		case 98:
		case 99:
		case 100:
			translated = 100;
			break;
			
		default:
			translated = level;
			break;
	}
	
	return translated;
};

CBusShutterAccessory.prototype.translateShutterToProportional = function(level) {
	if ((level > 100) || (level < 0)) {
		this._log("CBusShutterAccessory", `illegal network level = ${level}`);
		return;
	}

	let translated;
	
	switch (level) {
		case SHUTTER_OPEN:
			translated = 100;
			break;
			
		case SHUTTER_DOWN:
			translated = 0;
			break;
			
		case SHUTTER_TOGGLE:
		case SHUTTER_OPEN_TOGGLE:
		case SHUTTER_CLOSE_TOGGLE:
		case SHUTTER_STOP:
			// could be a bit smarter here
			translated = undefined;
			break;
			
		default:
			translated = level;
			break;
	}
	
	// invert if required
	if ((typeof translated != 'undefined') && (this.invert == "true")) {
		let invertedLevel = 100 - level;
		this._log("CBusShutterAccessory", `${level} inverted to ${invertedLevel}`);
		translated = invertedLevel;
	}
	
	return translated;
};

CBusShutterAccessory.prototype.getCurrentPosition = function(callback, context) {
    this._log("CBusShutterAccessory", "getCurrentPosition = " + this.cachedTargetPosition);
    callback(false, /* value */ this.cachedTargetPosition);
};

CBusShutterAccessory.prototype.getPositionState = function(callback, context) {
    // unless/until we simulate the shutter relay, we don't know whether it is moving
    // so assume that it is stopped
	const currentPositionState = Characteristic.PositionState.STOPPED;
	
    this._log("CBusShutterAccessory", "getPositionState = " + currentPositionState);
    callback(false, currentPositionState);
};

CBusShutterAccessory.prototype.getTargetPosition = function(callback, context) {
    setTimeout(function() {
        this.client.receiveLightStatus(this.netId, function(result) {
           let proportion = this.translateShutterToProportional(result.level);
	       this._log("CBusShutterAccessory", "getTargetPosition = " + proportion);

			if (typeof proportion != 'undefined') {
				// cache a copy
				this.cachedTargetPosition = proportion;
				callback(false, proportion);
			} else {
				// TODO be smarter here
				this._log("CBusShutterAccessory", "getTargetPosition indeterminate; defaulting to 0");
				callback(false, 0);
			}
        }.bind(this));
    }.bind(this), 50);
};

CBusShutterAccessory.prototype.setTargetPosition = function(newPosition, callback, context) {
    // "context" is helping us avoid a never ending loop
    if (context != 'remoteData') {
        this._log("CBusShutterAccessory", `setTargetPosition = ${newPosition} (was ${this.cachedTargetPosition})`);

		// tell homekit that the window covering is moving
		// determine direction of movement and a next position that's not the final position
		let direction, interimPosition;
	
		if (newPosition > this.cachedTargetPosition) {
			this._log("CBusShutterAccessory", "moving up");
			direction = Characteristic.PositionState.INCREASING;
			interimPosition = newPosition - 1;
		} else if (newPosition < this.cachedTargetPosition) {
			this._log("CBusShutterAccessory", "moving down");
			direction = Characteristic.PositionState.DECREASING;
			interimPosition = newPosition + 1;
		} else {
			this._log("CBusShutterAccessory", "moving nowhere");
			direction = Characteristic.PositionState.STOPPED;
		}
	
		if (direction != Characteristic.PositionState.STOPPED) {
			// immediately set the state to look like we're almost there
			this._log("CBusShutterAccessory", `interim position = ${interimPosition} (was ${this.cachedTargetPosition})`);
			this.cachedTargetPosition = interimPosition;
			this.shutterService.setCharacteristic(Characteristic.PositionState, direction);
			this.shutterService.setCharacteristic(Characteristic.CurrentPosition, interimPosition)
    	}
    	
    	// set up move to new shutter level    	
    	let shutterLevel = this.translateProportionalToShutter(newPosition);
        
        // in this framework, the shutter relay position just looks like the brightness of a light
        this.client.setLightBrightness(this.netId, shutterLevel, function() {
            this._log("CBusShutterAccessory", "sent to client: shutter = " + shutterLevel);
   
   			// keep the spinner moving for a little while to give the sense of movement
			setTimeout(function() {
				this.cachedTargetPosition = newPosition;
				this._log("CBusShutterAccessory", `finishing movement; signalling stopping at ${this.cachedTargetPosition}`);
				this.shutterService.setCharacteristic(Characteristic.CurrentPosition, this.cachedTargetPosition);
				this.shutterService.setCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);
				this._log("CBusShutterAccessory", "finished movement.\n\n");
			}.bind(this), SPIN_TIME);
				
            callback();
        }.bind(this));
    } else {
    	this._log("CBusShutterAccessory", "suppressing remote setTargetPosition");
        callback();
    }
};

CBusShutterAccessory.prototype.processClientData = function(message) {
	const level = message.level;
	const translated = this.translateShutterToProportional(level);
	
	if (typeof translated != 'undefined') {
		this._log("CBusShutterAccessory", `client: received ${translated}%`);
		
		if (this.cachedTargetPosition != translated) {
			this.shutterService.getCharacteristic(Characteristic.TargetPosition).setValue(translated, undefined, 'remoteData');

			//  move over 2 seconds
			setTimeout(function() {
				this.cachedTargetPosition = translated;
		
				// in many cases the shutter will still be travelling for a while, but unless/until we
				// simulate the shutter relay, we won't know when it has stopped. 
				// so just assume it gets there immediately.		
				this.shutterService.getCharacteristic(Characteristic.CurrentPosition)
					.setValue(this.cachedTargetPosition, undefined, 'remoteData');
				this.shutterService.getCharacteristic(Characteristic.PositionState)
					.setValue(Characteristic.PositionState.STOPPED, undefined, 'remoteData');
			}.bind(this), SPIN_TIME);
		}
	} else {
		this._log("CBusShutterAccessory", "client: indeterminate");
		
		// could be a bit smarter here
		this.cachedTargetPosition = 0;
	}
};
