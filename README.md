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

## Installation

After installing and setting up [Homebridge](https://github.com/nfarina/homebridge), you can install the Home Assistant plugin with:

    npm install -g homebridge-cbus

Once installed, update your Homebridge's `config.json`.

## Configuration

As with other Homebridge plugins, you configure the Home Assistant plugin by
adding it to your `config.json`.

```json
  "platforms": [
    {
      "platform": "homebridge-cbus",
      "name": "CBus",
      "client_ip_address": '192.168.11.40',
      "client_controlport": 20023,
      "client_eventport": 20024,
      "client_statusport": 20025,
      "client_cbusname": 'WEBB',
      "client_network": 254,
      "client_application": 56,
      "accessories": [ ... ]
     }
]
```

### Configuration Platform fields:
* `platform` and `name`: The platform name, you may leave these values.
* `client_ip_address`: Your CBus local server IP address.
* `client_controlport`: Your CBus control port number.
* `client_eventport`: Your CBus event port number.
* `client_statusport`: Your CBus status port number.
* `client_cbusname`: The name of your CBus network.
* `client_network`: The network address for your CBus network.
* `client_application`: The application address for your CBus network.
* `accessories`: List of accessories which you'd like to expose to the homebridge server.

#### Registering accessories
Right now we are registering devices by hand.  In the future we may auto discover them. The platform definition in the `config.json` file contains an `accessories` array, which constitudes from objects with the following keys:
* `type`: The type of the accessory. The valid values are "light" and "dimmer".
* `name`: The name of the accessory (e.g. "Living room light", "Beedroom light", "Living Room curtain" etc.).
* `id`: The module id of the accessory. Each accessory in CBus has one.

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
      "platform": "homebridge-cbus",
      "name": "CBus",
      "client_ip_address": "127.0.0.1",
      "client_controlport": 20023,
      "client_eventport": 20024,
      "client_statusport": 20025,
      "client_cbusname": "WEBB",
      "client_network": 254,
      "client_application": 56,
      "accessories":
      [
        { "type": "light", "id": "0", "name": "Flood", "location": "Outdoor" },
        { "type": "light", "id": "1", "name": "Main Bay", "location": "Garage" },
        { "type": "light", "id": "2", "name": "3rd Bay", "location": "Garage" },
        { "type": "light", "id": "3", "name": "Closet", "location": "Court" },
        { "type": "light", "id": "51", "name": "Main", "location": "Master Bdrm" }
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