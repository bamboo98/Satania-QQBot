const fs = require('fs');
const PixivAppApi = require('pixiv-app-api');
const util = require('util');
require('colors');

// 获得参数
const argName = process.argv[2] || 'all';
const argYear = parseInt(process.argv[3]) || 10;
const argMonth = parseInt(process.argv[4]) || 0;
const argDate = parseInt(process.argv[5]) || 0;

const secret = JSON.parse(fs.readFileSync('./secret.json', 'utf8'));

let pixivUserName = secret.PixivUserName2;

let pixiv = new PixivAppApi(secret.PixivUserName2, secret.PixivPassword, {
    camelcaseKeys: true
});

const knex = require('knex')({
    client: 'mysql2',
    connection: {
        host: secret.mysqlHost,
        user: secret.mysqlUser,
        password: secret.mysqlPassword,
        database: secret.mysqlDatabase
    }
});

async function initDatabase() {
    if (!(await knex.schema.hasTable('illusts'))) {
        await knex.schema.createTable('illusts', table => {
            table.integer('id').unsigned().primary();
        });
    }
    if (!(await knex.schema.hasTable('recovery_work'))) {
        await knex.schema.createTable('recovery_work', table => {
            table.string('name').primary();
        });
    }

    if (!(await knex.schema.hasColumn('illusts', 'title'))) {
        await knex.schema.table('illusts', table => {
            table.string('title');
        });
    }
    if (!(await knex.schema.hasColumn('illusts', 'image_url'))) {
        await knex.schema.table('illusts', table => {
            table.string('image_url', 2048);
        });
    }
    if (!(await knex.schema.hasColumn('illusts', 'user_id'))) {
        await knex.schema.table('illusts', table => {
            table.integer('user_id').unsigned();
        });
    }
    if (!(await knex.schema.hasColumn('illusts', 'tags'))) {
        await knex.schema.table('illusts', table => {
            table.string('tags');
        });
    }
    if (!(await knex.schema.hasColumn('illusts', 'create_date'))) {
        await knex.schema.table('illusts', table => {
            table.dateTime('create_date');
        });
    }
    if (!(await knex.schema.hasColumn('illusts', 'width'))) {
        await knex.schema.table('illusts', table => {
            table.integer('width').unsigned();
        });
    }
    if (!(await knex.schema.hasColumn('illusts', 'height'))) {
        await knex.schema.table('illusts', table => {
            table.integer('height').unsigned();
        });
    }
    if (!(await knex.schema.hasColumn('illusts', 'total_view'))) {
        await knex.schema.table('illusts', table => {
            table.integer('total_view').unsigned();
        });
    }
    if (!(await knex.schema.hasColumn('illusts', 'total_bookmarks'))) {
        await knex.schema.table('illusts', table => {
            table.integer('total_bookmarks').unsigned();
        });
    }
    if (!(await knex.schema.hasColumn('recovery_work', 'tag'))) {
        await knex.schema.table('recovery_work', table => {
            table.string('tag');
        });
    }
    if (!(await knex.schema.hasColumn('recovery_work', 'year'))) {
        await knex.schema.table('recovery_work', table => {
            table.integer('year').unsigned();
        });
    }
    if (!(await knex.schema.hasColumn('recovery_work', 'month'))) {
        await knex.schema.table('recovery_work', table => {
            table.integer('month').unsigned();
        });
    }
    if (!(await knex.schema.hasColumn('recovery_work', 'date'))) {
        await knex.schema.table('recovery_work', table => {
            table.integer('date').unsigned();
        });
    }

    console.log('\nDatabase init finished'.green.bold);
}

(async function () {
    await initDatabase();

    const tagList = [];
    tagList.push('足');
    tagList.push('束');
    tagList.push('縛');
    tagList.push('黒スト');
    tagList.push('白スト');
    tagList.push('丝袜');
    tagList.push('タイツ');
    tagList.push('ストッキング');
    tagList.push('着');
    tagList.push('乳');
    tagList.push('おっぱい');
    tagList.push('魅惑');
    tagList.push('尻');
    tagList.push('ぱんつ');
    tagList.push('パンツ');
    tagList.push('パンチラ');
    tagList.push('ロリ');
    tagList.push('幼女');
    tagList.push('獣耳');
    tagList.push('男の娘');
    tagList.push('ちんちんの付いた美少女');

    // 恢复作业
    let recoveryWork = (await knex('recovery_work').where('name', argName))[0];

    await pixiv.login();
    // 长期作业
    const pixivLoginTimer = setInterval(async () => {
        await pixiv.login();
    }, 3600000);

    let count = 0;
    let dayCount = 0;
    const counterTimer = setInterval(() => {
        console.log(util.format('Total count:', count).magenta);
    }, 10000);

    const curDate = new Date();
    const targetDate = new Date(curDate);
    targetDate.setFullYear(targetDate.getFullYear() - argYear);
    targetDate.setMonth(targetDate.getMonth() - argMonth);
    targetDate.setDate(targetDate.getDate() - argDate);

    for (const tag of tagList) {
        let year;
        let month;
        let date;

        if (recoveryWork) {
            if (tag != recoveryWork.tag) continue;
            year = recoveryWork.year
            month = recoveryWork.month
            date = recoveryWork.date
            recoveryWork = null;
        } else {
            year = curDate.getFullYear();
            month = curDate.getMonth() + 1;
            date = curDate.getDate();
        }

        let outOfRange = false;
        let isDateDesc = true;
        for (; year > 0; year--) {
            if (outOfRange) break;

            for (; month > 0; month--) {
                if (outOfRange) break;

                if (date == 0) {
                    const specifiedDate = new Date(year, month, 0);
                    date = specifiedDate.getDate();
                }

                for (; date > 0; date--) {
                    if (new Date(year, month - 1, date) - targetDate < 0) {
                        outOfRange = true;
                        break;
                    }

                    dayCount = 0;

                    // 记录当前作业
                    await recordWork(tag, year, month, date);

                    console.log(util.format(`${year}-${month}-${date}`, tag).green);

                    let illusts;
                    try {
                        illusts = (await pixiv.searchIllust(tag, {
                            sort: isDateDesc ? 'date_desc' : 'date_asc',
                            startDate: `${year}-${month}-${date}`,
                            endDate: `${year}-${month}-${date}`
                        })).illusts;
                    } catch {
                        console.log('Network failed'.red.bold);
                        if (pixivUserName == secret.PixivUserName2) {
                            pixivUserName = secret.PixivUserName3;
                            pixiv = new PixivAppApi(secret.PixivUserName3, secret.PixivPassword2, {
                                camelcaseKeys: true
                            });
                        } else {
                            pixivUserName = secret.PixivUserName2;
                            pixiv = new PixivAppApi(secret.PixivUserName2, secret.PixivPassword, {
                                camelcaseKeys: true
                            });
                        }
                        await pixiv.login();
                        date++;
                        continue;
                    }

                    for (const illust of illusts) {
                        testIllust(illust);
                        count++;
                        dayCount++
                    }

                    while (pixiv.hasNext()) {
                        illusts = null;

                        try {
                            illusts = (await pixiv.next()).illusts;
                        } catch {
                            console.log(util.format('Day count:', dayCount).magenta.bold);
                            if (dayCount > 5000) {
                                console.error('Exceed the limit'.red.bold);
                                // 用升序再试一遍，这样单天至少能刷到1w张
                                if (isDateDesc) {
                                    isDateDesc = false;
                                    date++;
                                    break;
                                } else {
                                    isDateDesc = true;
                                    break;
                                }
                            }
                            console.log('Network failed'.red.bold);
                            if (pixivUserName == secret.PixivUserName2) {
                                pixivUserName = secret.PixivUserName3;
                                pixiv = new PixivAppApi(secret.PixivUserName3, secret.PixivPassword2, {
                                    camelcaseKeys: true
                                });
                            } else {
                                pixivUserName = secret.PixivUserName2;
                                pixiv = new PixivAppApi(secret.PixivUserName2, secret.PixivPassword, {
                                    camelcaseKeys: true
                                });
                            }
                            await pixiv.login();
                            date++;
                            break;
                        }

                        for (const illust of illusts) {
                            testIllust(illust);
                            count++;
                            dayCount++;
                        }
                    }
                }
            }
            month = 12;
        }
    }

    clearInterval(pixivLoginTimer);
    clearInterval(counterTimer);
})();

function testIllust(illust) {
    // 只要插画
    if (illust.type != 'illust') return;

    let tags = '';
    for (const tag of illust.tags) {
        tags += tags ? (',' + tag.name) : tag.name;
    }
    illust.tags = tags;
    if (/r-18/i.test(illust.tags)) return;

    // 不要小于1000收藏
    if (illust.totalBookmarks < 1000) return;

    setIllust(illust);
}

async function setIllust(illust) {
    const data = {
        title: illust.title,
        image_url: illust.imageUrls.large.match(/^http.*?\.net|img-master.*$/g).join('/'),
        user_id: illust.user.id,
        tags: illust.tags,
        create_date: illust.createDate,
        width: illust.width,
        height: illust.height,
        total_view: illust.totalView,
        total_bookmarks: illust.totalBookmarks
    }
    if ((await knex('illusts').where('id', illust.id))[0]) {
        await knex('illusts').where('id', illust.id).update(data);
        console.log('update=>', illust.id, illust.title);
    } else {
        await knex('illusts').insert({
            id: illust.id,
            ...data
        });
        console.log(util.format('set=>', illust.id, illust.title).bold);
    }
}

async function recordWork(tag, year, month, date) {
    const data = {
        tag,
        year,
        month,
        date
    }
    if ((await knex('recovery_work').where('name', argName))[0]) {
        await knex('recovery_work').update(data);
    } else {
        await knex('recovery_work').insert({
            name: argName,
            ...data
        });
    }
}