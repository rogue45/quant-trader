const {getAuthToken} = require("../auth/auth");
const axios = require('axios');
const CdpClientImpl = require("../CdpClientImpl");

const client = new CdpClientImpl();
client.getAccounts();