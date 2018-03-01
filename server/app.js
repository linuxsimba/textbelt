let express = require('express')
  , app = express()
  , _ = require('underscore')
  , carriers = require('../lib/carriers.js')
  , crypto = require('crypto')
  , exec = require('child_process').exec
  , fs = require('fs')
  , path = require('path')
  , mixpanel = require('mixpanel')
  , spawn = require('child_process').spawn
  , text = require('../lib/text');

// Express config
//app.set('views', __dirname + '/views');
//app.set('view engine', 'jade');

//app.use(express.cookieParser());
//app.use(express.static(__dirname + '/public'));
app.use(express.json());
app.use(express.urlencoded());
app.use(function(req, res, next) {
  // Enable CORS so sites can use the API directly in JS.
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Enable log messages when sending texts.
text.config({
  debugEnabled: true,
});

// Optional modules
let banned_numbers;
try {
  banned_numbers = require('./banned_numbers.js');
} catch(e) {
  banned_numbers = {BLACKLIST: {}};
}

let banned_ips = {};
try {
  let banned_list = fs.readFileSync(path.join(__dirname, './torlist')).toString('utf-8').split('\n');
  banned_list.map(function(ip) {
    ip = ip.trim();
    if (ip != '') {
      banned_ips[ip] = true;
    }
  });
  console.log(banned_list.length, 'banned ips loaded');
} catch(e) {
  console.log(e);
}


let mpq
  , mixpanel_config;
try {
  mixpanel_config = require('./mixpanel_config.js');
  mpq = new mixpanel.Client(mixpanel_config.api_key);
} catch(e) {
  mpq = {track: function() {}};
}

let access_keys = {}
let keyname = process.env.KEYNAME;
access_keys[keyname] = "-1";

// App routes
app.get('/', function(req, res) {
  fs.readFile(__dirname + '/views/index.html', 'utf8', function(err, text){
    res.send(text);
  });
});

app.get('/providers/:region', function(req, res) {
  // Utility function, just to check the providers currently loaded
  res.send(providers[req.params.region]);
});

app.post('/text', function(req, res) {
  if (req.body.getcarriers != null && (req.body.getcarriers == 1 || req.body.getcarriers.toLowerCase() == 'true')) {
    res.send({success:true, carriers:Object.keys(carriers).sort()});
    return;
  }
  let number = stripPhone(req.body.number);
  if (number.length < 9 || number.length > 10) {
    res.send({success:false, message:'Invalid phone number.'});
    return;
  }
  textRequestHandler(req, res, number, req.body.carrier, 'us', req.body.key);
});

app.post('/canada', function(req, res) {
  textRequestHandler(req, res, stripPhone(req.body.number), req.body.carrier, 'canada', req.query.key);
});

app.post('/intl', function(req, res) {
  textRequestHandler(req, res, stripPhone(req.body.number), req.body.carrier, 'intl', req.query.key);
});

// App helper functions

function textRequestHandler(req, res, number, carrier, region, key) {
  let ip = req.connection.remoteAddress;
  if (!ip || ip === '127.0.0.1') {
    ip = req.header('X-Real-IP');
  }
  if (req.header('CF-Connecting-IP')) {
    ip = req.header('CF-Connecting-IP');
  }

  if (!number || !req.body.message) {
    mpq.track('incomplete request', {ip: ip, ip2: ip});
    res.send({success:false, message:'Number and message parameters are required.'});
    return;
  }
  if (carrier != null) {
    carrier = carrier.toLowerCase();
    if (carriers[carrier] == null) {
      res.send({success:false, message:'Carrier ' + carrier + ' not supported! POST getcarriers=1 to '
                                                               + 'get a list of supported carriers'});
      return;
    }
  }

  let message = req.body.message;
  if (message.indexOf(':') > -1) {
    // Handle problem with vtext where message would not get sent properly if it
    // contains a colon.
    message = ' ' + message;
  }
  if (ip in banned_ips) {
    // Shadowban tor ips
    setTimeout(function() {
      res.send({success:false});
    }, 1000);
    return;
  }

  let shasum = crypto.createHash('sha1');
  shasum.update(number);

  let tracking_details = {
    number: number,
    message: req.body.message,
    ip: ip,
    ip2: ip
  };

  if (banned_numbers.BLACKLIST[number]) {
    mpq.track('banned number', tracking_details);
    res.send({success:false,message:'Sorry, texts to this number are disabled.'});
    return;
  }

  let doSendText = function(response_obj) {
    response_obj = response_obj || {};

    nodeEnv = process.env.NODE_ENV

    console.log(`Print Node Env status ${nodeEnv}`)

    if (nodeEnv == 'dev') {
      console.log("pin is ${message}")
      res.send(_.extend(response_obj,
            { success: true }))
      return
    }

    // Time to actually send the message
    text.send(number, message, carrier, region, function(err) {
      if (err) {
        mpq.track('sendText failed', tracking_details);
        res.send(_.extend(response_obj,
                          {
                            success:false,
                            message:'Communication with SMS gateway failed.'
                          }));
      }
      else {
        mpq.track('sendText success', tracking_details);
        res.send(_.extend(response_obj, {success:true}));
      }
    });
  };

  // Do they have a valid access key?
  if (key && key in access_keys) {
    console.log('Got valid key', key, '... not applying limits.');
    // Skip verification
    mpq.track('sendText skipping verification', _.extend(tracking_details, {
      key: key,
    }));
    doSendText({});
    return;
  }

  // If they don't have a special key, apply rate limiting and verification
  let ipkey = 'textbelt:ip:' + ip + '_' + dateStr();
  let phonekey = 'textbelt:phone:' + number;


  doSendText();
}           // end textRequestHandler

function dateStr() {
  let today = new Date();
  let dd = today.getDate();
  let mm = today.getMonth()+1;
  let yyyy = today.getFullYear();
  return mm + '/' + dd + '/' + yyyy;
}

function stripPhone(phone) {
  return (phone + '').replace(/\D/g, '');
}

// Start server
let port = process.env.PORT || 9090;
app.listen(port, function() {
  console.log('Listening on', port);
});
