#!/usr/bin/env node

/* jshint esversion: 8 */
/* global it, xit, describe, before, after, afterEach */

'use strict';

require('chromedriver');

const execSync = require('child_process').execSync,
    expect = require('expect.js'),
    fs = require('fs'),
    path = require('path'),
    { Builder, By, Key, until } = require('selenium-webdriver'),
    { Options } = require('selenium-webdriver/chrome');

describe('Application life cycle test', function () {
    this.timeout(0);

    const LOCATION = process.env.LOCATION || 'test';
    const TEST_TIMEOUT = parseInt(process.env.TIMEOUT, 10) || 30000;
    const EXEC_ARGS = { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' };
    const username = 'admin', password = 'changeme123';

    let browser, app;

    before(function () {
        const chromeOptions = new Options().windowSize({ width: 1280, height: 1024 });
        if (process.env.CI) chromeOptions.addArguments('no-sandbox', 'disable-dev-shm-usage', 'headless');
        browser = new Builder().forBrowser('chrome').setChromeOptions(chromeOptions).build();
        if (!fs.existsSync('./screenshots')) fs.mkdirSync('./screenshots');
    });

    after(function () {
        browser.quit();
    });

    afterEach(async function () {
        if (!process.env.CI || !app) return;

        const currentUrl = await browser.getCurrentUrl();
        if (!currentUrl.includes(app.domain)) return;
        expect(this.currentTest.title).to.be.a('string');

        const screenshotData = await browser.takeScreenshot();
        fs.writeFileSync(`./screenshots/${new Date().getTime()}-${this.currentTest.title.replaceAll(' ', '_')}.png`, screenshotData, 'base64');
    });

    function getAppInfo() {
        const inspect = JSON.parse(execSync('cloudron inspect'));
        app = inspect.apps.filter(function (a) { return a.location.indexOf(LOCATION) === 0; })[0];
        expect(app).to.be.an('object');
    }

    function sleep(millis) {
        return new Promise(resolve => setTimeout(resolve, millis));
    }

    async function waitForElement(elem) {
        await browser.wait(until.elementLocated(elem), TEST_TIMEOUT);
        await browser.wait(until.elementIsVisible(browser.findElement(elem)), TEST_TIMEOUT);
    }

    async function login() {
        await browser.manage().deleteAllCookies();
        await browser.get('https://' + app.fqdn + '/login');

        await browser.sleep(2000); // takes some time for username to be visible

        await browser.wait(until.elementLocated(By.id('username')), TEST_TIMEOUT);
        await browser.findElement(By.id('username')).sendKeys(username);
        await browser.findElement(By.id('password')).sendKeys(password);
        await browser.findElement(By.id('login')).click();
        await browser.wait(until.elementLocated(By.xpath('//a[contains(text(), "Announcements")]')), TEST_TIMEOUT);
    }

    async function checkMailPlugin() {
        await browser.get('https://' + app.fqdn + '/admin/settings/email');

        await browser.sleep(2000);

        await waitForElement(By.id('email:smtpTransport:host'));
        const input = browser.findElement(By.id('email:smtpTransport:host'));
        await browser.executeScript('arguments[0].scrollIntoView(false)', input);

        const val = await input.getAttribute('value');
        if (val !== 'mail') throw new Error('Incorrect mail server value: ' + val);
    }

    async function restartForum() {
        await browser.get('https://' + app.fqdn + '/admin');

        await browser.sleep(3000);

        await waitForElement(By.xpath('//div[@id="sidebar-left"]//button[@component="restart"]'));
        await browser.findElement(By.xpath('//div[@id="sidebar-left"]//button[@component="restart"]')).click();

        await sleep(2000);

        await waitForElement(By.xpath('//button[contains(@class, "bootbox-accept") and text()="Confirm"]'));
        await browser.findElement(By.xpath('//button[contains(@class, "bootbox-accept") and text()="Confirm"]')).click();

        console.log('waiting for 10sec to restart...');
        await sleep(10000); // wait for reload

        await browser.get('https://' + app.fqdn + '/admin');
        await waitForElement(By.xpath('//div[@id="sidebar-left"]//div[text()="Dashboards"]'));
    }

    function installCustomPlugin() {
        execSync('cloudron exec --app ' + app.id + ' -- /usr/local/bin/gosu cloudron:cloudron /app/code/nodebb install --force nodebb-plugin-beep', EXEC_ARGS);
    }

    async function activateCustomPlugin() {
        await browser.get('https://' + app.fqdn + '/admin/extend/plugins#installed');

        await waitForElement(By.xpath('//ul[contains(@class, "installed")]//strong[text()="nodebb-plugin-beep"]'));

        await browser.sleep(5000);

        let button = browser.findElement(By.xpath('//div[@id="installed"]//li[@id="nodebb-plugin-beep"]//button[@data-action="toggleActive"]'));
        await browser.executeScript('arguments[0].scrollIntoView(false)', button);
        await browser.findElement(By.xpath('//div[@id="installed"]//li[@id="nodebb-plugin-beep"]//button[@data-action="toggleActive"][2]')).click(); // activate the plugin

        await browser.sleep(5000);

        button = browser.findElement(By.xpath('//button[text()="Confirm"]'));
        await browser.executeScript('arguments[0].scrollIntoView(false)', button);
        await browser.findElement(By.xpath('//button[text()="Confirm"]')).click();

        await browser.sleep(10000); // wait for the action to succeed
    }

    async function listCustomPlugin() {
        await browser.get('https://' + app.fqdn + '/admin/extend/plugins#installed');
        await waitForElement(By.xpath('//div[@id="installed"]//strong[text()="nodebb-plugin-beep"]'));
    }

    async function uploadImage() {
        await browser.get('https://' + app.fqdn + '/user/admin/edit');

        await sleep(2000);

        let button = browser.findElement(By.xpath('//a[text()="Change Picture"]'));
        await browser.executeScript('arguments[0].scrollIntoView(false)', button);
        await waitForElement(By.xpath('//a[text()="Change Picture"]'));
        await browser.findElement(By.xpath('//a[text()="Change Picture"]')).click();

        await waitForElement(By.xpath('//button[@data-action="upload"]'));
        button = browser.findElement(By.xpath('//button[@data-action="upload"]'));
        await browser.executeScript('arguments[0].scrollIntoView(false)', button);
        await browser.findElement(By.xpath('//button[@data-action="upload"]')).click();

        await sleep(2000);
        await waitForElement(By.xpath('//input[@type="file"]'));
        await browser.findElement(By.xpath('//input[@type="file"]')).sendKeys(path.resolve(__dirname, '../logo.png'));

        await sleep(5000); // upload it

        await waitForElement(By.id('fileUploadSubmitBtn'));
        await browser.findElement(By.id('fileUploadSubmitBtn')).click();

        await sleep(2000);
        await waitForElement(By.xpath('//button[text()="Crop and upload"]'));
        await browser.findElement(By.xpath('//button[text()="Crop and upload"]')).click();

        await sleep(5000);
    }

    async function checkImage() {
        await browser.get('https://' + app.fqdn + '/user/admin');

        await browser.sleep(2000);

        await waitForElement(By.xpath('//div[@component="profile/change/picture"]/img[contains(@class, "avatar")]'));
        const img = browser.findElement(By.xpath('//div[@component="profile/change/picture"]/img[contains(@class, "avatar")]'));
        const imageWidth = await browser.executeScript('return arguments[0].complete && arguments[0].naturalWidth', img);
        if (imageWidth !== 200) throw new Error('failed to load image');
    }

    xit('build app', function () { execSync('cloudron build', EXEC_ARGS); });
    it('install app', function () { execSync(`cloudron install --location ${LOCATION}`, EXEC_ARGS); });

    it('can get app information', getAppInfo);

    it('can login', login);
    it('check mail plugin', checkMailPlugin);
    it('can install custom plugin', installCustomPlugin);
    it('can restart forum', restartForum); // required before activate!
    it('can activate custom plugin', activateCustomPlugin);
    it('can list custom plugin', listCustomPlugin);
    it('restart the app', () => { execSync(`cloudron restart --app ${app.id}`, EXEC_ARGS); });
    it('can upload image', uploadImage);
    it('can check image', checkImage);

    it('backup app', function () { execSync(`cloudron backup create --app ${app.id}`, EXEC_ARGS); });

    it('restore app', function () {
        const backups = JSON.parse(execSync(`cloudron backup list --raw --app ${app.id}`));
        execSync(`cloudron uninstall --app ${app.id}`, EXEC_ARGS);
        execSync(`cloudron install --location ${LOCATION}`, EXEC_ARGS);
        getAppInfo();
        execSync(`cloudron restore --backup ${backups[0].id} --app ${app.id}`, EXEC_ARGS);
    });

    it('can login', login);
    it('can list custom plugin', listCustomPlugin);
    it('can check image', checkImage);

    it('can restart app', function () { execSync(`cloudron restart --app ${app.id}`); });

    it('can login', login);
    it('can list custom plugin', listCustomPlugin);
    it('can check image', checkImage);

    it('move to different location', function () { execSync(`cloudron configure --location ${LOCATION}2 --app ${app.id}`, EXEC_ARGS); });
    it('can get app information', getAppInfo);

    it('can login', login);
    it('can list custom plugin', listCustomPlugin);
    it('can check image', checkImage);

    it('uninstall app', function () { execSync(`cloudron uninstall --app ${app.id}`, EXEC_ARGS); });

    // test update
    it('can install app for update', function () { execSync(`cloudron install --appstore-id org.nodebb.cloudronapp --location ${LOCATION}`, EXEC_ARGS); });
    it('can get app information', getAppInfo);

    it('can login', login);
    it('check mail plugin', checkMailPlugin);
    it('can install custom plugin', installCustomPlugin);
    it('can activate custom plugin', activateCustomPlugin);
    it('restart the app', () => { execSync(`cloudron restart --app ${app.id}`, EXEC_ARGS); });
    it('can upload image', uploadImage);

    it('can update', function () { execSync(`cloudron update --app ${LOCATION}`, EXEC_ARGS); });

    it('check mail plugin', checkMailPlugin);
    it('can list custom plugin', listCustomPlugin);
    it('can check image', checkImage);
    it('uninstall app', function () { execSync(`cloudron uninstall --app ${app.id}`, EXEC_ARGS); });
});
