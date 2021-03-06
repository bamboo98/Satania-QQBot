const fs = require('fs');
const PixivAppApi = require('pixiv-app-api');
const _ = require('lodash');
require('colors');
const EventEmitter = require('events');

const secret = JSON.parse(fs.readFileSync('../secret.json', 'utf8'));

const pixivClients = [];
for (const account of secret.PixivAPIAccounts) {
    const pixiv = new PixivAppApi(account.userName, account.password, {
        camelcaseKeys: true
    });
    pixiv.rStatus = true;
    pixiv.rEvent = new EventEmitter();
    pixivClients.push(pixiv);
}

let curPixivClient = pixivClients[0];

const knex = require('knex')({
    client: 'mysql2',
    connection: {
        host: secret.mysqlHost,
        port: secret.mysqlPort,
        user: secret.mysqlUser,
        password: secret.mysqlPassword,
        database: secret.mysqlDatabase
    }
});

const requests = [];
const requestEvent = new EventEmitter();

const index = _.isUndefined(process.argv[2]) ? 0 : parseInt(process.argv[2]) - 1;

(async function () {
    for (const pixivClient of pixivClients) {
        await pixivClient.login();
    }
    const pixivLoginTimer = setInterval(async () => {
        for (const pixivClient of pixivClients) {
            await pixivClient.login();
        }
    }, 3600000);

    const illusts = await knex('illusts');
    for (let i = index; i < illusts.length; i++) {
        const illust = illusts[i];

        getIllust(curPixivClient, illust, {
            index: i,
            length: illusts.length
        });

        await new Promise(resolve => {
            if (requests.length < 5) {
                resolve();
                return;
            }
            requestEvent.on('finish', onFinish);

            function onFinish() {
                requestEvent.off('finish', onFinish);
                resolve();
            }
        });
    }

    await new Promise(resolve => {
        if (requests.length == 0) {
            resolve();
            return;
        }
        requestEvent.on('finish', onFinish);

        function onFinish() {
            if (requests.length == 0) {
                requestEvent.off('finish', onFinish);
                resolve();
            }
        }
    });

    clearInterval(pixivLoginTimer);
    process.exit();
})();

async function getIllust(pixiv, illust, progress) {
    requests.push(progress.i);

    let detail;
    try {
        if (!pixiv.rStatus) throw 'Pixiv client no recovery';
        detail = (await pixiv.illustDetail(illust.id)).illust;
    } catch (error) {
        if (error.response && error.response.status == 404) {
            console.log(`[${progress.index+1}/${progress.length}]`.green, illust.id, 'Illust has been deleted'.red.bold);
            await knex('illusts').where('id', illust.id).delete();
            requests.splice(progress.i, 1);
            requestEvent.emit('finish');
            return;
        }

        if (pixiv.rStatus) {
            pixiv.rStatus = false;
            setTimeout(() => {
                pixiv.rStatus = true;
                pixiv.rEvent.emit('recovery', pixiv);
            }, 300000);
        }

        let accountStatus = '';
        for (const pixivClient of pixivClients) {
            if (pixivClient.rStatus) accountStatus += '[' + 'a'.green + ']';
            else accountStatus += '[' + 'd'.red.bold + ']';
        }
        console.log('Network failed'.red.bold, accountStatus);

        let isFound = false;
        for (const pixivClient of pixivClients) {
            if (pixivClient.rStatus) {
                curPixivClient = pixivClient;
                isFound = true;
                break;
            }
        }
        if (!isFound) {
            await new Promise(resolve => {
                for (const pixivClient of pixivClients) {
                    pixivClient.rEvent.on('recovery', onRecovery);
                }

                function onRecovery(client) {
                    for (const pixivClient of pixivClients) {
                        pixivClient.rEvent.off('recovery', onRecovery);
                    }
                    curPixivClient = client;
                    resolve();
                }
            });
        }

        await curPixivClient.login();
        requests.splice(progress.i, 1);
        return getIllust(curPixivClient, illust, progress);
    }

    let rating = '';
    if (!_.isEmpty(detail)) {
        switch (detail.xRestrict) {
            case 0:
                rating = 'safe';
                break
            case 1:
                rating = 'r18';
                break;
            case 2:
                rating = 'r18g';
                break;
            default:
                rating = 'unknow:' + detail.xRestrict;
                break;
        }
    }

    let tags = '';
    for (const tag of detail.tags) {
        tags += tags ? (',' + tag.name) : tag.name;
    }

    await knex('illusts').where('id', illust.id).update({
        title: detail.title,
        image_url: detail.imageUrls.large.match(/^http.*?\.net|img-master.*$/g).join('/'),
        user_id: detail.user.id,
        rating,
        tags,
        create_date: detail.createDate,
        page_count: detail.pageCount,
        width: detail.width,
        height: detail.height,
        total_view: detail.totalView,
        total_bookmarks: detail.totalBookmarks
    });

    console.log(`[${progress.index+1}/${progress.length}]`.green, illust.id, detail.title, rating.bold);

    requests.splice(progress.i, 1);
    requestEvent.emit('finish');
}