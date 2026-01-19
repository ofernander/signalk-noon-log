const nodemailer = require('nodemailer');
const EmailFormatter = require('./formatter');

/**
 * Handles email sending via SMTP
 */
class Mailer {
  constructor(app, options) {
    this.app = app;
    this.options = options;
    this.formatter = new EmailFormatter(app, options);
    this.transporter = null;
  }

  /**
   * Initialize SMTP transporter
   */
  init() {
    const emailConfig = this.options.emailSettings;

    if (!emailConfig || !emailConfig.enabled) {
      this.app.debug('Email not enabled');
      return false;
    }

    if (!emailConfig.smtpHost || !emailConfig.smtpUser || !emailConfig.smtpPass) {
      this.app.setPluginError('Email enabled but SMTP configuration incomplete');
      return false;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: emailConfig.smtpHost,
        port: emailConfig.smtpPort || 587,
        secure: emailConfig.smtpSecure || false, // true for 465, false for other ports
        auth: {
          user: emailConfig.smtpUser,
          pass: emailConfig.smtpPass
        },
        tls: {
          rejectUnauthorized: false // Allow self-signed certificates
        }
      });

      this.app.debug('Email transporter initialized');
      return true;
    } catch (error) {
      this.app.setPluginError(`Failed to initialize email: ${error.message}`);
      return false;
    }
  }

  /**
   * Verify SMTP connection
   */
  async verify() {
    if (!this.transporter) {
      return { success: false, error: 'Email not initialized' };
    }

    try {
      await this.transporter.verify();
      this.app.debug('SMTP connection verified');
      return { success: true };
    } catch (error) {
      this.app.setPluginError(`SMTP verification failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send noon log email
   * @param {Object} logData - Complete log data
   * @returns {Promise<Object>} Result object with success status
   */
  async sendNoonLog(logData) {
    if (!this.transporter) {
      return { 
        success: false, 
        error: 'Email not initialized' 
      };
    }

    const emailConfig = this.options.emailSettings;

    if (!emailConfig.recipients || emailConfig.recipients.trim() === '') {
      return { 
        success: false, 
        error: 'No recipients configured' 
      };
    }

    // Parse recipients
    const recipients = emailConfig.recipients
      .split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0);

    if (recipients.length === 0) {
      return { 
        success: false, 
        error: 'No valid recipients' 
      };
    }

    // Generate subject
    const vesselName = this.formatter.getVesselName();
    const subjectPrefix = emailConfig.subjectPrefix || 'Noon Report';
    const dateStr = new Date(logData.dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const subject = `${subjectPrefix} - ${dateStr} - ${vesselName}`;

    // Generate email content
    const htmlBody = this.formatter.generateEmailHTML(logData);
    const textBody = this.formatter.generateEmailText(logData);

    // Prepare email
    const mailOptions = {
      from: emailConfig.fromEmail || emailConfig.smtpUser,
      bcc: recipients, // Use BCC for privacy
      subject: subject,
      text: textBody,
      html: htmlBody
    };

    try {
      this.app.debug(`Sending noon log email to: ${recipients.join(', ')}`);
      const info = await this.transporter.sendMail(mailOptions);
      this.app.debug(`Email sent successfully: ${info.messageId}`);
      
      return {
        success: true,
        messageId: info.messageId,
        recipients: recipients
      };
    } catch (error) {
      this.app.setPluginError(`Failed to send email: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send test email
   */
  async sendTestEmail() {
    const testData = {
      dateStr: new Date().toISOString().split('T')[0],
      position: {
        latitude: 37.7749,
        longitude: -122.4194
      },
      logText: 'This is a test noon log entry from the SignalK Noon Log plugin.',
      customData: [
        { label: 'Wind Speed', value: '12.5', unit: 'knots' },
        { label: 'Air Temperature', value: '22.3', unit: '°C' },
        { label: 'Sea Temperature', value: '18.7', unit: '°C' },
        { label: 'Barometric Pressure', value: '1013.2', unit: 'hPa' }
      ],
      distance: {
        distanceSinceLast: 45.3,
        totalDistance: 234.7
      }
    };

    return await this.sendNoonLog(testData);
  }

  /**
   * Close the transporter
   */
  close() {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
      this.app.debug('Email transporter closed');
    }
  }
}

module.exports = Mailer;