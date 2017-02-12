'use strict';

//==========================================================================================
//  Definitions
//==========================================================================================

const DEFAULT_CLIENT_CONTROL_PORT = 20023;

const DEFAULT_CLIENT_NETWORK = 254;
const DEFAULT_CLIENT_APPLICATION = 56;

const DEFAULT_CLIENT_DEBUG = false;

const net = require('net');
const util = require('util');
const log = require('util').log;
let EventEmitter = require('events').EventEmitter;

const carrier = require('carrier');
const chalk = require('chalk');

const cbusUtils = require('./cbus-utils.js');
const CBusNetId = require('./cbus-netid.js');

const EVENT_TYPE = `event`;
const RESPONSE_TYPE = `response`;


//==========================================================================================
//  CBusClient Notes
//==========================================================================================

/*
firstly, crank up the debug level of events so we receive fine-grained notifications.
    events e7s0c0

there are now only categories of messages to parse:

1. response to a command
    a. set command
        TX: lighting on //SHAC/254/56/3
        RX: 200 OK: //SHAC/254/56/3

    b. get command
        TX: get //SHAC/254/56/3 level
        RX: 300 //SHAC/254/56/3: level=0

2. an event
    a. 702 application information event
        RX: #e# 20170204-130934.821 702 //SHAC/254/208 3dfc8d80-c4aa-1034-9fa5-fbb6c098d608 [security] system_arm 1 sourceUnit=213
        RX: #e# {timestamp} 702 {netid} {objectId} [security] [verb] [optional parameter(s)] sourceUnit=213

    b. 730 level advice
        RX: #e# {timestamp} 730 //SHAC/254/56/3 3df86ed0-c4aa-1034-9e9e-fbb6c098d608 new level=255 sourceunit=12 ramptime=0 sessionId=cmd385 commandId=123
        RX: #e# {timestamp} 730 {netid} {objectId} new {key=value}+

    c. everything else (ignore for now)
        RX: #e# {timestamp} 700 cgate - Heartbeat.
 */


//==========================================================================================
//  CBusClient initialization
//==========================================================================================

function CBusClient(cgateIpAddress, cgateControlPort,
                    project, network, application,
                    log, clientDebug) {
    //--------------------------------------------------
    //  vars setup
    //--------------------------------------------------
    this.cgateIpAddress    = cgateIpAddress;
    this.cgateControlPort  = cgateControlPort || DEFAULT_CLIENT_CONTROL_PORT;

    this.project            = project;
    this.network            = network || DEFAULT_CLIENT_NETWORK;
    this.application        = application || DEFAULT_CLIENT_APPLICATION;

    this.log                = log;
    this.clientDebug        = clientDebug || DEFAULT_CLIENT_DEBUG;

    this.socket             = undefined;
    this.connectionReady    = false;

    this.commandId = 100;
    this.pendingCommands = new Map();

    EventEmitter.call(this);
}

util.inherits(CBusClient, EventEmitter);


//==========================================================================================
//  Public API
//==========================================================================================

/**
 * Opens a connection with the CBus server by binding the client ip address and port.
 */
CBusClient.prototype.connect = function(callback) {
    const that = this;

    this.socket = net.createConnection(this.cgateControlPort, this.cgateIpAddress);

    this.socket.on('error', function(error) {
        that.log.info('C-Gate socket error: ' + error);
    });

    this.socket.on('end', function() {
        that.log.info('C-Gate socket terminated');
    });

    this.socket.on('close', function() {
        that.log.info('C-Gate socket closed');
		// TODO i think this is where we need to reopen the socket if it is closed
    });
	
	// from node documentation: By default net.Socket do not have a timeout.
	// so not sure how we would get this
	this.socket.on('timeout', function() {
        that.log.info('C-Gate socket timed out');
    });

    carrier.carry(this.socket, function(line) {
        if (!that.connectionReady) {
            // TODO we should timeout if we haven't received a response to the 'events' command within a certain period
            const SERVICE_READY_REGEX = /201 Service ready: Clipsal C-Gate Version: (v\d+\.\d+\.\d+ \(build \d+\)) #cmd-syntax=(\d+\.\d+)/;
            const EVENTS_REQUEST = '[99] events e7s0c0\r\n';
            const EVENTS_RESPONSE_REGEX = /\[99\] 200 OK\./;

            // on startup, we need to configure the events port to send us messages from every channel
            let parts;

            if (parts = line.match(SERVICE_READY_REGEX)) {
                that.log.info(`Connected to C-Gate server ${parts[1]} (syntax ${parts[2]})`);
                that.log.info(`Configuring C-Gate session ...`);
                that.socket.write(EVENTS_REQUEST);
            } else if (parts = line.match(EVENTS_RESPONSE_REGEX)) {
                // we've connected to cgate and received a response to our command to
                // set the event level as we want it.
                that.log.info(`C-Gate session configured and ready at ${that.cgateControlPort}:${that.cgateIpAddress}`);
                that.connectionReady = true;
                callback();
            } else {
                that.log.info(`C-Gate session not ready -- unexpected message: ${line}`);
            }
        } else {
            that._socketReceivedLine(line);
        }
    });
};

/**
 * Disconnects from the CBus server.
 */
CBusClient.prototype.disconnect = function() {
    if (typeof(this.socket) == 'undefined') {
        throw new Error('CGate socket has not been initialized yet.');
    }
    this.socket.end();
};

/**
 * CGate level commands
 */
CBusClient.prototype.turnOnLight = function(netId, callback) {
	const cmd = this._buildSetCommandString(netId, 'on', 100);
	this._sendMessage(cmd, callback);
};

CBusClient.prototype.turnOffLight = function(netId, callback) {
	const cmd = this._buildSetCommandString(netId, 'off', 0);
	this._sendMessage(cmd, callback);
};

CBusClient.prototype.receiveLightStatus = function(netId, callback) {
	const cmd = this._buildGetCommandString(netId, 'level');
    this._sendMessage(cmd, callback);
};

CBusClient.prototype.setLightBrightness = function(netId, level, callback, delay) {
	const cmd = this._buildSetCommandString(netId, 'ramp', level, delay);
    this._sendMessage(cmd, callback);
};

CBusClient.prototype.receiveSecurityStatus = function(netId, callback) {
	const cmd = this._buildGetCommandString(netId, 'zonestate');
    this._sendMessage(cmd, callback);
};


//==========================================================================================
//  Private API
//==========================================================================================

// TODO fix! legacy code -- very broken at the moment

/*
function _toPrettyString(parsed) {
	let output;
	
	if (this.type == 'lighting') {
		output = `unit ${this.sourceUnit} just set ${this.netId} to ${this.level}% over ${this.duration}s`;
	} else if (this.type == 'info') {
		output = `${this.netId} group ${this.netId.group} advised current level of ${this.level}%`;
	} else if (this.type == 'event') {
		output = `received event status ${this.statusCode} with message: '${this.eventMessage}'`;
		if (typeof this.timestamp != 'undefined') {
			output = `at ${this.timestamp} ${output}`;
		}
		if (typeof this.commandId != 'undefined') {
			output = `${output} [commandId: ${this.commandId}]`;
		}
	}
	
	let result;
	if (typeof output != 'undefined') {
		result = output;
	} else {
		let flat = JSON.stringify(this);
		result = `untranslated: ${flat}`;
	}
	
	return result;
}
*/


CBusClient.prototype._buildGetCommandString = function(netId, command) {
    return `get ${netId} ${command}`;
};

CBusClient.prototype._buildSetCommandString = function(netId, command, level, duration) {
	console.assert(command.match(/^(on|off|ramp)$/));
	
    let message;

    if (command == 'on') {
        message = `on ${netId}`;
    } else if (command == 'off') {
        message = `off ${netId}`;
    } else if (command == 'ramp') {
        console.assert(level <= 100, `level <= 100; (was ${level})`);
        message = `ramp ${netId} ${level}%`;
        if (duration) {
            message += ` ${duration}`;
        }
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

    this.socket.write(request.raw + `\n`, function(err) {
        if (err) {
            this.log.info(`error '${err} when sending '${chalk.green(request.raw)}'`);
        } else {
            this.log.info(`sent command '${chalk.green.bold(request.raw)}'`);
        }
    }.bind(this));
};

function _parseResponse(line) {
    //  RX: [123] 200 OK: //SHAC/254/56/3
    //  RX: [456] 300 //SHAC/254/56/145: level=255
    //  parse into { commandId, resultCode, remainder } then process
    const RESPONSE_REGEX = /^\[(\S+)\] (\d{3}) (.*)/;

    let parts = line.match(RESPONSE_REGEX);
	console.assert(parts);	// impossible to not have parts

    let response = {
        commandId: parseInt(parts[1]),     // it appears that the Map object thinks that "200" != 200
        code: parseInt(parts[2]),
        matched: false,
        processed: false
    };

    const message = parts[3];
	
	// if we requested the level, we'll get back a 300
	switch (response.code) {
		case 300:
			// TX: get //SHAC/254/56/3 level
			// RX: 300 //SHAC/254/56/3: level=0
			// parse '//SHAC/254/56/3: level=0' into netId, level
			const OBJ_INFO_REGEX = /^(.*): (level|zonestate)=(\d{0,3})$/;
			let parsed = message.match(OBJ_INFO_REGEX);
			if (!parsed) {
				throw `not in '(level|zonestate)=xxx' format`;
			}

			response.netId = CBusNetId.parse(parsed[1]);
			const attribute = parsed[2];
			const value = parseInt(parsed[3]);
			switch(attribute) {
				case `level`:
					response.level = _rawToPercent(value);
					break;
					
				case `zonestate`:
					response.zonestate = _rawToZoneState(value);
					break;
			}
			
			response.processed = true;
			break;

		case 200:
			// result from setting a level
			response.processed = true;
			break;
			
		// TODO probably should handle error `401 Bad object or device ID`

		default:
			// TODO probably should do something special if we get an unexpected result code
			// console.log.info(chalk.red(`unexpected reponse code ${responseCode} in line '${response.raw}'`));
			break;
	}

    return response;
}

// convert levels from 0-255 to 0-100 to agree with the table in
// the help document 'C-Bus to percent level lookup table'
function _rawToPercent(raw) {
	if (typeof raw !== `number`) {
		throw `illegal raw type: ${typeof raw}`;
	}
	
	if ((raw < 0) || (raw > 255)) {
		throw `illegal raw level: ${raw}`;
	}
	
	return Math.floor(((raw + 2) / 255) * 100);
}

// valid values for zonestate:
// 0 = sealed
// 1 = unsealed
// 2 = open
// 3 = short
// -1 = unknown
function _rawToZoneState(raw) {
	const LABELS = [ `sealed`, `unsealed`, `open`, `short` ];
	let result;
	
	if (raw == -1) {
		result = `unknown`
	} else if (raw < LABELS.length) {
		result = LABELS[raw];
	} else {
		throw `illegal zonestate label: ${raw}`;
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
        if (keyValue.length == 2) {
        	const key = keyValue[0];
			let value = keyValue[1];
            
            if ((key.length == 0) || (value.length == 0)) {
            	throw `bad key=value: '${key}'`;
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
        //  something like 'system_arm 1' or 'exit_delay_started'
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
        throw `not in 'timestamp code message' format`;
    }

    let event = {
        time: parts[1],     // it appears that the Map object thinks that "200" != 200
        code: parseInt(parts[2]),
        processed: false
    };

    const message = parts[3];

    switch (event.code) {
        case 702:
            // application information event
            // RX: //SHAC/254/208 3dfc8d80-c4aa-1034-9fa5-fbb6c098d608 [security] exit_delay_started sourceUnit=213
            // RX: //SHAC/254/208/24 - [security] arm_not_ready sourceUnit=213
            // RX: //SHAC/254/208 3dfc8d80-c4aa-1034-9fa5-fbb6c098d608 [security] system_arm 1 sourceUnit=213
            // RX: //SHAC/254/208/13 - [security] zone_sealed sourceUnit=213

            // eg: event.message = '[security] system_arm 1 sourceUnit=213'
            const APP_INFO_REGEX = /^(\S+) (\S+) \[(.*)\] (.+)/;

            const infoParts = message.match(APP_INFO_REGEX);
            if (!infoParts) {
                throw `not in 'netid objectId [applicationName] remainder' format`;
            }

            event.netId = CBusNetId.parse(infoParts[1]);
            // event.objectId = infoParts[2];		// no current need for objectIds
            event.application = infoParts[3];
            event.processed = true;

            // pull our parameters
			_parseProperties(infoParts[4], event);
	
			// parse security application events
			if (event.application == `security`) {
				const ZONE_REGEX = /^zone_([a-z]+)$/;
				const parsed = event.remainder[0].match(ZONE_REGEX);
				if (parsed) {
					event.zonestate = parsed[1];
				}
			}
			break;

        case 730:
            // level advice
            // RX: //SHAC/254/56/3 3df86ed0-c4aa-1034-9e9e-fbb6c098d608 new level=255 sourceunit=12 ramptime=0 sessionId=cmd385 commandId=123

            // eg: event.message = 'new key=value key=value key=value'
            // pull out parameters
            const NEW_LEVEL_REGEX = /^(\S+) (\S+) new (.*)/;

            const attributes = message.match(NEW_LEVEL_REGEX);
            if (!attributes) {
                throw `not in 'new remainder' format`;
            }

            event.netId = CBusNetId.parse(attributes[1]);
            // event.objectId = attributes[2];
            event.processed = true;
	
			_parseProperties(attributes[3], event);

            // convert level (if any) to percentage
            if (typeof event.level != 'undefined') {
                event.level = _rawToPercent(event.level);
            }
            break;

        default:
            // not of current interest
			event.message = message;
            break;
    }

    return event;
}

function _parseLine(line) {
	// parse the incoming line to an entity
	// line is either:
	// 1. response to a command
	// 2. an event
	
	const CHANNEL_REGEX = /^#e# (.*)/;
	const RESPONSE_REGEX = /^(\[(\d+)\])\s(\d{3}) (.*)/;
	
	let parts, parsedLine;
	if (parts = line.match(RESPONSE_REGEX)) {
		// event response without a prefix 'e', so it's a *r*esponse to one of _our_ commands
		parsedLine = _parseResponse(line);
		parsedLine.type = RESPONSE_TYPE;
	} else if (parts = line.match(CHANNEL_REGEX)) {
		parsedLine = _parseEvent(parts[1]);
		parsedLine.type = EVENT_TYPE;
	} else {
		throw `unrecognised structure`;
	}
	parsedLine.raw = line;
	
	return parsedLine;
}

CBusClient.prototype._resolveResponse = function(response) {
	response.matched = this.pendingCommands.has(response.commandId);
	
	if (response.matched) {
		// found a corresponding request in the pending command cache
		const request = this.pendingCommands.get(response.commandId);
		this.pendingCommands.delete(response.commandId);
			
		response.request = request;
		this.log.info(`matched response '${chalk.magenta.underline(response.raw)}' to request '${chalk.magenta.underline(request.raw)}' ` + chalk.dim(`(${this.pendingCommands.size} pending requests)`));
		
		if (typeof request.callback != 'undefined') {
			request.callback(response);
		}
	} else {
		// couldn't find a corresponding request in the pending command cache
		// should be exceedingly rare
		// TODO log as unexpected behaviour
		this.log.info(chalk.red(`unmatched response '${response.raw}'`));
	}
};

CBusClient.prototype._socketReceivedLine = function(line) {
	try {
		const message = _parseLine(line);
		console.assert((message.type == RESPONSE_TYPE) || (message.type == EVENT_TYPE), `illegal parsedLine type ${message.type}`);
		
		switch (message.type) {
			case RESPONSE_TYPE:
				this._resolveResponse(message);
				this.log.info(chalk.blue(`response ${util.inspect(message, { breakLength: Infinity })}`));
				this.emit(`response`, message);
				break;
			
			case EVENT_TYPE:
				this.log.info(chalk.blue(`event ${util.inspect(message, { breakLength: Infinity })}`));
				this.emit(`event`, message);
				break;
		}
	} catch (ex) {
		this.log.info(chalk.red(`received unparsable line: '${line}', exception: ${ex}`));
		this.emit(`junk`, ex, line);
	}
};

module.exports = CBusClient;
