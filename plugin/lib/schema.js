module.exports = {
  type: 'object',
  required: ['noonTime'],
  properties: {
    reportInterval: {
      type: 'number',
      title: 'Report Interval (hours)',
      default: 24,
      minimum: 1,
      maximum: 168
    },

    firstReportTime: {
      type: 'string',
      title: 'First Report Time (HH:MM)',
      pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
      default: '12:00'
    },

    timezoneMode: {
      type: 'string',
      title: 'Timezone Mode',
      enum: ['gps', 'fixed'],
      enumNames: ['GPS Time', 'Fixed Timezone'],
      default: 'gps'
    },

    timezoneOffset: {
      type: 'string',
      title: 'Fixed Timezone Offset',
      enum: [
        '-12:00', '-11:00', '-10:00', '-09:00', '-08:00', '-07:00', 
        '-06:00', '-05:00', '-04:00', '-03:00', '-02:00', '-01:00',
        '+00:00', '+01:00', '+02:00', '+03:00', '+04:00', '+05:00',
        '+06:00', '+07:00', '+08:00', '+09:00', '+10:00', '+11:00',
        '+12:00', '+13:00', '+14:00'
      ],
      enumNames: [
        'UTC-12:00', 'UTC-11:00', 'UTC-10:00', 'UTC-09:00', 'UTC-08:00', 'UTC-07:00',
        'UTC-06:00', 'UTC-05:00', 'UTC-04:00', 'UTC-03:00', 'UTC-02:00', 'UTC-01:00',
        'UTC+00:00 (Zulu)', 'UTC+01:00', 'UTC+02:00', 'UTC+03:00', 'UTC+04:00', 'UTC+05:00',
        'UTC+06:00', 'UTC+07:00', 'UTC+08:00', 'UTC+09:00', 'UTC+10:00', 'UTC+11:00',
        'UTC+12:00', 'UTC+13:00', 'UTC+14:00'
      ],
      default: '+00:00'
    },

    useMetricUnits: {
      type: 'boolean',
      title: 'Use Metric Units',
      default: false
    },

    // Position data
    positionPath: {
      type: 'string',
      title: 'Position Delta Path',
      default: 'navigation.position'
    },

    // Custom data paths
    customDataPaths: {
      type: 'array',
      title: 'Additional Data Paths',
      items: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            title: 'SignalK Path'
          },
          label: {
            type: 'string',
            title: 'Display Label'
          }
        }
      },
      default: [
        { path: 'environment.wind.speedApparent', label: 'Wind Speed' },
        { path: 'environment.wind.angleApparent', label: 'Wind Direction' },
        { path: 'environment.outside.temperature', label: 'Air Temperature' },
        { path: 'environment.water.temperature', label: 'Sea Temperature' },
        { path: 'environment.outside.pressure', label: 'Barometric Pressure' }
      ]
    },

    // Email settings
    emailSettings: {
      type: 'object',
      title: 'Email Settings',
      properties: {
        enabled: {
          type: 'boolean',
          title: 'Enable Email',
          default: false
        },
        recipients: {
          type: 'string',
          title: 'Recipients (comma-separated)',
          default: ''
        },
        smtpHost: {
          type: 'string',
          title: 'SMTP Server',
          default: 'smtp.gmail.com'
        },
        smtpPort: {
          type: 'number',
          title: 'SMTP Port',
          default: 587
        },
        smtpSecure: {
          type: 'boolean',
          title: 'Use TLS',
          default: true
        },
        smtpUser: {
          type: 'string',
          title: 'SMTP Username',
          default: ''
        },
        smtpPass: {
          type: 'string',
          title: 'SMTP Password',
          default: '',
          writeOnly: true
        },
        fromEmail: {
          type: 'string',
          title: 'From Email Address',
          default: ''
        },
        subjectPrefix: {
          type: 'string',
          title: 'Email Subject Prefix',
          default: 'Log Report'
        }
      }
    }
  }
};