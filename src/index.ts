import express from 'express'
import * as bodyParser from 'body-parser'
const LuaContext = require('node-luajit')

type EvalRequest = {
  code: string
}

type EvalResponse = {
  success: true
  objects: Record<Reference, Object>
  value: Value
} | {
  success: false
  error: string
}

type Value = null | Boolean | Number | String | ObjectRef
type Boolean = {
  kind: 'boolean'
  value: boolean
}
type Number = {
  kind: 'number'
  value: number
}
type String = {
  kind: 'string'
  value: string
}
type ObjectRef = {
  kind: 'ref'
  value: Reference
}

type Reference = string
type Key = Value
type Object = {
  members: Array<ObjectMember>
}
type ObjectMember = {
  key: Key
  value: Value
}

// TODO why do i need to `any` type the LuaState
const sessions: { [session: string]: any } = {}

const app = express()

app.use(bodyParser.json())

app.get('/status', (req, res) => {
  res.status(200).send('OK')
})

const retToValue = (ret: any, objects: Record<Reference, Object>): Value => {
  if (typeof ret === 'undefined') {
    return null
  }

  if (typeof ret === 'boolean') {
    return { kind: 'boolean', value: ret }
  }

  if (typeof ret === 'string') {
    return { kind: 'string', value: ret }
  }

  if (typeof ret === 'number') {
    return { kind: 'number', value: ret }
  }

  if (typeof ret === 'object') {
    const refId = JSON.stringify(ret) // TODO should be have better id generation here?
    const members = Object.entries(ret).map(([k, v]) => ({
      key: retToValue(k, objects),
      value: retToValue(v, objects)
    }))

    objects[refId] = {
      members,
    }

    return { kind: 'ref', value: refId }
  }
}

app.post('/eval/:session/lua', (req, res) => {
  const session = req.params.session

  let luaContext
  if (session in sessions) {
    luaContext = sessions[session]
  } else {
    luaContext = sessions[session] = new LuaContext()
  }

  const evalReq: EvalRequest = req.body

  luaContext.doString(evalReq.code, (err: any, ret: any) => {
    try {
      if (err) {
        res.status(200).send({
          success: false,
          error: err,
        })
      } else {
        const objects: Record<Reference, Object> = {}
        const value =  retToValue(ret, objects)
        res.status(200).send({
          success: true,
          objects,
          value,
        })
      }
    } catch (e) {
      console.error('Caught exception evaluating lua return value', e)
      res.status(500).send({
        error: e.message
      })
    }
  })
})

app.listen(3001, () => {
  console.log("Server started on port 3001!")
})
