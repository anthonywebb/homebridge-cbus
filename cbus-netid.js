'use strict';

module.exports = CBusNetId;

const test = require('tape');
const util = require('util');

// object representing C-Bus network id (netId) in one of the following formats:
// network -- '//SHAC/254'
// application: '//SHAC/254/56'
// group address: '//SHAC/254/56/191'
function CBusNetId (project, network, application, group) {
	if (project.match(/^([A-Z][A-Z0-9]{0,7})$/) == null) {
		throw `illegal project name '${project}`;
	}
	
	this.project = project;
	this.network = integerise(network);
	this.application = integerise(application);
	this.group = integerise(group);
}

CBusNetId.prototype.toString = function () {
	let result = `//${this.project}/${this.network}`;
	
	if (typeof this.application != 'undefined') {
		result = (`${result}/${this.application}`);
		
		if (typeof this.group != 'undefined') {
			result = (`${result}/${this.group}`)
		}
	}
	
	return result;
};

CBusNetId.prototype.inspect = function (depth, options) {
	return this.toString();
};

CBusNetId.prototype.getModuleId = function () {
	return (((this.network & 0xFF) << 16) | ((this.application & 0xFF) << 8) | (this.group & 0xFF)).toString(16);
};

// static factory method
CBusNetId.parseNetId = function (netIdString) {
    const components = netIdString.match(/^\/\/([A-Z][A-Z0-9]{0,7})\/(\d{1,3})(?:\/(\d{1,3})(?:\/(\d{1,3}))?)?$/);
    
    if (!components) {
    	throw `badly formed netid: '${netIdString}'`;
	}
	
	// util.log(util.inspect(components));
    return new CBusNetId(components[1], components[2], components[3], components[4]);
};

function integerise(x) {
	// parse the input as an integer
	// allow undefined to pass throw, but otherwise throw exception if input isn't expressable as an integer
	if (typeof x == 'undefined') {
		return undefined;
	}
	
	const parsed = parseInt(x);
	if ((typeof parsed != 'undefined') && (parsed.toString() !== x.toString())) {
		throw `not an integer: '${x}'`;
	}
	
	return parsed;
}