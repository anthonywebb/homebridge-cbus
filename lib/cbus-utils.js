'use strict';

const inherits = require('util').inherits;

const path = require('path');
const chalk = require('chalk');

// necessary because Accessory is defined after we have defined all of our classes
module.exports.fixInheritance = function (subclass, superclass) {
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
	if (typeof x === `undefined`) {
		return undefined;
	}

	const parsed = parseInt(x, 10);
	if ((typeof parsed !== `undefined`) && (parsed.toString() !== x.toString())) {
		throw new Error(`not an integer: '${x}'`);
	}

	return parsed;
};

// given a fully qualified path name from __filename, return just the file name, minus the '.js' suffix
module.exports.extractIdentifierFromFileName = function (filename) {
	const name = filename.slice(filename.lastIndexOf(path.sep) + 1);
	return name.slice(0, name.length - 3);
};

// remove newlines and truncate if over a given length
// add an elipsis if the string is truncated
module.exports.truncateString = function (input, max = 100) {
	console.assert(typeof input !== `undefined`, `can't truncate undefined`);

	let output = input;
	if (output.length > (max - 1)) {
		output = output.slice(0, max - 1).concat(`…`);
	}
	return output;
};

// helper for pretty-printing
module.exports.formatTag = function (tag, id) {
	return `${chalk.red.bold(tag)} ${chalk.yellow(id)}`;
};

