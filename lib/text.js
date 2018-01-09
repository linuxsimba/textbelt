var providers = require('./providers.js'),
    carriers = require('./carriers.js'),
    spawn = require('child_process').spawn,
    StringDecoder = require('string_decoder').StringDecoder,
    config = require('./config.js');
    nodemailer = require('nodemailer')

//----------------------------------------------------------------
/*
    General purpose logging function, gated by a configurable
    value.
*/
function output() {
  if (config.debugEnabled) {
    return console.log.apply(this, arguments);
  }
}

//----------------------------------------------------------------
/*  Sends a text message

    Will perform a region lookup (for providers), then
    send a message to each.

    Params:
      phone - phone number to text
      message - message to send
      carrier - carrier to use (may be null)
      region - region to use (defaults to US)
      cb - function(err), provides err messages
*/
function sendText(phone, message, carrier, region, cb) {
  output('txting phone', phone, ':', message);

  region = region || 'us';

  var providers_list;
  if (carrier) {
    providers_list = carriers[carrier];
  } else {
    providers_list = providers[region];
  }

  var emails = providers_list.map(function(provider) {
    return provider.replace('%s', phone);
  }).join(',');

  let transporter = nodemailer.createTransport('SMTP', {
    service: 'gmail',
    auth: {
        user: config.smtpUsername,
        pass: config.smtpPassword
    }
  });
  let mailOptions = {
    from: config.fromAddress,
    to: emails,
    subject: 'forgot password',
    text: message
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        cb(true)
        console.log(error);
    }
    console.log('Message sent: %s', info.messageId)
    cb(false)
  });

}

//----------------------------------------------------------------
/*  Overrides default config

    Takes a new configuration object, which is
    used to override the defaults

    Params:
      obj - object of config properties to be overriden
*/
function setConfig(obj) {
  config = Object.assign(config, obj);
}

module.exports = {
  send:       sendText,     // Send a text message
  config:     setConfig     // Override default config
};
