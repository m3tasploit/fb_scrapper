const fs = require('fs')
const chrono = require('chrono-node')
// a library for parsing natural language dates

//convert natural date strings to timestamps
exports.parseDate = (dateString) => {
  if (/^\d*h/i.test(dateString)) {
    dateString = `${dateString} ago`
  }
  if (/^\d*m/i.test(dateString)) {
    const match = dateString.match(/(\d+)/)
    if (match)
      dateString = `${match[0]} minutes ago`
  }
  if (/^\d*d/i.test(dateString)) {
    const match = dateString.match(/(\d+)/)
    if (match)
      dateString = `${match[0]} day ago`
  }
  if (/^\d*s/i.test(dateString)) {
    const match = dateString.match(/(\d+)/)
    if (match)
      dateString = `${match[0]} seconds ago`
  }
  return chrono.parseDate(dateString)
}

exports.storeData = (data, path) => {
  try {
    fs.writeFileSync(path, JSON.stringify(data, null, 2))
  } catch (err) {
    console.error(err)
  }
}

// delay for a given time
const delay = (ms) => new Promise((resolve, reject) => {
  setTimeout(() => resolve(), ms)
})

// scroll the page for given page length
const scrollPage = async (page, pageLength) => {
  let lc = -1
  while (true) {
    lc++
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight)
    })
    await delay(3000)
    if (lc === pageLength) {
      break
    }
  }
}

exports.removeLastPartOfUrl = (the_url) => {
  if (the_url) {
    let the_arr = the_url.split('/')
    the_arr.pop()
    return (the_arr.join('/'))
  } else {
    return null
  }
}

exports.getRandomArbitrary = (min, max) => {
  return Math.random() * (max - min) + min
}

exports.autoScroll = async (page) => {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      let totalHeight = 0
      let distance = 100
      let timer = setInterval(() => {
        let scrollHeight = document.body.scrollHeight
        window.scrollBy(0, distance)
        totalHeight += distance

        if (totalHeight >= scrollHeight) {
          clearInterval(timer)
          resolve()
        }
      }, 100)
    })
  })
}

exports.shuffle = (array) => {
  array.sort(() => Math.random() - 0.5)
}

exports.delay = delay
exports.scrollPage = scrollPage
