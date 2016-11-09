# CBus for Homebridge

Make your home CBus accessories controllable using Apple's HomeKit with your [Homebridge](https://github.com/nfarina/homebridge) server.

This projects provides a bridge between your CBus local server and HomeKit. Thus, once you setup your homebridge server, poof - all of your supported accessories will be instantly controllable via HomeKit.

What does that means? You'll be able to:
* Control your home using each app in the App Store which supports the HomeKit protocol.
* Control your home using voice commands via Siri.
* Use the built-in Home app (iOS 10+) to control your home.

## Device Support

CBus already provides a fully supported home automation platform. Hence, this project that provides a bridge which "expose' your devices in a way that you can control then using HomeKit.

We are working on adding device types, but for now you'll only be able to control:
* Lightblubs.
* Dimmers.
* Motion Sensors.

## Installation

After installing and setting up [Homebridge](https://github.com/nfarina/homebridge), you can install the Home Assistant plugin with:

    npm install -g homebridge-cbus

Once installed, update your Homebridge's `config.json`.

## Configuration

As with other Homebridge plugins, you configure the Home Assistant plugin by
adding it to your `config.json`.  It is important to note that if you are connecting to a remote
c-gate server, you will likely need to configure c-gate for remote connections.

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

### Configuration Platform fields:
* `platform` and `name`: The platform name, you may leave these values.
* `client_ip_address`: (required) Your CBus local server IP address.
* `client_cbusname`: (required) The name of your CBus network.
* `client_controlport`: (optional) Your CBus control port number.
* `client_eventport`: (optional) Your CBus event port number.
* `client_statusport`: (optional) Your CBus status port number.
* `client_network`: (optional) The network address for your CBus network.
* `client_application`: (optional) The application address for your CBus network.
* `client_debug`: (optional) Write CBus client debug logs to the console.
* `accessories`: (required) List of accessories which you'd like to expose to the homebridge server.

#### Registering accessories
Right now we are registering devices by hand.  In the future we may auto discover them. The platform definition in the `config.json` file contains an `accessories` array, which constitudes from objects with the following keys:
* `type`: (required) The type of the accessory. The valid values are "light", "motion", and "dimmer".
* `name`: (required) The name of the accessory (e.g. "Living room light", "Beedroom light", "Living Room curtain" etc.).
* `id`: (required) The id of the device. Each accessory in CBus has one.

#### Fully functional example config.json:
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
        { "type": "dimmer", "id": "3", "name": "Closet" },
        { "type": "motion", "id": "51", "name": "Main" }
      ]
    }
  ],
  "accessories": [ ]
}
````

## Contributions
* fork
* create a feature branch
* open a Pull Request


Contributions are surely welcome!!