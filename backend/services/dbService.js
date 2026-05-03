const fs = require('fs');
const path = require('path');

const credsPath = path.join(__dirname, '../firebase-credentials.json');

if (fs.existsSync(credsPath)) {
    console.log('Using Firebase Admin for database operations.');
    module.exports = require('./firebaseService');
} else {
    console.log('Using SQLite for database operations. (Add firebase-credentials.json to switch to Firebase)');
    module.exports = require('./sqliteService');
}
