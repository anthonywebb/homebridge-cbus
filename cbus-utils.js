'use strict';

const inherits = require('util').inherits;
const path = require('path');

// necessary because Accessory is defined after we have defined all of our classes
module.exports.fixInheritance = function(subclass, superclass) {
    const proto = subclass.prototype;
    inherits(subclass, superclass);
    subclass.prototype.parent = superclass.prototype;
    for (let mn in proto) {
        subclass.prototype[mn] = proto[mn];
    }
};

// parse the fromClient as an integer
// allow undefined to pass through, but otherwise throw exception if fromClient
// isn't an integer or a string version of an integer
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

// given a fully qualified path name from __filename, return just the file name, minus the '.js' suffix
module.exports.extractIdentifierFromFileName = function (filename) {
	const name = filename.slice(filename.lastIndexOf(path.sep) + 1);
	return name.slice(0, name.length - 3);
};
