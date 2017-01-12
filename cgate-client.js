'use strict';

//==========================================================================================
//  Definitions
//==========================================================================================

var DEFAULT_CLIENT_CONTROL_PORT = 20023;
var DEFAULT_CLIENT_EVENT_PORT = 20024;
var DEFAULT_CLIENT_STATUS_PORT = 20025;
var DEFAULT_CLIENT_NETWORK = 254;
var DEFAULT_CLIENT_APPLICATION= 56;
var DEFAULT_CLIENT_DEBUG= false;

var log     = require('util').log;
var carrier = require('carrier');
var net     = require('net');

var EventEmitter = require('events').EventEmitter;
var util = require('util');

var cbusUtils    = require('./cbus-utils.js');

//==========================================================================================
//  CBusClient initialization
//==========================================================================================

function CBusClient(clientIpAddress, clientControlPort, clientEventPort, clientStatusPort, clientCbusName, clientNetwork, clientApplication, clientDebug)
{
    //--------------------------------------------------
    //  vars setup
    //--------------------------------------------------
    this.clientIpAddress    = clientIpAddress;
    this.clientCbusName     = clientCbusName;
    this.clientControlPort  = clientControlPort || DEFAULT_CLIENT_CONTROL_PORT;
    this.clientEventPort    = clientEventPort || DEFAULT_CLIENT_EVENT_PORT;
    this.clientStatusPort   = clientStatusPort || DEFAULT_CLIENT_STATUS_PORT;
    this.clientNetwork      = clientNetwork || DEFAULT_CLIENT_NETWORK;
    this.clientApplication  = clientApplication || DEFAULT_CLIENT_APPLICATION;
    this.clientDebug        = clientDebug || DEFAULT_CLIENT_DEBUG;

    this.control            = undefined;
    this.events             = undefined;
    this.statuses           = undefined;
    this.pendingStatusQueue = [];

    this.state = {};

    EventEmitter.call(this);
}

util.inherits(CBusClient, EventEmitter);

//==========================================================================================
//  Public API
//==========================================================================================

/**
 * Opens a connection with the CBus server by binding the client ip address and port.
 */
CBusClient.prototype.connect = function(callback)
{
    var that = this;
    this.control = net.createConnection(this.clientControlPort,this.clientIpAddress,function(){
        // if this connects we know we have good creds to the cgate
        callback();
    });
    this.control.on('error', function(error){
        log('cgate control socket error: ' + error);
    });
    this.control.on('end', function(){
        log('cgate control socket terminated');
    });
    this.control.on('close', function(){
        log('cgate control socket closed');
    });
    this.control.on('timeout', function(){
        log('cgate control socket timed out');
    });
    carrier.carry(this.control, function(line) {
        that._socketReceivedMessageEvent(line, "controlStream");
    });

    this.events = net.createConnection(this.clientEventPort,this.clientIpAddress);
    this.events.on('error', function(error){
        log('cgate events socket error: ' + error);
    });
    this.events.on('end', function(){
        log('cgate events socket terminated');
    });
    this.events.on('close', function(){
        log('cgate events socket closed');
    });
    this.events.on('timeout', function(){
        log('cgate events socket timed out');
    });
    carrier.carry(this.events, function(line) {
        that._socketReceivedMessageEvent(line, "eventStream");
    });

    this.statuses = net.createConnection(this.clientStatusPort,this.clientIpAddress);
    this.statuses.on('error', function(error){
        log('cgate statuses socket error: ' + error);
    });
    this.statuses.on('end', function(){
        log('cgate statuses socket terminated');
    });
    this.statuses.on('close', function(){
        log('cgate statuses socket closed');
    });
    this.statuses.on('timeout', function(){
        log('cgate statuses socket timed out');
    });
    carrier.carry(this.statuses, function(line) {
        that._socketReceivedMessageEvent(line, "statusStream");
    });
};

/**
 * Disconnects from the CBus server.
 */
CBusClient.prototype.disconnect = function()
{
    if (typeof(this.control) == "undefined") {
        throw new Error("The control socket has not been initialized yet.");
    }
    this.control.close();

    if (typeof(this.events) == "undefined") {
        throw new Error("The event socket has not been initialized yet.");
    }
    this.events.close();

    if (typeof(this.statuses) == "undefined") {
        throw new Error("The status socket has not been initialized yet.");
    }
    this.statuses.close();
};

CBusClient.prototype.turnOnLight = function(id, callback)
{
    if(this.state[id] && !this.state[id].on){
        var cmd = this._buildSetCommandString(id,"on",100);
        this._sendMessage(cmd, callback);
    } else {
        //console.log("light is already on, no need to send the command again");
        if (typeof(callback) != "undefined") {
            callback();
        } 
    }
};

CBusClient.prototype.turnOffLight = function(id, callback)
{
    if(this.state[id] && this.state[id].on){
        var cmd = this._buildSetCommandString(id,"off",0);
        this._sendMessage(cmd, callback);
    } else {
        //console.log("light is already off, no need to send the command again");
        if (typeof(callback) != "undefined") {
            callback();
        } 
    }
};

CBusClient.prototype.receiveLightStatus = function(id, callback)
{
    var cmd = this._buildGetCommandString(id,"level");

    this.pendingStatusQueue.push({
       id: id, callback: callback
    });

    this._sendMessage(cmd);
};

CBusClient.prototype.setLightBrightness = function(id, value, callback)
{
    var cmd = this._buildSetCommandString(id,"ramp",value);
    this._sendMessage(cmd, callback);
};

CBusClient.prototype.receiveSecurityStatus = function(id, callback)
{
    var cmd = this._buildGetCommandString(id,"zonestate");
    
    this.pendingStatusQueue.push({
                                 id: id, callback: callback
                                 });
    
    this._sendMessage(cmd);
};


//==========================================================================================
//  Events handling
//==========================================================================================

CBusClient.prototype._socketReceivedMessageEvent = function(message, type)
{
    //--------------------------------------------------
    //  Attempt to resolve the income message
    //--------------------------------------------------

    this._resolveReceivedMessage(message, type);
};

//==========================================================================================
//  Private API
//==========================================================================================

CBusClient.prototype._buildGetCommandString = function(id,command) {
    
    var cbusAddress = cbusUtils.cbusAddressForId(id);
    
    var message = 'GET //'+this.clientCbusName+'/'+cbusAddress+' '+command+'\n';
    
    if(this.clientDebug){
        console.log("Message:"+message);
    }
    
    return message;
}
CBusClient.prototype._buildSetCommandString = function(id,command,level,delay) {
    var message = '';
    
    var cbusAddress = cbusUtils.cbusAddressForId(id);

    if(command=='on') {
        message = 'ON //'+this.clientCbusName+'/'+cbusAddress+'\n';
    }
    else if (command=='off') {
        message = 'OFF //'+this.clientCbusName+'/'+cbusAddress+'\n';
    }
    else if (command=='ramp') {

        if (level <= 100) {
            if (delay) {
            message = 'RAMP //'+this.clientCbusName+'/'+cbusAddress+' '+level+'% '+delay+'\n';
            } else {
            message = 'RAMP //'+this.clientCbusName+'/'+cbusAddress+' '+level+'%\n';
            }
        }
    }
    
    if(this.clientDebug){
        console.log("Message:"+message+" (command:"+command+")");
    }

    return message;
}

CBusClient.prototype._sendMessage = function(command, callback) {
    //--------------------------------------------------
    //  Send
    //--------------------------------------------------
    this.control.write(command, function(err){
        /* Fire the callback */
        if(err){
            console.log("error sending: ",err)
        }
        if (typeof(callback) != "undefined") {
            callback(command);
        }    
    });
};

CBusClient.prototype._resolveReceivedMessage = function(buffer, type) {
    //--------------------------------------------------
    //  Create a new response object
    //--------------------------------------------------

    var responseObj = new CBusStatusPacket(buffer, type);

    if(this.clientDebug){
        console.log(responseObj);
    }

    //--------------------------------------------------
    //  Prepare our match 'n' call callback
    //--------------------------------------------------
    /* Iterate over the pending items and clear them out */
    for (var i = 0; i < this.pendingStatusQueue.length; i++) {
        var item = this.pendingStatusQueue[i];
        if (item.id == responseObj.moduleId)
        {
            /* Fire the callback */
            item.callback(responseObj);

            /* Remove it from the queue */
            this.pendingStatusQueue.splice(i, 1);
        }
    }

    // lets track some state for each device, this way we dont do things like turn on devices that are already on (when dimming)
    if(responseObj.moduleId != null && responseObj.level != null){
        this.state[responseObj.moduleId] = {on: responseObj.level > 0 ? true : false};
    }

    if(responseObj.channel=='statusStream'){
        //this.platform.remoteLevelUpdate(this.platform.foundAccessories ,responseObj.moduleId, responseObj.level);
        /* Iterate over the accesories and make sure the current state gets set */
        this.emit('remoteData', responseObj);
    }
};

//==========================================================================================
//  CBusStatusPacket
//==========================================================================================

function CBusStatusPacket(data, channel)
{

    //--------------------------------------------------
    //  Setup our iVars
    //--------------------------------------------------

    this.raw          = data;
    this.channel      = channel;
    this.type         = "unknown";
    this.source       = "cbus";

    var array = data.match(/\b[\S]+\b/g);

    // is this a lighting packet?
    if (array[0]=='lighting') {
        this.type = 'lighting';

        this.action = array[1];

        // the elements of arr2 are the project/network/application/group
        var temp = array[2].split("/");
        this.moduleId = cbusUtils.idForCbusAddress(temp[1], temp[2], temp[3]);
        
        var parseunit = array[3];
        var parseoid = array[4];

        if (this.action == 'ramp') {
            this.level = this._humanLevelValue(array[3]);
            this.time = array[4];
            parseunit = array[5];
            parseoid = array[6];
        } else if (this.action == 'on') {
            this.level = 100;
        } else if (this.action == 'off') {
            this.level = 0;
        }

        temp = parseunit.split('=');
        this.sourceunit = temp[1];

        temp = parseoid.split('=');
        this.oid = temp[1];
        
    } else if (array[0]=='security') {
        
        this.type = 'security';
        
        this.action = array[1];
        
        // the elements of arr2 are the project/network/application/group
        var temp = array[2].split("/");
        this.moduleId = cbusUtils.idForCbusAddress(temp[1], temp[2], temp[3]);

        var parseunit = array[3];
        var parseoid = array[4];

        if (this.action == 'zone_unsealed' || this.action == 'zone_open' || this.action == 'zone_short') {
            this.level = 100;
        } else if (this.action == 'zone_sealed') {
            this.level = 0;
        }

        temp = parseunit.split('=');
        this.sourceunit = temp[1];

        temp = parseoid.split('=');
        this.oid = temp[1];
    }


    // are we getting group level report?
    if (array[0].substring(0, 3) == '300') {
        var temp = array[array.length-1].split('=');
        
        if(temp[0] == 'level') {
            this.type = 'info';
            this.level = this._humanLevelValue(temp[1]);
            var ind = (array.length == 3 ? 1 : 0);

            var temp2 = array[ind].split("/");
            this.moduleId = cbusUtils.idForCbusAddress(temp2[1], temp2[2], temp2[3]);;
        } else if(temp[0] == 'zonestate') {
            //console.log('zonestate:'+temp[1]);
            //console.log(array);
            
            this.type = 'info';
            this.level = this._humanLevelValue(temp[1]);
            var ind = (array.length == 3 ? 1 : 0);
            
            var temp2 = array[ind].split("/");
            this.moduleId = cbusUtils.idForCbusAddress(temp2[1], temp2[2], temp2[3]);;
        }

    }

    //console.log(this);

    // are there custom things we want to do when this event occurs? ONLY do this for the status stream
    if(channel=='statusStream' || this.type=='info'){
        //COMMON.processMessage(packet);
    }

};

CBusStatusPacket.prototype._humanLevelValue = function humanLevelValue(level) {
    // convert levels from 0-255 to 0-100
    var temp = Math.round((level/255)*100)

    if(temp > 100){
        temp = 100;
    }
    else if(temp < 0){
        temp = 0;
    }

    return temp;
}

//==========================================================================================
//  Exportation
//==========================================================================================

module.exports = CBusClient;
