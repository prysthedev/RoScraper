const request = require('request');
const fs = require('fs');
require('dotenv').config();
const groupId = parseInt(process.env.GROUP_ID);
const cookies = fs.readFileSync(process.env.COOKIES, 'utf8').split('\n');
let currentCookieIndex = 0;
let valid = 0;
let invalid = 0;
let total = 0;
let cursor = '';
const writeStream = fs.createWriteStream(process.env.OUTPUT);

const scrape = async () => {
    let url = `https://groups.roblox.com/v1/groups/${groupId}/users?limit=100&cursor=${cursor}&sortOrder=Asc`;
    const options = {
        url: url,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    const requestPromise = new Promise((resolve, reject) => {
        request(options, (err, response) => {
            if (err) {
                console.error(`Error with request: ${err}`);
                reject(err);
                return;
            }

            if (response.statusCode === 200) {
                let data = response.body;
                let obj = JSON.parse(data);
    
                let ids = obj.data.map(item => item.user.userId);
                cursor = obj.nextPageCursor;
            
                resolve(ids);
            } else {
                console.error(`Unexpected status code: ${response.statusCode}`);
                reject(`Unexpected status code: ${response.statusCode}`);
            };
        });
    });

    requestPromise
        .then(ids => {
            const promises = ids.map(id => {
                currentCookieIndex = (currentCookieIndex + 1) % cookies.length;
                const url = `https://privatemessages.roblox.com/v1/messages/${id}/can-message`;
                const options = {
                    url: url,
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'cookie': `.ROBLOSECURITY=${cookies[currentCookieIndex].trim()}`
                    }
                };
                return new Promise((resolve, reject) => {
                    request(options, (err, response) => {
                        if (err) {
                            console.error(`Error with request: ${err}`);
                            resolve();
                            return;
                        }

                        if (response && response.statusCode === 200) {
                            if (response.body[14] == 't') {
                                total++;
                                valid++;
                                writeStream.write(`${id}\n`);
                                console.log(`User passed! | Valid: ${valid} Invalid: ${invalid} Total: ${total}`);
                            } else {
                                total++;
                                invalid++;
                                console.log(`User failed! | Valid: ${valid} Invalid: ${invalid} Total: ${total}`);
                            };
                            resolve();
                        } else {
                            console.error(`Unexpected status code: ${response.statusCode}`);
                            resolve();
                        };
                    });
                });
            });
            return Promise.all(promises);
        })
        .then(() => {
            if (cursor != '') {
                scrape(cursor);
            } else {
                console.log('Completed scraping!')
            };
        })
        .catch(err => {
            console.error(`Unhandled error: ${err}`);
        });
};

scrape();