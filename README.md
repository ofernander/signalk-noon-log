# signalk-noon-log
Semi-automatic logbook and vessel tracker

## Features
- Scheduled reports (configurable interval)
- GPS position tracking with Google Maps links
- Distance tracking (since last report + total voyage)
- Weather data collection (wind, temperature, pressure)
- Email delivery via SMTP
- Manual log entries
- SQLite storage
- Web interface for log management

## Dependencies
nodemailer
sql.js
## Installation
Install via SignalK Appstore or:
```bash
cd ~/.signalk/node_modules
git clone https://github.com/ofernander/signalk-noon-log.git
cd signalk-noon-log
npm install
```
Restart SignalK, enable plugin, configure SMTP settings.