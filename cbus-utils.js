var inherits = require('util').inherits;

/**
 * Checks if the given module id is valid. 
 * @example verifyModuleId("1"), verifyModuleId("2")
*/
module.exports.verifyModuleId = function(moduleIdStr) {
    if (typeof(moduleIdStr) != "string") {
        return false;
    }

    return true;
};

/*
// Parse the module id hex string and retrieve the actual module number.
module.exports.parseModuleId  = function(moduleIdStr) {
    if (!module.exports.verifyModuleId(moduleIdStr)) {
        return undefined;
    }

	var moduleH = parseInt(moduleIdStr.substring(2, 4), 16);
    var moduleM = parseInt(moduleIdStr.substring(4, 6), 16);
    var moduleL = parseInt(moduleIdStr.substring(6, 8), 16);
      
    return [moduleH, moduleM, moduleL];
}
*/

/* Necessary because Accessory is defined after we have defined all of our classes */
module.exports.fixInheritance = function(subclass, superclass) {
    var proto = subclass.prototype;
    inherits(subclass, superclass);
    subclass.prototype.parent = superclass.prototype;
    for (var mn in proto) {
        subclass.prototype[mn] = proto[mn];
    }
};

/**
 * Turns a CBus address into a string of an encoded integer
 * @example idForCbusAddress(254, 56, 1)
 */

module.exports.idForCbusAddress = function(networkID, applicationID, groupID) {
    var id = ((networkID & 0xFF) << 16) | ((applicationID & 0xFF) << 8) | (groupID & 0xFF);
    return id.toString(16);
};

/**
 * Turns an encoded moduleID into a CGate CBus address
 * @example cbusAddressForId(0xfe3401)
 */
module.exports.cbusAddressForId = function (deviceID) {
    var id = parseInt(deviceID, 16);
    
    var groupID = id & 0xFF;
    var applicationID = (id >>> 8) & 0xFF;
    var networkID = (id >>> 16) & 0xFF;
    
    return networkID + '/' + applicationID + '/' + groupID;
};

module.exports.integerise = function (x) {
	// parse the input as an integer
	// allow undefined to pass throw, but otherwise throw exception if input isn't an integer or a string version of an integer
	if (typeof x == 'undefined') {
		return undefined;
	}
	
	const parsed = parseInt(x);
	if ((typeof parsed != 'undefined') && (parsed.toString() !== x.toString())) {
		throw `not an integer: '${x}'`;
	}
	
	return parsed;
};
