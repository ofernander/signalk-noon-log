# SignalK Noon Log

A semi-automatic logbook and vessel tracker plugin for SignalK that creates daily noon position reports with weather data, distances, and custom log entries. Reports can be emailed to a distribution list and/or stored locally for offline tracking.

## Features

### 📓 Daily Logging
- Write custom log entries through an intuitive web interface
- Entries are automatically included in noon reports
- Submit anytime before noon (local or UTC)

### 🌍 Automatic Position Tracking
- Captures exact position at noon
- Formats coordinates in both decimal and degrees/minutes
- Includes interactive map links in email reports

### 🌤️ Weather & Environmental Data
- Configurable data paths from SignalK
- Default support for:
  - Wind speed and direction
  - Air temperature
  - Sea temperature
  - Barometric pressure
- Easy to add custom data sources

### 📏 Distance Tracking
- Calculates distance since last report
- Tracks total voyage distance
- Reset trip log as needed for new voyages
- Uses Haversine formula for accurate calculations

### ✉️ Email Reports
- Beautifully formatted HTML emails
- Embedded map images (Google Maps or OpenStreetMap)
- Clickable map links
- Plain text fallback
- Multiple recipients supported

### 💾 Offline Mode
- All logs stored locally in SQLite database
- View history and export logs
- Works completely offline if desired
- No internet connection required for logging

### ⏰ Flexible Scheduling
- Choose between Local Noon (calculated from GPS position) or UTC Noon
- Automatic daily report generation
- Manual trigger option for testing

## Installation

### From npm (when published)
```bash
npm install signalk-noon-log
```

### From GitHub
```bash
cd ~/.signalk/node_modules
git clone https://github.com/yourusername/signalk-noon-log.git
cd signalk-noon-log
npm install
```

### Manual Installation
1. Download the plugin files
2. Place in your SignalK plugin directory (usually `~/.signalk/node_modules/signalk-noon-log`)
3. Run `npm install` in the plugin directory
4. Restart SignalK server

## Configuration

### Basic Setup

1. **Enable the Plugin**
   - Navigate to Server → Plugin Config in SignalK admin
   - Find "Noon Log" and enable it

2. **Configure Noon Time**
   - Choose between:
     - **Local Noon**: Calculated from GPS position (solar noon)
     - **UTC Noon**: Fixed at 12:00 UTC

3. **Set Position Path**
   - Default: `navigation.position`
   - Verify this matches your SignalK configuration

### Email Configuration

To send email reports, configure the following:

1. **Enable Email**
   - Toggle "Enable Email" in settings
   - Ensure "Offline Mode" is disabled

2. **SMTP Settings**
   - **SMTP Server**: Your mail server (e.g., `smtp.gmail.com`)
   - **SMTP Port**: Usually 587 (TLS) or 465 (SSL)
   - **Username**: Your email address
   - **Password**: Your email password or app-specific password
   - **From Email**: Email address to send from
   - **Recipients**: Comma-separated list of email addresses

3. **Map Settings**
   - **Provider**: Google Maps or OpenStreetMap
   - **Google Maps API Key**: Required if using Google Maps
     - Get a key at: https://developers.google.com/maps/documentation/maps-static/get-api-key
   - **Zoom Level**: Map zoom (1-20, default 8)

### Gmail Configuration Example

For Gmail, you'll need to use an App Password:

1. Enable 2-factor authentication on your Google account
2. Go to: https://myaccount.google.com/apppasswords
3. Create an app password for "Mail"
4. Use this password in the SMTP settings

**Settings:**
- SMTP Server: `smtp.gmail.com`
- SMTP Port: `587`
- Use TLS: `Yes`
- Username: `your.email@gmail.com`
- Password: `your-app-password`

### Custom Data Paths

Add any SignalK data to your reports:

```json
{
  "path": "environment.wind.speedApparent",
  "label": "Wind Speed",
  "unit": "knots"
}
```

Common paths:
- `environment.wind.speedApparent` - Apparent wind speed
- `environment.wind.angleApparent` - Apparent wind angle
- `environment.wind.speedTrue` - True wind speed
- `environment.outside.temperature` - Air temperature
- `environment.water.temperature` - Sea temperature
- `environment.outside.pressure` - Barometric pressure
- `navigation.courseOverGroundTrue` - Course
- `navigation.speedOverGround` - Speed

## Usage

### Daily Workflow

1. **Write Your Log Entry**
   - Open the Noon Log interface
   - Enter your daily log (weather observations, events, course changes, etc.)
   - Click "Submit Log Entry"

2. **Automatic Noon Report**
   - At noon (local or UTC), the plugin automatically:
     - Captures current position
     - Collects weather data
     - Calculates distances
     - Combines with your log entry
     - Sends email (if enabled)
     - Stores in local database

3. **If You Miss Writing a Log**
   - The noon report still sends with position and weather data
   - Log text will just be empty

### Web Interface

Access at: `http://your-signalk-server:3000/plugins/signalk-noon-log`

**Features:**
- View current status and next noon time
- Submit daily log entries
- View last report
- Browse log history
- Reset trip log
- Export logs as JSON
- Send test emails

### Viewing History

1. Click "View History"
2. Browse past reports
3. See which reports were emailed vs. stored locally
4. Click on entries for full details

### Resetting Trip Log

To start a new voyage:
1. Click "Reset Trip Log"
2. Optionally name the new voyage
3. Distance tracking starts from zero

### Exporting Logs

1. Click "Export Logs"
2. Downloads a JSON file with all logs
3. Includes all data: position, weather, distances, log text

## Email Report Format

Each noon report email includes:

**Header:**
- Vessel name
- Date

**Captain's Log:**
- Your custom log entry

**Position:**
- Formatted coordinates (degrees/minutes)
- Decimal coordinates
- Interactive map image
- Clickable map link

**Distance:**
- Distance since last report
- Total voyage distance

**Conditions:**
- All configured weather/environmental data

## Database

The plugin uses SQLite to store all data locally:

**Location:** `~/.signalk/plugin-config-data/noon-log.db`

**Tables:**
- `log_entries` - Main log records
- `log_data` - Weather and environmental data
- `distance_log` - Distance calculations
- `voyage_info` - Voyage tracking

**Backup:** Simply copy the .db file

## Troubleshooting

### Email Not Sending

1. **Check SMTP Settings**
   - Verify server, port, username, password
   - Ensure "Enable Email" is checked
   - Ensure "Offline Mode" is unchecked

2. **Test Email**
   - Use the "Send Test Email" button
   - Check SignalK logs for errors

3. **Gmail Issues**
   - Use App Password, not regular password
   - Enable "Less secure app access" if needed

4. **Firewall**
   - Ensure SignalK server can reach SMTP server
   - Check port 587 or 465 is open

### No Position Data

1. Check SignalK is receiving GPS data
2. Verify position path in configuration
3. Check SignalK data browser for `navigation.position`

### Maps Not Showing

1. **Google Maps**
   - Verify API key is correct
   - Ensure Static Maps API is enabled
   - Check billing is set up (Google requires it)

2. **OpenStreetMap**
   - Check internet connection
   - OSM service may have rate limits

### Noon Report Not Triggering

1. Check "Next Noon Report" time in interface
2. Verify time zone setting (local vs. UTC)
3. Check SignalK server time is correct
4. Look for errors in SignalK logs

## Development

### Structure

```
signalk-noon-log/
├── plugin/
│   ├── index.js              # Main plugin file
│   └── lib/
│       ├── schema.js         # Configuration schema
│       ├── storage.js        # Database handling
│       ├── distance.js       # Distance calculations
│       ├── scheduler.js      # Noon timing
│       ├── data/
│       │   └── collector.js  # Data collection
│       ├── email/
│       │   ├── mailer.js     # Email sending
│       │   └── formatter.js  # Email formatting
│       └── websocket/
│           └── ws.js         # WebSocket server
└── public/
    ├── index.html
    ├── css/
    │   └── core.css
    └── js/
        └── main.js
```

### Dependencies

- `nodemailer` - Email sending
- `better-sqlite3` - Database
- `suncalc` - Solar noon calculation

### Testing

Enable "Test Mode" in configuration to trigger an immediate noon report after plugin starts (useful for development).

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file

## Support

- **Issues**: https://github.com/yourusername/signalk-noon-log/issues
- **SignalK Slack**: #plugin-development channel
- **Email**: your.email@example.com

## Acknowledgments

- SignalK project and community
- Based on marine logbook traditions
- Inspired by classic noon position reporting

## Changelog

### Version 1.0.0
- Initial release
- Daily noon position reports
- Email delivery
- Local storage
- Distance tracking
- Web interface
- Configurable data paths
