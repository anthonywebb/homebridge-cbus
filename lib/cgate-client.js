'use strict';

const net = require('net');
const util = require('util');

const EventEmitter = require('events').EventEmitter;

require('../hot-debug.js');
const log = require('debug')('cbus:client');

const carrier = require('carrier');
const chalk = require('chalk');

const cbusUtils = require('./cbus-utils.js');
const CBusNetId = require('./cbus-netid.js');

// ==========================================================================================
// Definitions
// ==========================================================================================

const DEFAULT_CLIENT_CONTROL_PORT = 20023;

const DEFAULT_CLIENT_NETWORK = 254;
const DEFAULT_CLIENT_APPLICATION = 56;

const DEFAULT_CLIENT_DEBUG = false;

const EVENT_TYPE = `event`;
const RESPONSE_TYPE = `response`;
const SNIPPET_TYPE = `snippet`;

// ==========================================================================================
// Notes
// ==========================================================================================
//
// firstly, crank up the debug level of events so we receive fine-grained notifications.
// events e8s0c0
//
// there are now only categories of messages to parse:
//
// 	 command
// 		a. set command
// 			TX: lighting on //SHAC/254/56/3
// 			RX: 200 OK: //SHAC/254/56/3
//
// 		b. get command
// 			TX: get //SHAC/254/56/3 level
// 			RX: 300 //SHAC/254/56/3: level=0
//
// 	2. an event
// 		a. 702 application information event
// 			RX: #e# 20170204-130934.821 702 //SHAC/254/208 3dfc8d80-c4aa-1034-9fa5-fbb6c098d608 [security] system_arm 1 sourceUnit=213
// 			RX: #e# {timestamp} 702 {netid} {objectId} [security] [verb] [optional parameter(s)] sourceUnit=213
//
// 		b. 730 level advice
// 			RX: #e# {timestamp} 730 //SHAC/254/56/3 3df86ed0-c4aa-1034-9e9e-fbb6c098d608 new level=255 sourceunit=12 ramptime=0 sessionId=cmd385 commandId=123
// 			RX: #e# {timestamp} 730 {netid} {objectId} new {key=value}+
//
// 		c. everything else (ignore for now)
// 		RX: #e# { timestamp} 700 cgate - Heartbeat.

// ==========================================================================================
// CBusClient initialization
// ==========================================================================================

function CBusClient(cgateIpAddress, cgateControlPort,
					project, network, application,
					clientDebug) {
	console.assert(cgateIpAddress);

	//--------------------------------------------------
	// vars setup
	//--------------------------------------------------
	this.cgateIpAddress = cgateIpAddress;
	this.cgateControlPort = cgateControlPort || DEFAULT_CLIENT_CONTROL_PORT;

	this.project = project;
	this.network = network || DEFAULT_CLIENT_NETWORK;
	this.application = application || DEFAULT_CLIENT_APPLICATION;

	this.clientDebug = clientDebug || DEFAULT_CLIENT_DEBUG;

	this.socket = undefined;
	this.connectionReady = false;

	this.commandId = 100;
	this.pendingCommands = new Map();
	this.wasOpen = false;
	this._resetBackoff();

	EventEmitter.call(this);
}


util.inherits(CBusClient, EventEmitter);

CBusClient.prototype._resetBackoff = function () {
	// backoff delay sequence generator
	function* getBackoff() {
		let index = 0;
		const BACKOFFS = [1, 2, 2, 2, 5, 5, 5, 15, 30, 60];

		while (true) {
			if (index >= BACKOFFS.length) {
				index = BACKOFFS.length - 1;
			}

			const backoff = BACKOFFS[index++];
			const reset = yield backoff;
		}
	}

	this.backoffSequence = getBackoff();
};

CBusClient.prototype._getBackoff = function () {
	return this.backoffSequence.next().value;
};


// ==========================================================================================
// Public API
// ==========================================================================================

/**
 * Opens and prepares a connection with the C-Gate server.
 */
CBusClient.prototype.connect = function (callback) {
	const that = this;

	function reopenConnection() {
		that.connectionReady = false;

		// reopen the socket if it has closed under us
		const delay = that._getBackoff();
		log(`C-Gate socket closed unexpectedly; will attempt reconnect in ${delay}s`);
		setTimeout(function () {
			that.connect();
		}, delay * 1000);
	}

	log(`Opening connection to C-Gate…`);
	this.socket = net.createConnection(this.cgateControlPort, this.cgateIpAddress);

	this.socket.on('connect', function () {
		log(`C-Gate connection open.`);
		that.wasOpen = true;
		that._resetBackoff();
	});

	this.socket.on('error', function (error) {
		log(`C-Gate socket error: ${error}`);

		if (that.wasOpen) {
			reopenConnection();
		} else {
			// if we've never had a successful connection, then force quit -- yes, a bit heavy handed
			log(`C-Gate connection could not be opened; exiting.`);
			process.exit(0);
		}
	});

	this.socket.on('end', function () {
		log(`C-Gate socket terminated.`);
	});

	// from node documentation: By default net.Socket does not have a timeout.
	// so not sure how we would get this
	this.socket.on('timeout', function () {
		log(`C-Gate socket timed out`);
	});

	carrier.carry(this.socket, function (line) {
		if (that.connectionReady) {
			that._socketReceivedLine(line);
		} else {
			// TODO we should timeout if we haven't received a response to the 'events' command within a certain period
			const SERVICE_READY_REGEX = /201 Service ready: Clipsal C-Gate Version: (v\d+\.\d+\.\d+ \(build \d+\)) #cmd-syntax=(\d+\.\d+)/;
			const EVENTS_REQUEST = `[99] events e8s0c0\r\n`;
			const EVENTS_RESPONSE_REGEX = /\[99\] 200 OK\./;

			// on startup, we need to configure the events port to send us messages from every channel
			let parts;

			if (parts = line.match(SERVICE_READY_REGEX)) {
				log(`Connected to C-Gate server ${parts[1]}, syntax v${parts[2]}`);
				log(`Configuring C-Gate session…`);
				that.socket.write(EVENTS_REQUEST);
			} else if (parts = line.match(EVENTS_RESPONSE_REGEX)) {
				// we've connected to cgate and received a response to our command to
				// set the event level as we want it.
				log(`C-Gate session estabished and configured at ${that.cgateControlPort}:${that.cgateIpAddress}`);
				that.connectionReady = true;
				if (callback) {
					callback();
				}
			} else {
				log(`C-Gate session not ready -- unexpected message: ${line}`);
			}
		}
	});
};

/**
 * Disconnects from the CBus server.
 */
CBusClient.prototype.disconnect = function () {
	if (typeof this.socket === `undefined`) {
		throw new Error('CGate socket has not been initialized yet.');
	}
	this.socket.end();
};

/**
 * CGate level commands
 */
CBusClient.prototype.turnOn = function (netId, callback) {
	const cmd = this._buildSetCommandString(netId, 'on', 100);
	this._sendMessage(cmd, callback);
};

CBusClient.prototype.turnOff = function (netId, callback) {
	const cmd = this._buildSetCommandString(netId, 'off', 0);
	this._sendMessage(cmd, callback);
};

CBusClient.prototype.receiveLevel = function (netId, callback, comment) {
	const cmd = this._buildGetCommandString(netId, 'level', comment);
	this._sendMessage(cmd, callback);
};

CBusClient.prototype.setLevel = function (netId, level, callback, delay, comment) {
	const cmd = this._buildSetCommandString(netId, 'ramp', level, delay, comment);
	this._sendMessage(cmd, callback);
};

CBusClient.prototype.triggerAction = function (netId, action, callback) {
	const cmd = this._buildSetCommandString(netId, 'trigger', action);
	this._sendMessage(cmd, callback);
};

CBusClient.prototype.receiveSecurityStatus = function (netId, callback) {
	const cmd = this._buildGetCommandString(netId, 'zonestate');
	this._sendMessage(cmd, callback);
};

CBusClient.prototype.getDB = function (netId, callback) {
	const cmd = `dbgetxml ${netId.toString()}`;
	this._sendMessage(cmd, callback);
};

CBusClient.prototype.receiveData = function (netId, callback, comment) {
	const cmd = this._buildGetCommandString(netId, 'data', comment);
	this._sendMessage(cmd, callback);
};

// ==========================================================================================
// Private API
// ==========================================================================================

CBusClient.prototype._buildGetCommandString = function (netId, command, comment) {
	let message = `get ${netId} ${command}`;

	if (comment) {
		message += ` # ${comment}`;
	}

	return message;
};

CBusClient.prototype._buildSetCommandString = function (netId, command, level, duration, comment, data) {
	console.assert(command.match(/^(on|off|ramp|trigger|data)$/), `command not one of on|off|ramp|trigger|data`);

	let message;

	if (command === 'on') {
		message = `on ${netId}`;
	} else if (command === 'off') {
		message = `off ${netId}`;
	} else if (command === 'trigger') {
		message = `trigger event ${netId} ${level}`;
	} else if (command === 'ramp') {
		console.assert(level <= 100, `level ${level} not in range 0..100`);
		message = `ramp ${netId} ${level}%`;
		if (duration) {
			message += ` ${duration}`;
		}
	}

	if (comment) {
		message += ` # ${comment}`;
	}

	return message;
};

CBusClient.prototype._sendMessage = function (message, callback) {
	let nextCommandId = this.commandId++;

	const request = {
		message: message,
		callback: callback,
		raw: `[${nextCommandId}] ${message}`
	};

	// add to pending command map
	this.pendingCommands.set(nextCommandId, request);

	this.socket.write(request.raw + `\n`, function (err) {
		if (err) {
			log(`write error '${err}' when sending '${chalk.green(request.raw)}'`);
		} else {
			log(`sent command '${chalk.green.bold(request.raw)}'`);
		}
	});
};

function _parseResponse(line) {
	// RX: [123] 200 OK: //SHAC/254/56/3
	// RX: [456] 300 //SHAC/254/56/145: level=255
	// parse into { commandId, resultCode, remainder } then process
	const RESPONSE_REGEX = /^\[(\S+)\] (\d{3}) (.*)/;

	let parts = line.match(RESPONSE_REGEX);
	console.assert(parts, `impossible to not have response parts`);

	let response = {
		commandId: parseInt(parts[1], 10),		// it appears that the Map object thinks that "200" != 200
		code: parseInt(parts[2], 10),
		matched: false,
		processed: false
	};

	const message = parts[3];

	// if we requested the level or data, we'll get back a 300
	switch (response.code) {
		case 200: {
			// response from setting a property
			response.processed = true;
			break;
		}
		case 300: {
			// response to a get property command
			// TX: get //SHAC/254/56/3 level
			// RX: 300 //SHAC/254/56/3: level=0
			// parse '//SHAC/254/56/3: level=0' into netId, level
			const OBJ_INFO_LEVEL_REGEX = /^(.*): (level|zonestate)=(\d{0,3})$/;
			const OBJ_INFO_DATA_REGEX = /^(.*): (data)=(\d{0,4})(.*)$/;
			let parsed = message.match(OBJ_INFO_LEVEL_REGEX) || message.match(OBJ_INFO_DATA_REGEX);

			if (!parsed) {
				throw new Error(`not in '(level|zonestate|data)=xxx' format`);
			}

			response.netId = CBusNetId.parse(parsed[1]);
			const attribute = parsed[2];
			const value = parseInt(parsed[3], 10);
			if (attribute === `level`) {
				response.level = _rawToPercent(value);
			} else if (attribute === `data`) {
				response.data = _rawToDecimal(value);
			} else if (attribute === `zonestate`) {
					response.zonestate = _rawToZoneState(value);
			}
			response.processed = true;
			break;
		}

		default:
			// TODO probably should do something special if we get an unexpected result code, eg. `401 Bad object or device ID`
			// debug(chalk.red(`unexpected response code ${responseCode} in line '${response.raw}'`));
			break;
	}

	return response;
}

// convert levels from 0-255 to 0-100 to agree with the table in
// the help document 'C-Bus to percent level lookup table'
function _rawToPercent(raw) {
	if (typeof raw !== `number`) {
		throw new Error(`illegal raw type: ${typeof raw}`);
	}

	if ((raw < 0) || (raw > 255)) {
		throw new Error(`illegal raw level: ${raw}`);
	}

	return Math.floor(((raw + 2) / 255) * 100);
}

function _rawToDecimal(raw) {
	if (typeof raw !== `number`) {
		throw new Error(`illegal raw type: ${typeof raw}`);
	}

	if ((raw < -9999) || (raw > 9999)) {
		throw new Error(`illegal raw level: ${raw}`);
	}
	
	return raw / 100;
}

// valid values for zonestate:
// 0 = sealed
// 1 = unsealed
// 2 = open
// 3 = short
// -1 = unknown
function _rawToZoneState(raw) {
	const LABELS = [`sealed`, `unsealed`, `open`, `short`];
	let result;

	if (raw === -1) {
		result = `unknown`;
	} else if (raw < LABELS.length) {
		result = LABELS[raw];
	} else {
		throw new Error(`illegal zonestate label: ${raw}`);
	}

	return result;
}

// extracts key=value pairs and adds to target
// any left over words are added as as remainder property
function _parseProperties(message, target) {
	// pull out key=value pairs
	const words = message.split(' ');
	let remainder = [];

	for (let word of words) {
		let keyValue = word.split('=');
		if (keyValue.length === 2) {
			const key = keyValue[0];
			let value = keyValue[1];

			if ((key.length === 0) || (value.length === 0)) {
				throw new Error(`bad key=value: '${key}'`);
			}

			// parse it if it's a number
			if (!isNaN(value)) {
				value = parseFloat(value);
			}

			target[key] = value;
		} else {
			remainder.push(word);
		}
	}

	if (remainder.length > 0) {
		// something like 'system_arm 1' or 'exit_delay_started'
		target.remainder = remainder;
	}
}

function _parseEvent(line) {
	// RX: 20170204-130934.821 702 //SHAC/254/208 3dfc8d80-c4aa-1034-9fa5-fbb6c098d608 [security] system_arm 1 sourceUnit=213
	// RX: 20170204-203326.551 730 //SHAC/254/56/3 3df86ed0-c4aa-1034-9e9e-fbb6c098d608 new level=255 sourceunit=12 ramptime=0 sessionId=cmd385 commandId=123
	// RX: 20170204-203326 700 cgate - Heartbeat.

	// parse into time, code, message
	const EVENT_REGEX = /^(\d{8}-\d{6}(?:\.\d{3})?) (\d{3}) (.*)/;

	const parts = line.match(EVENT_REGEX);
	if (!parts) {
		throw new Error(`not in 'timestamp code message' format`);
	}

	let event = {
		time: parts[1],		// it appears that the Map object thinks that "200" != 200
		code: parseInt(parts[2], 10),
		processed: false
	};

	const message = parts[3];

	switch (event.code) {
		case 702: {
			// application information event
			// RX: //SHAC/254/208 3dfc8d80-c4aa-1034-9fa5-fbb6c098d608 [security] exit_delay_started sourceUnit=213
			// RX: //SHAC/254/208/24 - [security] arm_not_ready sourceUnit=213
			// RX: //SHAC/254/208 3dfc8d80-c4aa-1034-9fa5-fbb6c098d608 [security] system_arm 1 sourceUnit=213
			// RX: //SHAC/254/208/13 - [security] zone_sealed sourceUnit=213

			// eg: event.message = '[security] system_arm 1 sourceUnit=213'
			const APP_INFO_REGEX = /^(\S+) (\S+) \[(.*)\] (.+)/;

			const infoParts = message.match(APP_INFO_REGEX);
			if (!infoParts) {
				throw new Error(`not in 'netid objectId [applicationName] remainder' format`);
			}

			event.netId = CBusNetId.parse(infoParts[1]);
			// event.objectId = infoParts[2];		// no current need for objectIds
			event.application = infoParts[3];
			event.processed = true;

			// pull our parameters
			_parseProperties(infoParts[4], event);

			// parse security application events
			if (event.application === `security`) {
				const ZONE_REGEX = /^zone_([a-z]+)$/;
				const parsed = event.remainder[0].match(ZONE_REGEX);
				if (parsed) {
					event.zonestate = parsed[1];
				}
			}
			break;
		}
		case 730: {
			// level advice
			// RX: //SHAC/254/56/3 3df86ed0-c4aa-1034-9e9e-fbb6c098d608 new level=255 sourceunit=12 ramptime=0 sessionId=cmd385 commandId=123

			// eg: event.message = 'new key=value key=value key=value'
			// pull out parameters
			const NEW_LEVEL_REGEX = /^(\S+) (\S+) new (.*)/;

			const attributes = message.match(NEW_LEVEL_REGEX);
			if (!attributes) {
				throw new Error(`not in 'new remainder' format`);
			}

			event.netId = CBusNetId.parse(attributes[1]);
			// event.objectId = attributes[2];
			event.processed = true;

			_parseProperties(attributes[3], event);

			// convert level (if any) to percentage
			if (typeof event.level !== `undefined`) {
				event.level = _rawToPercent(event.level);
			}
			break;
		}
		default: {
			// not of current interest
			event.message = message;
			break;
		}
	}

	return event;
}

function _parseLine(line) {
	// parse the incoming line to an entity
	// line is either:
	// 1. response to a command
	// 2. an event
	// 3. an XML snippet, in which case we'll see:
	// 		[100] 343-Begin XML snippet'
	// 		[100] 347-blahblah (multiple)
	// 		[100] 344 End XML snippet
	const CHANNEL_REGEX = /^#e# (.*)/;
	const RESPONSE_REGEX = /^(\[(\d+)\])\s(\d{3}) (.*)/;
	const SNIPPET_REGEX = /^\[(\d+)\] (347|343)-(.+)$/;

	let parts;
	let parsedLine;
	if (parts = line.match(RESPONSE_REGEX)) {
		// event response without a prefix 'e', so it's a *r*esponse to one of _our_ commands
		parsedLine = _parseResponse(line);
		parsedLine.type = RESPONSE_TYPE;
	} else if (parts = line.match(CHANNEL_REGEX)) {
		parsedLine = _parseEvent(parts[1]);
		parsedLine.type = EVENT_TYPE;
	} else if (parts = line.match(SNIPPET_REGEX)) {
		parsedLine = {
			commandId: cbusUtils.integerise(parts[1]),
			code: cbusUtils.integerise(parts[2]),
			remainder: parts[3],
			type: SNIPPET_TYPE
		};
	} else {
		throw new Error(`unrecognised structure`);
	}
	parsedLine.raw = line;

	return parsedLine;
}

CBusClient.prototype._resolveResponse = function (response) {
	response.matched = this.pendingCommands.has(response.commandId);

	if (response.matched) {
		// found a corresponding request in the pending command cache
		const request = this.pendingCommands.get(response.commandId);
		this.pendingCommands.delete(response.commandId);

		// handle end of snippet -- here because i don't want to introduce `this` context into parseResponse
		if (response.code === 344) {
			// response signalling end of a snippet
			console.assert(typeof this.snippet !== `undefined`, `unexpected snippet end response`);
			console.assert(response.commandId === this.snippet.commandId, `snippet extend commandId mismatch ${this.snippet.commandId} vs ${response.commandId}`);
			response.snippet = this.snippet;
			response.snippet.inspect = function () {
				const abbreviated = cbusUtils.truncateString(this.content, 100);
				return `'${abbreviated}'`;
			};
			response.processed = true;

			// clear out the snippet so it's ready to be used again
			this.snippet = undefined;
		}

		response.request = request;
		log(`matched request '${chalk.magenta.underline(request.raw)}' with response '${chalk.magenta.underline(response.raw)}' ` + chalk.dim(`(${this.pendingCommands.size} pending requests)`));

		if (typeof request.callback !== `undefined`) {
			request.callback(response);
		}
	} else {
		// couldn't find a corresponding request in the pending command cache
		// should be exceedingly rare
		// TODO log as unexpected behaviour
		log(chalk.red(`unmatched response '${response.raw}'`));
	}
};

CBusClient.prototype._resolveSnippetFragment = function (fragment) {
	console.assert([343, 347].includes(fragment.code));

	if (fragment.code === 343) {
		// 343: start the snippet
		console.assert(typeof this.snippet === `undefined`, `can't begin when we already have a snippet forming`);
		console.assert(fragment.remainder === `Begin XML snippet`, `malformed begin entry`);

		this.snippet = {
			commandId: fragment.commandId
		};
	} else if (fragment.code === 347) {
		// 347: extend the snippet
		console.assert(typeof this.snippet !== `undefined`, `can't add content without a snippet begin`);
		console.assert(this.snippet.commandId === fragment.commandId, `snippet extend commandId mismatch ${this.snippet.commandId} vs ${fragment.commandId}`);
		if (typeof this.snippet.content === `undefined`) {
			this.snippet.content = fragment.remainder;
		} else {
			this.snippet.content = this.snippet.content.concat(fragment.remainder);
		}
	}
};

CBusClient.prototype._socketReceivedLine = function (line) {
	try {
		const message = _parseLine(line);
		console.assert([RESPONSE_TYPE, EVENT_TYPE, SNIPPET_TYPE].includes(message.type), `illegal parsedLine type ${message.type}`);

		switch (message.type) {
			case RESPONSE_TYPE: {
				log(chalk.blue(`rx response ${util.inspect(message, {breakLength: Infinity})}`));
				this._resolveResponse(message);
				this.emit(`response`, message);
				break;
			}
			case EVENT_TYPE: {
				log(chalk.blue(`rx event ${util.inspect(message, {breakLength: Infinity})}`));
				this.emit(`event`, message);
				break;
			}
			case SNIPPET_TYPE: {
				this._resolveSnippetFragment(message);
				const logStr = cbusUtils.truncateString(message.remainder);
				log(chalk.blue(`rx snippet ${message.code} '${logStr}'`));
				break;
			}
		}
	} catch (err) {
		// TODO would be good to extract stacktrace
		log(chalk.red(`rx unparsable line: '${line}', error: ${err.stack}`));
		this.emit(`junk`, err, line);
	}
};

module.exports = CBusClient;
