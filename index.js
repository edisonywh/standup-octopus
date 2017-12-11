const config = require("config");
const moment = require("moment");
const SlackBot = require("slackbots");
const sprintf = require("sprintf-js").sprintf;

// read a message from the user, and return the text
function readMessage(bot, user, timeout = 3600) {
  return new Promise(function promise(resolve, reject) {
    bot.on("message", async function message(data) {
      if (data && data.type === "message" && data.user === user.id) {
        bot.removeListener("message", message);
        resolve(data.text);
      }
      await sleep(timeout);
      bot.removeListener("message", message);
      reject();
    });
  });
}

// ask the standup questions
async function standUp(bot, user, timeout) {
  var iconEmoji = config.has("bot.emoji")
    ? config.get("bot.emoji")
    : ":octopus:";
  var botChannel = config.has("bot.channel")
    ? config.get("bot.channel")
    : "general";

  var params = { icon_emoji: iconEmoji };
  try {
    var yesterdayQuestion =
      "What did you do yesterday? :slightly_smiling_face:";
    await bot.postMessageToUser(user.name, yesterdayQuestion, params);

    var yesterday = await readMessage(bot, user, timeout);

    var todayQuestion = "What do you intend to do today? :heavy_check_mark:";
    await bot.postMessageToUser(user.name, todayQuestion, params);
    var today = await readMessage(bot, user, timeout);

    var impedimentsQuestion = "Are you facing any problems? :question:";
    await bot.postMessageToUser(user.name, impedimentsQuestion, params);
    var impediments = await readMessage(bot, user, timeout);

    var doneText = "Thanks for the standup today! Go and rock the world! :zap:";
    await bot.postMessageToUser(user.name, doneText, params);

    var now = moment();
    var date = now.toDate();
    var statusDate = new Date(now.format("YYYY-MM-DDTHH:mm:ssZ"));

    var standupText = `:new_moon_with_face: *${
      user.name
    }* posted a status update for \`${statusDate}\`:
*${yesterdayQuestion}*
> ${yesterday}
*${todayQuestion}*
> ${today}
*${impedimentsQuestion}*
> ${impediments}`;

    await bot.postMessageToChannel(botChannel, standupText, params);
    return true;
  } catch (e) {
    bot.postMessageToUser(
      user.name,
      "Today's standup has been cancelled due to inactivity",
      params
    );
    bot.postMessageToChannel(
      botChannel,
      `:new_moon_with_face: *${user.name}* missed today's standup`,
      params
    );
  }
}

// sleep for 10 seconds
async function sleep(seconds) {
  return new Promise(function promise(resolve, reject) {
    setTimeout(function() {
      resolve();
    }, seconds * 1000);
  });
}

function main() {
  // create our bot
  if (!config.has("token")) {
    console.error(`Fatal Error:
'bot.token' needs to be set in your configuration file!
For details on how to obtain a Slack token, see

http://steve.tjaart.org/docs/slack_setup/
`);
    process.exit(1);
  }
  var token = config.get("token");

  if (!config.has("users")) {
    console.error(`Fatal Error:
'users' needs to be set in your configuration file!`);
    process.exit(1);
  }
  var userNames = config.get("users");

  // Array of days of the week to have a standup. Default: Mo-Fr
  var standupDays = config.has("standup.days")
    ? config.get("standup.days")
    : [1, 2, 3, 4, 5];
  // Standup time. Default 09:00
  var standupTime = config.has("standup.time")
    ? config.get("standup.time")
    : "09:00";
  // Bot name Default 'Standup Steve'
  var botName = config.has("bot.name")
    ? config.get("bot.name")
    : "Standup Octopus";
  // Debug
  var debug = config.has("debug") ? config.get("debug") : false;
  var timeoutValue = config.has("standup.timeout")
    ? config.get("standup.timeout")
    : 7200;
  var timeout = debug ? 60 : timeoutValue;
  // Log
  var log = config.has("log") ? config.get("log") : false;

  var bot = new SlackBot({ token: token, name: botName });

  // once the bot is started, we are ready to roll
  bot.on("start", async function() {
    // Array of user taking part in the standup
    var users = [];
    for (var i in userNames) {
      var user = await bot.getUser(userNames[i]);
      users.push(user);
    }

    // Have we stood up today?
    var stoodup = false;
    // Should we stand up yet?
    var standup = false;
    // Debug counter
    var counter = 10;
    var standupDate;
    // lets keep our bot going to inifinity
    while (true) {
      // Its a new day, reset stoodup
      if (log) {
        console.log(`now            ${now}
standup        ${standup}
stoodup        ${stoodup}
----------------------`);
      }

      var now = moment();

      if (!debug) {
        var standupTimeString = standupTime.split(":");
        var standupDate = moment({
          hour: standupTimeString[0],
          minute: standupTimeString[1]
        });
        // Its the right day, and time. Its time for a standup standup!
        if (standupDays.indexOf(now.day()) >= 0 && now >= standupDate) {
          standup = true;
        } else {
          standup = false;
        }
      } else {
        // in debug mode we are always ready for a standup
        standup = true;
      }

      // Its time for a standup, and we have not had one today
      if (standup && !stoodup) {
        for (var i in users) {
          standUp(bot, users[i], timeout);
        }
        stoodup = true;
      }

      // In debug mode, we are ready for another standup when counter == 0
      counter = counter > 0 ? counter - 1 : 10;
      if (debug) {
        if (counter == 0) {
          stoodup = false;
        }
      } else {
        // its a new day! reset stood up
        if (now < standupDate) {
          stoodup = false;
        }
      }

      // wait a few seconds, then check again
      await sleep(10);
    }
  });
}

main();
