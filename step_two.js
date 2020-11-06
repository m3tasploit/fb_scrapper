const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker')
puppeteer.use(AdblockerPlugin({ blockTrackers: true }))
puppeteer.use(require('puppeteer-extra-plugin-anonymize-ua')())
const blessed = require('blessed')
const fs = require('fs')

const { CHECK_INS, FB_URL, FB_EMAIL, FB_PASS, HEADLESS_MODE } = require('./config')
const { scrollPage, delay, storeData, getRandomArbitrary, shuffle } = require('./utils')


//flag for stopping fetch
let fetchFlag = true
let scrollingStarted = false
let scrapeStart = false
let browser

//last cursor
let cursor = 0

//notify rate limit
let rate_limit = 0
let reactMode = true

//first step data json
let first_step_json = []
let final_output = []

//setup cli ui
const screen = blessed.screen(),
  body = blessed.box({
    top: 3,
    left: 0,
    width: '100%',
    height: '99%'
  }),
  statusbar = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    style: {
      fg: 'white',
      bg: 'blue'
    }
  })

screen.append(statusbar)
screen.append(body)

screen.onceKey(['escape', 'q'], function (ch, key) {
  fetchFlag = false
})

screen.onceKey(['s'], function (ch, key) {
  scrapeStart = true
})

screen.key(['C-c'], function (ch, key) {
  fetchFlag = false
  saveData()
  return process.exit(0)
})

function status(text) { statusbar.setContent(text); screen.render(); }
function log(text) { body.insertLine(0, text); screen.render(); }
const statusText = 'Press q or esc to stop fetching : Ctrl - C to exit the program'
status(statusText)

const fetchAuthorPersonalData = async (context, posts, page) => {
  const aboutSections = {
    overview: 'about_overview',
    work_education: 'about_work_and_education',
    places_lived: 'about_places',
    contact_basic_info: 'about_contact_and_basic_info',
    family_relationships: 'about_family_and_relationships',
    details: 'about_details',
    life_events: 'about_life_events'
  }
  const checkInSection = 'places_recent'

  //a function inside a function for fetching about fields
  const fetchAboutData = async (absolute_profile_url) => {
    let data = {}
    let keys = Object.keys(aboutSections)
    shuffle(keys)
    for (let prop of keys) {
      try {
        await page.goto(`${absolute_profile_url}/${aboutSections[prop]}`)
        if (reactMode) {
          await page.waitForSelector('div[data-pagelet="page"]', { timeout: 1000 * 60 })
        } else {
          await page.waitForSelector('div[id^="pagelet_timeline_app_collection"]', { timeout: 1000 * 60 })
        }
        await delay(getRandomArbitrary(1, 3) * 1000)
        const returned_data = await page.evaluate((reactMode) => {
          if (reactMode) {
            return document.querySelector('div[data-pagelet="page"]')
              .children[0].children[0].children[0]
              .children[3].children[0].children[0]
              .children[0].children[0].children[0]
              .children[0].children[0].children[1]
              .innerText.split('\n')
          } else {
            return document.querySelector('div[id^="pagelet_timeline_app_collection"]')
              .children[0].children[1].children[0]
              .children[1].innerText.split('\n')
          }
        }, reactMode)
        data[prop] = returned_data
      } catch (error) {
        // console.log(error)
      }
      await delay(getRandomArbitrary(2, 6) * 1000)
    }
    return data
  }

  const fetchFullMessage = async (post_url) => {
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.102 Safari/537.36')
    try {
      await delay(getRandomArbitrary(1, 3) * 1000)
      await page.goto(post_url)
      await page.waitForSelector('.story_body_container', { timeout: 1000 * 15 })
      const returned_data = await page.evaluate(() => {
        return document.querySelector('.story_body_container').children[1].innerText
      })
      await delay(getRandomArbitrary(1, 2) * 1000)
      return returned_data
    } catch (error) {

    }
  }

  const fetchCheckIns = async (absolute_profile_url) => {
    if (!CHECK_INS)
      return undefined
    try {
      await page.goto(`${absolute_profile_url}/${checkInSection}`)
      if (reactMode) {
        await page.waitForSelector('div[data-pagelet="page"]', { timeout: 1000 * 15 })
      } else {
        await page.waitForSelector('div[id^="pagelet_timeline_app_collection"]', { timeout: 1000 * 15 })
      }
      await delay(getRandomArbitrary(1, 3) * 1000)
      await scrollPage(page, 1)
      const check_ins = await page.evaluate((reactMode) => {
        if (reactMode) {
          return [...document.querySelector('div[data-pagelet="page"]')
            .children[0].children[0].children[0].children[3]
            .children[0].children[0].children[0].children[0]
            .children[0].children[0].children[0].children[2]
            .children].map(elt => elt.innerText)
            .filter(elt => elt === '' ? false : true)
        } else {
          return [...document.querySelector('div[id^="pagelet_timeline_app_collection"]')
            .children[0].children].map(elt => elt.innerText)
            .filter(elt => elt === '' ? false : true)
        }
      }, reactMode)
      return check_ins
    } catch (error) {
      // console.log(error)
    }
  }

  const findPreviousUserData = async (profile_url) => {
    let data = null
    for (let elt of final_output) {
      if (elt.profile_url) {
        if (elt.profile_url === profile_url) {
          data = elt
          break
        }
      }
    }
    if (data) {
      let { overview, work_education, places_lived, contact_basic_info, family_relationships, details, life_events, places_recent } = data
      return {
        about: {
          overview,
          work_education,
          places_lived,
          contact_basic_info,
          family_relationships,
          details,
          life_events
        },
        places_recent
      }
    } else
      return false
  }

  let fnArray = [fetchAboutData, fetchCheckIns, fetchFullMessage]

  for (let i = cursor; i < posts.length; i++) {
    shuffle(fnArray)
    cursor = i
    status(`${statusText}\nNo of posts processed : ${final_output.length}`)
    await delay(getRandomArbitrary(5, 15) * 1000)
    try {
      const prevData = await findPreviousUserData(posts[i].profile_url)
      let about_data, check_ins, message
      if (posts[i].profile_url) {
        if (!posts[i].profile_url.includes('profile.php'))
          if (prevData) {
            message = await fetchFullMessage(posts[i].post_url)
            about_data = prevData.about
            check_ins = prevData.places_recent
          } else {
            for (let fn of fnArray) {
              if (fn.name === 'fetchAboutData')
                about_data = await fn(posts[i].profile_url)
              if (fn.name === 'fetchCheckIns')
                check_ins = await fn(posts[i].profile_url)
              if (fn.name === 'fetchFullMessage')
                message = await fn(posts[i].post_url)
            }
          }
      }
      if (about_data || check_ins)
        final_output.push({ ...posts[i], ...about_data, check_ins, message })
    } catch (error) {
      console.log(error)
    }
    await page.close()
    page = await context.newPage()
  }
  fetchFlag = false
}

const main = async () => {

  //read first_output.json
  try {
    let first_output_raw = fs.readFileSync('first_output.json')
    first_step_json = JSON.parse(first_output_raw)
    log('loaded first_output.json')
  } catch (error) {
    log('first_output.json file not found')
    process.exit(0)
  }

  //read final_output.json
  try {
    let final_output_raw = fs.readFileSync('final_output.json')
    final_output = JSON.parse(final_output_raw)
  } catch (error) {
    log('previous final_output.json not found, final_output will be created as new')
    final_output = []
  }

  //read cursor data
  try {
    let cursor_raw = fs.readFileSync('cursor.json')
    cursor = JSON.parse(cursor_raw).cursor
    log('last cursor is ' + cursor)
  } catch (error) {
    log('cursor not found, using index 0')
    cursor = 0
  }

  //start scraping
  try {
    browser = await puppeteer.launch({ headless: HEADLESS_MODE, executablePath: '/usr/bin/google-chrome' })
    //disable facebook alerts when logging in
    const context = browser.defaultBrowserContext()
    // context.overridePermissions(FB_URL, ["geolocation", "notifications"])
    let page = await context.newPage()
    await page.setViewport({ width: 800, height: 600 })
    // await page.setRequestInterception(true)
    // const blockResources = [
    //   'image', 'media', 'font', 'textrack', 'object',
    //   'beacon', 'csp_report', 'imageset',
    // ]
    // page.on('request', (request) => {
    //   const rt = request.resourceType()
    //   if (
    //     blockResources.indexOf(rt) > 0 ||
    //     request.url().match(/\.((jpe?g)|png|gif)/) != null
    //   ) {
    //     request.abort()
    //   } else {
    //     request.continue()
    //   }
    // })

    log('Logging in to facebook')
    //login to fb
    await page.goto(FB_URL)
    await page.type('#email', FB_EMAIL)
    await page.type('#pass', FB_PASS)
    await page.click('[name="login"]')
    await delay(4000)

    log('Personal data fetching started')
    let timer = setInterval(async () => {
      if (fetchFlag) {
        //scrolling logic goes here
        // if (rate_limit > 3) {
        //   player.play('warning.mp3', function (err) {

        //   })
        // }
        if (!scrollingStarted && scrapeStart) {
          scrollingStarted = true
          startScraping(context, page)
        }
      } else {
        log('Fetching stopped')
        await browser.close()
        saveData()
        clearTimeout(timer)
      }
    }, 100)
  } catch (error) {
    // console.log(error)
  }
}

const startScraping = async (context, page) => {
  await fetchAuthorPersonalData(context, first_step_json, page)
}

const saveData = () => {
  log('Saving data')
  storeData(final_output, 'final_output.json')
  storeData({ cursor }, 'cursor.json')
}

main()

