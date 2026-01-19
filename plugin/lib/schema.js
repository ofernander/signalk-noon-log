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

    useLocalTime: {
      type: 'boolean',
      title: 'Use Local Time',
      default: false
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
          default: 'Noon Report'
        }
      }
    }
  }
};