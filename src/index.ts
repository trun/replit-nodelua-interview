import express from 'express'
import * as bodyParser from 'body-parser'
const LuaContext = require('node-luajit')

// TODO why do i need to `any` type the LuaState
const sessions: { [session: string]: any } = {}

const app = express()

app.use(bodyParser.json())

app.get('/status', (req, res) => {
  res.status(200).send('OK')
})

app.post('/eval/:session/lua', (req, res) => {
  const session = req.params.session

  let luaContext
  if (session in sessions) {
    luaContext = sessions[session]
  } else {
    luaContext = sessions[session] = new LuaContext()
  }

  luaContext.doString(req.body.code, (err: any, ret: any) => {
    res.status(200).send({
      code: req.body.code,
      session,
      err,
      ret,
    })
  })
})

app.listen(3001, () => {
  console.log("Server started on port 3001!")
})
