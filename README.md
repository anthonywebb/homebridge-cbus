# C-Bus for Homebridge

HomeKit enable your C-Bus installation with the `homebridge-cbus` plugin for the [Homebridge](https://github.com/nfarina/homebridge) server.

This project provides a bridge between [Clipsal's C-Bus](http://www2.clipsal.com/cis/technical/product_groups/cbus) server [C-Gate](http://www2.clipsal.com/cis/technical/downloads/c-gate) server and Apple's [HomeKit](http://www.apple.com/au/ios/home/).

Once setup, a Homebridge server with the `homebridge-cbus` plugin will allow you to instantly monitor and control all of your supported C-Bus accessories.

What does that mean? You'll be able to control your home with:
* Siri voice commands
* the built-in iOS 10+ Home app
* iOS apps that support HomeKit.

## In Action
To see some action of HomeKit controlling a Clipsal C-Bus system, check out the following videos:
* https://www.youtube.com/watch?v=1_pzVlegnio
* https://www.youtube.com/watch?v=0NT9AGQd_FU

## Device Support

This project provides a bridge which 'exposes' your devices in a way that you can control then using HomeKit. `homebrige-cbus` is currently able to control and/or monitor:
* lights
* dimmers
* shutter relays
* motion sensors
* security presence detectors.

If you need support for a new device type, feel free to open an issue, or have a go cutting code yourself. If you have some familiarity with [Node.js](https://nodejs.org/) you'll find it pretty straightforward.

## Installation

After installing and setting up [Homebridge](https://github.com/nfarina/homebridge), you can install the `homebridge-cbus` plugin with:

    npm install -g homebridge-cbus

Once installed, update your Homebridge's `config.json`.

N.B. you will need a C-Bus [C-Gate server](http://www2.clipsal.com/cis/technical/downloads/c-gate) on your network. This is a cross platform Java application which runs on most platforms. 

## Configuration

As with other Homebridge plugins, you configure the `homebridge-cbus` plugin by
adding it to your `config.json`.

```json
  "platforms": [
    {
      "platform": "homebridge-cbus.CBus",
      "name": "CBus",
      "client_ip_address": "127.0.0.1",
      "client_controlport": 20023,
      "client_eventport": 20024,
      "client_statusport": 20025,
      "client_cbusname": "HOME",
      "client_network": 254,
      "client_application": 56,
      "client_debug": true,
      "accessories": [ ... ]
     }
]
```

N.B. If you are connecting to a remote C-Gate server, you will likely need to configure C-Gate for remote connections by adding an interface entry to the file `cgate/config/access.txt`.


### Configuration Platform fields:
* `platform` and `name`: platform and name – you may leave these values
* `client_ip_address`: (required) address of your C-Gate server
* `client_cbusname`: (required) name of your C-Bus network
* `client_controlport`: (optional, defaults to 20023) port number of the C-Gate control port
* `client_eventport`: (optional, defaults to 20024) port number of the C-Gate event port
* `client_statusport`: (optional, defaults to 20025) port number of the C-Gate status port
* `client_network`: (optional, defaults to 254) network address of your C-Bus network
* `client_application`: (optional, defaults to 56) application address of your C-Bus network
* `client_debug`: (optional, defaults to `false`) set to `true` to write C-Bus client debug logs to the console
* `accessories`: (required) list of accessories to expose to the Homebridge server

#### Registering accessories
Currently you must register devices by hand in a config file. In the future we may auto-discover them.

The platform definition in the `config.json` file contains an `accessories` array, which defines the available accessories using the following keys:
* `type`: (required) type of the accessory. The valid values are "light", "dimmer", "shutter", "motion", and "security".
* `name`: (required) name of the accessory (e.g. "Living Room Light", "Bedroom Light", "Living Room Curtain" etc.)
* `network`: (optional, defaults to `client_network`) C-Bus network address of the device
* `application`: (optional, defaults to `client_application`) The C-Bus Application address of the device
* `id`: (required) C-Bus address of the device — every accessory in C-Bus has one
* `invert`: (optional, defaults to false) only used by the shutter relay accessory and indicates that the shutter has been wired to open when commanded closed and vice versa

#### Fully functional example `config.json`:
````json
{
  "bridge": {
    "name": "My Home",
    "username": "CC:22:3D:E3:CE:30",
    "port": 51826,
    "pin": "031-45-154"
  },

  "description": "This is the My home HomeKit API configuration file.",

  "platforms": [
    {
      "platform": "homebridge-cbus.CBus",
      "name": "CBus",
      "client_ip_address": "127.0.0.1",
      "client_controlport": 20023,
      "client_eventport": 20024,
      "client_statusport": 20025,
      "client_cbusname": "WEBB",
      "client_network": 254,
      "client_application": 56,
      "client_debug": true,
      "accessories":
      [
        { "type": "light", "id": "0", "name": "Flood" },
        { "type": "light", "id": "1", "name": "Main Bay" },
        { "type": "light", "id": "2", "name": "3rd Bay" },
        { "type": "light", "network": "250", "id": "1", "name": "Outside Light" },
        { "type": "light", "network": "250", "application": "203", "id": "3", "name": "Backdoor" },
        
        { "type": "dimmer", "id": "3", "name": "Closet" },
        
    	{ "type": "shutter", "id": "145", "name": "Living Blinds" },
        { "type": "shutter", "id": "142", "name": "Dining Blinds", "invert": "true"},

        { "type": "motion", "id": "51", "name": "Main" },
        
        { "type": "security", "application": "208", "id": "1", "name": "Entry Zone" }
      ]
    }
  ],
  "accessories": [ ]
}
````

## Changes Since 0.5.0
* 0.5.3:  adds a "shutter" accessory
* 0.5.2:  adds a "security" accessory, for a PIR presence detector, typically application 208
* 0.5.1:  adds optional "network" and "application" parameters per accessory, allowing multiple networks and device types be monitored or controlled.

N.B. If you are upgrading from an ealier version of `homebridge-cbus`, you may need to remove the files in your `~/.homebridge/persist/` directory before running for the first time due to new device UUIDs.

## Contributions
* fork
* create a feature branch
* open a Pull Request

Contributions are surely welcome!
