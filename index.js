require("./lib/log");
require("dotenv").config()

const express = require("express")
const bodyParser = require('body-parser')
const app = express()

app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(require("./routes"))

app.use((err, req, res, next) => {
  var code = Number(err.code) || 500
  var message = err.message || "Unexpected server error"
  console.error(err)
  res.status(code).json({ message })
})

const server = app.listen(
  process.env.PORT,
  () => console.info('Listening on port ' + process.env.PORT)
)