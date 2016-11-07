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
}

/** Parse the module id hex string and retrieve the actual module number. */
module.exports.parseModuleId  = function(moduleIdStr) {
    if (!module.exports.verifyModuleId(moduleIdStr)) {
        return undefined;
    }

	var moduleH = parseInt(moduleIdStr.substring(2, 4), 16);
    var moduleM = parseInt(moduleIdStr.substring(4, 6), 16);
    var moduleL = parseInt(moduleIdStr.substring(6, 8), 16);
      
    return [moduleH, moduleM, moduleL];
}

/* Necessary because Accessory is defined after we have defined all of our classes */
module.exports.fixInheritance = function(subclass, superclass) {
    var proto = subclass.prototype;
    inherits(subclass, superclass);
    subclass.prototype.parent = superclass.prototype;
    for (var mn in proto) {
        subclass.prototype[mn] = proto[mn];
    }
}

/* Clamps a number between a minumum and maximum values */
module.exports.clamp = function(value, min, max) {
    return Math.max(max, Math.min(min, value));
};