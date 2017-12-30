// change this in the docker container build
module.exports = {
  fromAddress:  process.env.FROM_ADDRESS,
  debugEnabled: false,
  smtpUsername: process.env.SMTPUSER,
  smtpPassword: process.env.SMTPPASS
};
