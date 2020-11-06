const puppeteer = require('puppeteer')
const blessed = require('blessed')
const { HEADLESS_MODE, FB_URL, FB_EMAIL, FB_URL_MOBILE, FB_PASS, FB_PAGE_URL, POST_COUNT } = require('./config')
const { delay, parseDate, storeData } = require('./utils')

//flag for stopping fetch
let fetchFlag = true
let scrollingStarted = false

let output = []


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

screen.key(['C-c'], function (ch, key) {
  fetchFlag = false
  saveData()
  return process.exit(0)
})

function status(text) { statusbar.setContent(text); screen.render(); }
function log(text) { body.insertLine(0, text); screen.render(); }
const statusText = 'Press q or esc to stop fetching : Ctrl - C to exit the program'
status(statusText)

const startFetching = async () => {
  try {
    log('Starting fetch')
    const browser = await puppeteer.launch({ headless: HEADLESS_MODE })
    //disable facebook alerts when logging in
    const context = browser.defaultBrowserContext()
    context.overridePermissions(FB_URL_MOBILE, ["geolocation", "notifications"])
    // context.overridePermissions(FB_PAGE_URL, ["geolocation", "notifications"])
    let page = await context.newPage()
    await page.setRequestInterception(true)
    page.on('request', async (req) => {
      if (req.resourceType() == 'media' || req.resourceType() == 'image') {
        await req.abort()
      } else {
        await req.continue()
      }
    })

    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.102 Safari/537.36')
    log('Logging in to facebook')
    //login to fb
    await page.goto(FB_URL_MOBILE)
    await page.type('#m_login_email', FB_EMAIL)
    await page.type('#m_login_password', FB_PASS)
    await page.click('[name="login"]')
    await delay(4000)

    log('Opening fb group')
    //open fb page or group
    await page.goto(FB_PAGE_URL)

    //wait for client render to complete
    await page.waitForSelector('#m_group_stories_container', { timeout: 1000 * 60 })
    await delay(2000)

    log('Scrolling fetch started')
    let timer = setInterval(async () => {
      if (fetchFlag) {
        // if (output.length >= POST_COUNT)
        //   fetchFlag = false
        //scrolling logic goes here
        if (!scrollingStarted) {
          scrollingStarted = true
          startScraping(page)
        }
      } else {
        log('Fetching stopped')
        await browser.close()
        saveData()
        clearTimeout(timer)
      }
    }, 100)
  } catch (error) {

  }
}

const startScraping = async (page) => {
  const cleanup = async (arr) => {
    for (let elt of arr) {
      await elt.dispose()
      elt = null
    }
    arr = null
  }

  try {

    let articles = await page.$$('#m_group_stories_container article[data-store]')

    while (fetchFlag) {
      for (let elt of articles) {
        try {
          let data = await elt.evaluate(async (node, FB_URL) => {
            node.classList.add('to_remove_from_dom')
            let storyContainer = node.children[0]
            let footer = node.children[1]

            let profile_url = storyContainer.firstChild.children[1].querySelector('span strong a').href.split('?')[0].split('/')[3]
            profile_url = `${FB_URL}${profile_url}`
            let posted_by = storyContainer.firstChild.children[1].querySelector('span strong a').innerText
            let post_url = storyContainer.firstChild.children[1].firstChild.firstChild.firstChild.children[1].querySelector('a').href.split('&').splice(0, 2).join('&')
            let time = storyContainer.firstChild.children[1].firstChild.firstChild.firstChild.children[1].querySelector('a').innerText
            //fetch message, time, url from a post node
            let message = storyContainer.children[1].innerText

            //fetch reactions, comments and share count
            let totalReactions = 0, comments, shares

            //fetch total reaction count, comments and shares count
            totalReactions = footer.firstChild.firstChild.firstChild.firstChild.children[0].innerText.match(/\d+\.\d+K|\d+K|\d+/)[0]
            comments = footer.firstChild.firstChild.firstChild.firstChild.children[1].children[0].innerText.match(/\d+\.\d+K|\d+K|\d+/)[0]
            shares = footer.firstChild.firstChild.firstChild.firstChild.children[1].children[1].innerText.match(/\d+\.\d+K|\d+K|\d+/)[0]

            if (totalReactions.includes('K')) {
              totalReactions = totalReactions.replace('K', '')
              totalReactions = parseFloat(totalReactions) * 1000
            } else {
              totalReactions = parseFloat(totalReactions)
            }
            if (!totalReactions)
              totalReactions = 0
            //pattern match numbers in string

            if (shares.includes('K')) {
              shares = shares.replace('K', '')
              shares = parseFloat(shares) * 1000
            } else {
              shares = parseFloat(shares)
            }
            if (!shares)
              shares = 0

            if (comments.includes('K')) {
              comments = comments.replace('K', '')
              comments = parseFloat(comments) * 1000
            } else {
              comments = parseFloat(comments)
            }
            if (!comments)
              comments = 0

            storyContainer = null
            footer = null
            return {
              message, time, post_url,
              posted_by, profile_url,
              totalReactions, comments,
              shares
            }
          }, FB_URL)
          data.time = parseDate(data.time)
          if (data.message && data.post_url && data.profile_url && data.time)
            output.push(data)
          status(`${statusText}\nNo of posts fetched : ${output.length}`)
          data = null
        } catch (error) {
          // console.log(error)
        }
      }
      await page.evaluate(() => {
        document.querySelectorAll('.to_remove_from_dom')
          .forEach(elt => { elt.remove(); elt = null })
      })
      await cleanup(articles)
      articles = null
      articles = await page.$$('#m_group_stories_container article[data-store]')
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight)
      })
      delay(4000)
      await page.evaluate(() => {
        let loadmore = document.querySelector('#m_more_item')
        document.querySelector('#m_group_stories_container').appendChild(loadmore)
        if (document.querySelectorAll('#m_group_stories_container #m_group_stories_container').length > 1) {
          document.querySelector('#m_group_stories_container #m_group_stories_container').remove()
        }
        loadmore = null
      })
    }
  } catch (error) {
    // console.log(error)
  }
}

const saveData = () => {
  log('Saving data')
  storeData(output, 'first_output.json')
}

startFetching()

