'use strict';

const inherits = require('util').inherits;

// necessary because Accessory is defined after we have defined all of our classes
module.exports.fixInheritance = function(subclass, superclass) {
    const proto = subclass.prototype;
    inherits(subclass, superclass);
    subclass.prototype.parent = superclass.prototype;
    for (let mn in proto) {
        subclass.prototype[mn] = proto[mn];
    }
};

// parse the requestMessage as an integer
// allow undefined to pass throw, but otherwise throw exception if requestMessage isn't an integer or a string version of an integer
module.exports.integerise = function (x) {
	if (typeof x == 'undefined') {
		return undefined;
	}
	
	const parsed = parseInt(x);
	if ((typeof parsed != 'undefined') && (parsed.toString() !== x.toString())) {
		throw `not an integer: '${x}'`;
	}
	
	return parsed;
};
