const csv = require("csv-parser");
const fs = require("fs");
const axios = require("axios");
// var wd = require("word-definition");
var WordPOS = require("wordpos"),
  wordpos = new WordPOS();

const ObjectsToCsv = require("objects-to-csv");

var DomParser = require("dom-parser");

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const AdblockerPlugin = require("puppeteer-extra-plugin-adblocker");
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

var parser = new DomParser();
function sleep(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  });
}
function isNoun(word) {
  return new Promise((resolve, reject) => {
    try {
      wordpos.isNoun(word, (result) => {
        resolve(result);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function normalize_to_blocks(text) {
  const lText = text.toLowerCase();
  return lText.match(/[a-z]+/g);
}

async function getNounBlocks(text) {
  const blocks = normalize_to_blocks(text);
  const rnBlocks = [];
  const pResults = await Promise.all(blocks.map((block) => isNoun(block)));
  const result = [];
  let recentIndex = 0;
  for (let i = 0; i < pResults.length; i++) {
    const result = pResults[i];
    const pResult = pResults[i - 1];
    if (result) {
      (pResult && (rnBlocks[rnBlocks.length - 1] += " " + blocks[i])) ||
        rnBlocks.push(blocks[i]);
    }
  }

  console.log(rnBlocks);
  return rnBlocks;
}
const text = `horse watercolor`;

async function run() {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    slowMo: 0,
    args: [
      "--window-size=1400,900",
      "--remote-debugging-port=9222",
      "--remote-debugging-address=0.0.0.0", // You know what your doing?
      "--disable-gpu",
      "--disable-features=IsolateOrigins,site-per-process",
      "--blink-settings=imagesEnabled=true",
    ],
  });

  async function getAttrs(elems, attr) {
    const results = [];
    for (let i = 0; i < elems.length; i++) {
      results.push(await (await elems[i].getProperty(attr)).jsonValue());
    }
    return results;
  }
  async function getTags(href) {
    await page.goto(href);
    await sleep(1000);
    const tagSelector = ".m-design__additional-info-container a";
    await page.waitForSelector(tagSelector);
    const tElems = await page.$$(tagSelector);
    return await getAttrs(tElems, "innerText");
  }
  const page = await browser.newPage();
  async function getTagsByNoun(noun) {
    await page.goto(
      "https://www.teepublic.com/t-shirts?query=" +
        noun.trim().replace(/\s+/g, "-")
    );
    await page.waitForSelector("a[class*='m-tiles__preview']");
    const tElems = await page.$$("a[class*='m-tiles__preview']");
    const top5Elems = tElems.length > 0 && tElems.slice(0, 5);
    const hrefs = await getAttrs(top5Elems, "href");
    const result = [];
    for (let i = 0; i < hrefs.length; i++) {
      result.push([...new Set(await getTags(hrefs[i]))]);
    }
    return result;
  }

  async function getTagsByTitle(title) {
    const result = {};
    const nouns = await getNounBlocks(title);
    for (let i = 0; i < nouns.length; i++) {
      const noun = nouns[i];
      result[noun] = await getTagsByNoun(noun);
    }
    return result;
  }
  function standardize(object) {
    const result = new Array(5);
    for (let i = 0; i < result.length; i++) {
      result[i] = [];
    }
    console.log(object);
    for (let key in object) {
      const tagsArr = object[key];
      tagsArr.forEach((item, index) => {
        result[index].push(...item);
      });
    }
    return result;
  }
  const results = [];
  //{title, nouns, p1, p2, p3,p4,p5, all}
  const output = [];
  fs.createReadStream("data.csv")
    .pipe(csv())
    .on("data", (data) => results.push(data))
    .on("end", async () => {
      for (let i = 0; i < results.length; i++) {
        try {
          const title = results[i].Title;
          console.log("Processing title... ", title);
          const tagsObject = await getTagsByTitle(title);
          const sTagsObject = standardize(tagsObject);
          const outputItem = {
            title,
            nouns: Object.keys(tagsObject).join(","),
          };
          console.log(sTagsObject);
          sTagsObject.forEach((object, index) => {
            outputItem["p" + index] = object.join(",");
          });
          outputItem["all"] = [
            ...new Set(sTagsObject.toString().split(",")),
          ].join(",");
          output.push(outputItem);
        } catch (err) {
          console.log(err);
        }
      }
      const csv = new ObjectsToCsv(output);
      await csv.toDisk("./output.csv");
      console.log("Done...");
    });
}

run();
