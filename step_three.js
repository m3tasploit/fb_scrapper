const json2xls = require('json2xls')
const fs = require('fs')

//export-from-json vars
const fileName = 'final_output_xls'
const exportType = 'xls'

/**
 * @description
 * converts an object to flat form
 * @param {*} arr
 */
const flatten = (arr) => arr.map(elt => {
  const keys = ['overview', 'work_education', 'places_lived', 'contact_basic_info', 'family_relationships', 'details', 'life_events', 'check_ins']
  for (key of keys) {
    if (key in elt) {
      elt[key] = elt[key].join('=>')
    }
  }
  return elt
})

//main function
const main = () => {
  let final_output
  //load final_output.json
  try {
    let final_output_raw = fs.readFileSync('final_output.json')
    final_output = JSON.parse(final_output_raw)
    console.log('loaded final_output.json')
  } catch (error) {
    console.log('final_output.json not found')
  }

  let flattened_json = flatten(final_output)
  const result = json2xls(flattened_json)

  //write result to final_output_xls
  fs.writeFileSync(`${fileName}.xlsx`, result, 'binary')
}

main()