import express from 'express'

const app = express()

app.get('/status', (req, res) => {
  res.status(200).send('OK')
})

app.post('/eval/:session/lua', (req, res) => {
  const session = req.params.session

  res.status(200).send({
    session,
  })
})

app.listen(3001, () => {
  console.log("Server started on port 3001!")
})
