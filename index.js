const request = require('request');
const fs = require('fs');
require('dotenv').config();
const cookies = fs.readFileSync(process.env.COOKIES, 'utf8').split('\n');
const keyword = process.env.KEYWORD
let currentCookieIndex = 0;
let valid = 0;
let invalid = 0;
let total = 0;
let ids = '';
let groups = '';
let cursor2 = '';
const writeStream = fs.createWriteStream(process.env.OUTPUT);
let proxyIndex = 0;
const proxies = fs.readFileSync(process.env.PROXIES, 'utf-8').trim().split('\n');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}  

function getNextProxy() {
    const proxy = proxies[proxyIndex];
    proxyIndex = (proxyIndex + 1) % proxies.length;
    return proxy;
};

const scrapeGroups = async () => {
    let url = `https://groups.roblox.com/v1/groups/search?keyword=${keyword}&prioritizeExactMatch=false&limit=100&cursor=${cursor2}`;
    const options = {
        url: url,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    };
    const requestPromise = new Promise((resolve, reject) => {
        request(options, (err, response) => {
            if (response.statusCode == 200) {
                let data = response.body;
                let obj = JSON.parse(data);
                groups = obj.data.map(item => item.id);
                cursor2 = obj.nextPageCursor;
                resolve(groups);
            };
        });
    });
    requestPromise
    .then(groups => {
        for (let i = 0; i < groups.length; i++) {
            scrape(groups[i], '');
        }
    })
    .catch(err => {
        console.log(err);
        scrapeGroups();
    });
};

const scrape = async (groupId, cursor) => {
    let proxy = getNextProxy();
    let url = `https://groups.roblox.com/v1/groups/${groupId}/users?limit=10&cursor=${cursor}&sortOrder=Asc`;
    const options = {
        url: url,
        method: 'GET',
        proxy: `http://${proxy}`,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    const requestPromise = new Promise((resolve, reject) => {
        request(options, (err, response) => {
            if (err) {
                console.log(`Error with request: ${err}`);
                reject(err);
                return;
            }

            if (response.statusCode === 200) {
                let data = response.body;
                let obj = JSON.parse(data);

                if (!obj.nextPageCursor) {
                    reject('Scraped all users!');
                } else {
                    cursor = obj.nextPageCursor;
                };
    
                if (obj.data.map(item => item.user.userId)) {
                    ids = obj.data.map(item => item.user.userId);
                } else {
                    resolve();
                    scrape(groupId, cursor);
                };

            
                resolve(ids);
            } else {
                console.log(`Unexpected status code: ${response.statusCode}`);
                resolve();
                scrape(groupId, cursor);
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
                        } else if (response.statusCode == 429) {
                            console.log('Rate limit exceeded!');
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
                scrape(groupId, cursor);
            } else {
                console.log('Completed scraping!')
                scrapeGroups();
            };
        })
        .catch(err => {
            console.error(`Unhandled error: ${err}`);
        });
};

scrapeGroups();